// Shopify + Meta sync engine. Server-only: import from server actions and
// route handlers only. Every external write goes through runTarget(), which
// claims an order_sync row first so nothing can run twice.
import { createClient as createSupabaseAdmin, SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { metaConfigured, shopifyConfigured } from './config'
import { maskPhone, normalizeEgPhone } from './phone'
import * as shopify from './shopify'
import { buildDeliveredEvent, sendEvent } from './meta'

export type SyncTarget = 'shopify_deliver' | 'shopify_cancel' | 'meta_delivered'
export type SyncState = 'pending' | 'running' | 'done' | 'error' | 'skipped' | 'dry_run' | 'test'

export const SYNC_TARGETS: SyncTarget[] = ['shopify_deliver', 'shopify_cancel', 'meta_delivered']

/** Which dashboard statuses each target belongs to. */
const TRIGGER: Record<SyncTarget, readonly string[]> = {
  shopify_deliver: ['delivered'],
  meta_delivered: ['delivered'],
  shopify_cancel: ['returned', 'cancelled'],
}

export function targetsForStatus(status: string): SyncTarget[] {
  return SYNC_TARGETS.filter(t => TRIGGER[t].includes(status))
}

export function adminDb(): SupabaseClient {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

interface OrderRow {
  id: string
  order_number: string
  status: string
  mobile: string
  total: number
  customer_name: string | null
  customer_email?: string | null
  customer_city?: string | null
  shopify_order_gid: string | null
  shopify_order_name: string | null
  shopify_customer_gid: string | null
  delivered_at: string | null
  refused_at: string | null
  updated_at: string
}

const isLinked = (o: Pick<OrderRow, 'shopify_order_gid' | 'shopify_order_name'>) =>
  !!(o.shopify_order_gid || o.shopify_order_name)

// ── Settings, logging, state ────────────────────────────────────────────────

export async function isDryRun(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.from('app_settings').select('value').eq('key', 'sync_dry_run').maybeSingle()
  if (error || !data) return true // fail safe: if unsure, don't send
  return data.value !== false
}

async function log(db: SupabaseClient, order: Pick<OrderRow, 'id' | 'order_number'>, target: SyncTarget,
  action: string, ok: boolean, message: string, dryRun = false) {
  await db.from('integration_logs').insert({
    order_id: order.id, order_number: order.order_number,
    target, action, ok, dry_run: dryRun, message: message.slice(0, 1000),
  })
}

async function finish(db: SupabaseClient, orderId: string, target: SyncTarget, state: SyncState,
  message: string, details?: Record<string, unknown>) {
  const patch: Record<string, unknown> = { state, message: message.slice(0, 1000), updated_at: new Date().toISOString() }
  if (details) patch.details = details
  await db.from('order_sync').update(patch).eq('order_id', orderId).eq('target', target)
}

// ── Shopify link resolution ──────────────────────────────────────────────────

class NotLinked extends Error {}

async function resolveGid(db: SupabaseClient, order: OrderRow): Promise<string> {
  if (order.shopify_order_gid) return order.shopify_order_gid
  if (!order.shopify_order_name) throw new NotLinked('Not a Shopify order')
  const ref = await shopify.findOrderByName(order.shopify_order_name)
  if (!ref) throw new shopify.ShopifyError(`No Shopify order found with number ${order.shopify_order_name}`, 'user')
  await db.from('orders').update({
    shopify_order_gid: ref.gid,
    shopify_order_name: ref.name,
    ...(order.shopify_customer_gid ? {} : { shopify_customer_gid: ref.customerGid }),
  }).eq('id', order.id)
  order.shopify_order_gid = ref.gid
  order.shopify_order_name = ref.name
  order.shopify_customer_gid = order.shopify_customer_gid ?? ref.customerGid
  return ref.gid
}

// ── Dry-run descriptions ─────────────────────────────────────────────────────

function describe(order: OrderRow, target: SyncTarget): string {
  const ref = order.shopify_order_name ?? order.shopify_order_gid ?? '?'
  if (target === 'shopify_deliver') {
    return `Would fulfil open fulfillment orders (notifyCustomer=false) on Shopify ${ref}, then orderMarkAsPaid`
  }
  if (target === 'shopify_cancel') {
    const reason = order.status === 'returned' ? 'DECLINED' : 'CUSTOMER'
    return `Would orderCancel Shopify ${ref}: reason=${reason}, restock=true, refund=none, notifyCustomer=false`
  }
  const deliveredAt = new Date(order.delivered_at ?? order.updated_at)
  const built = buildDeliveredEvent({
    shopifyOrderGid: order.shopify_order_gid ?? 'gid://shopify/Order/0',
    shopifyOrderName: order.shopify_order_name ?? '?',
    shopifyCustomerGid: order.shopify_customer_gid,
    phone: order.mobile, amountCollected: Number(order.total), deliveredAt,
    customerName: order.customer_name, email: order.customer_email, city: order.customer_city,
  })
  if (!built.ok) return `Would NOT send to Meta: ${built.reason}`
  const notes = [
    order.shopify_order_gid ? null : 'Shopify ID looked up first',
    order.customer_email && order.customer_city ? null : 'email/city added from Shopify if readable',
  ].filter(Boolean)
  const linkNote = notes.length ? ` (${notes.join('; ')})` : ''
  return `Would send DeliveredPurchase${linkNote}: ${built.summary} phone=${maskPhone(normalizeEgPhone(order.mobile))}`
}

// ── Target runners ───────────────────────────────────────────────────────────

async function runShopifyDeliver(db: SupabaseClient, order: OrderRow): Promise<[SyncState, string]> {
  const gid = await resolveGid(db, order)
  const st = await shopify.getOrderState(gid)
  if (st.cancelledAt) {
    throw new shopify.ShopifyError(
      `${st.name} is cancelled in Shopify, so it can't be fulfilled or marked paid. ` +
      'Manual step: Shopify can\'t un-cancel an order. If it really was delivered, record the sale in Shopify by hand (e.g. a new draft order marked paid).',
      'user')
  }

  const steps: string[] = []
  const open = st.fulfillmentOrders.filter(f => f.status === 'OPEN' || f.status === 'IN_PROGRESS')
  const blocked = st.fulfillmentOrders.filter(f => f.status === 'ON_HOLD' || f.status === 'SCHEDULED')

  if (open.length === 0 && blocked.length > 0) {
    throw new shopify.ShopifyError(
      `${st.name} has a fulfillment order that is ${blocked.map(b => b.status).join('/')}. ` +
      'Manual step: release the hold (or mark it ready) in Shopify, then press retry.', 'user')
  }
  for (const fo of open) {
    await shopify.fulfillFulfillmentOrder(fo.id)
    await log(db, order, 'shopify_deliver', 'fulfillmentCreate', true, `Fulfilled ${fo.id} on ${st.name}`)
    steps.push('fulfilled')
  }
  if (open.length === 0) steps.push('already fulfilled')

  if (st.canMarkAsPaid) {
    await shopify.markOrderAsPaid(gid)
    await log(db, order, 'shopify_deliver', 'orderMarkAsPaid', true, `Marked ${st.name} paid`)
    steps.push('marked paid')
  } else if (st.displayFinancialStatus === 'PAID') {
    steps.push('already paid')
  } else {
    throw new shopify.ShopifyError(
      `Shopify won't mark ${st.name} as paid (financial status: ${st.displayFinancialStatus ?? 'unknown'}). ` +
      'Manual step: open the order in Shopify and record the cash payment.', 'user')
  }
  return ['done', `${st.name}: ${steps.join(', ')}`]
}

async function runShopifyCancel(db: SupabaseClient, order: OrderRow, details: Record<string, unknown>): Promise<[SyncState, string, Record<string, unknown>?]> {
  const gid = await resolveGid(db, order)
  const reason: shopify.CancelReason = order.status === 'returned' ? 'DECLINED' : 'CUSTOMER'
  const tag = order.status === 'returned' ? 'refused' : 'dashboard-cancelled'

  const st = await shopify.getOrderState(gid)
  if (st.cancelledAt) return ['done', `${st.name} is cancelled in Shopify`, {}]

  let jobId = typeof details.jobId === 'string' ? details.jobId : null

  // A previous run already started a cancellation: never start a second one.
  if (!jobId) {
    try {
      jobId = await shopify.cancelOrder(gid, reason, `Dashboard ${order.order_number}: ${order.status === 'returned' ? 'refused on delivery' : 'cancelled before shipping'}`)
      await log(db, order, 'shopify_cancel', 'orderCancel', true, `Cancellation started for ${st.name} (reason ${reason})`)
    } catch (e) {
      if (!(e instanceof shopify.ShopifyError) || e.kind !== 'user') throw e
      return await cancelFallback(db, order, gid, st, tag, e.message)
    }
  }

  // Cancellation is a background job in Shopify. Wait briefly for it.
  for (let i = 0; i < 5 && jobId; i++) {
    if (await shopify.isJobDone(jobId)) break
    await new Promise(r => setTimeout(r, 1500))
  }
  const latest = await shopify.getOrderState(gid)
  if (latest.cancelledAt) return ['done', `${latest.name} cancelled in Shopify (reason ${reason}, restocked)`, {}]

  if (jobId && !(await shopify.isJobDone(jobId))) {
    return ['pending', `Shopify is still processing the cancellation of ${latest.name}. Press retry in a minute to confirm.`, { jobId }]
  }
  // Job finished but the order isn't cancelled: Shopify refused it.
  return await cancelFallback(db, order, gid, latest, tag, 'Shopify finished the cancellation job but the order is still open')
}

async function cancelFallback(db: SupabaseClient, order: OrderRow, gid: string, st: shopify.ShopifyOrderState,
  tag: string, why: string): Promise<[SyncState, string, Record<string, unknown>]> {
  let tagged = false
  try {
    await shopify.addTags(gid, [tag])
    tagged = true
    await log(db, order, 'shopify_cancel', 'tagsAdd', true, `Tagged ${st.name} "${tag}"`)
  } catch (e) {
    await log(db, order, 'shopify_cancel', 'tagsAdd', false, e instanceof Error ? e.message : String(e))
  }
  const fulfilled = /FULFILLED/.test(st.displayFulfillmentStatus)
  const manual = fulfilled
    ? 'Manual step: the order is fulfilled in Shopify. Open it in Shopify admin and use More actions → Cancel order; if Shopify blocks that, restock the items yourself and leave the order tagged.'
    : 'Manual step: open the order in Shopify admin and cancel it by hand (reason: declined, restock, no refund, don\'t notify).'
  throw new shopify.ShopifyError(
    `Shopify would not cancel ${st.name}: ${why}.${tagged ? ` Tagged it "${tag}".` : ''} ${manual}`, 'user')
}

async function runMeta(db: SupabaseClient, order: OrderRow): Promise<[SyncState, string]> {
  if (!order.shopify_order_gid) {
    if (!shopifyConfigured()) throw new Error('Order has only a Shopify number; Shopify must be configured to look up its ID first')
    await resolveGid(db, order)
  }
  // Older orders and hand-entered ones don't have email/city stored yet.
  if ((!order.customer_email || !order.customer_city) && shopifyConfigured()) {
    const contact = await shopify.getOrderContact(order.shopify_order_gid!)
    const patch: Record<string, string> = {}
    if (!order.customer_email && contact.email) patch.customer_email = order.customer_email = contact.email
    if (!order.customer_city && contact.city) patch.customer_city = order.customer_city = contact.city
    if (Object.keys(patch).length) await db.from('orders').update(patch).eq('id', order.id)
  }
  const built = buildDeliveredEvent({
    shopifyOrderGid: order.shopify_order_gid!,
    shopifyOrderName: order.shopify_order_name ?? '',
    shopifyCustomerGid: order.shopify_customer_gid,
    phone: order.mobile,
    customerName: order.customer_name,
    email: order.customer_email,
    city: order.customer_city,
    amountCollected: Number(order.total),
    deliveredAt: new Date(order.delivered_at ?? order.updated_at),
  })
  if (!built.ok) {
    if (built.skip) {
      await log(db, order, 'meta_delivered', 'skip', true, built.reason)
      return ['skipped', built.reason]
    }
    throw new Error(built.reason)
  }
  const res = await sendEvent(built.event)
  const masked = maskPhone(normalizeEgPhone(order.mobile))
  await log(db, order, 'meta_delivered', res.test ? 'send_test' : 'send', true,
    `${built.summary} phone=${masked}${res.fbtraceId ? ` fbtrace=${res.fbtraceId}` : ''}`)
  return res.test
    ? ['test', `Sent to Test Events only (${built.summary}). It will be sent live on retry once META_TEST_EVENT_CODE is removed.`]
    : ['done', `Sent ${built.summary}`]
}

// ── Public entry points ──────────────────────────────────────────────────────

export interface RunResult { state: SyncState; message: string }

/** Runs one target for one order. Safe to call any number of times. */
export async function runTarget(orderId: string, target: SyncTarget): Promise<RunResult> {
  const db = adminDb()
  const { data: order } = await db.from('orders').select('*').eq('id', orderId).maybeSingle<OrderRow>()
  if (!order) return { state: 'skipped', message: 'Order not found' }

  const { data: claimed, error: claimErr } = await db.rpc('claim_order_sync', { p_order_id: orderId, p_target: target })
  if (claimErr) return { state: 'error', message: `Sync tables missing? Run add_shopify_meta_sync.sql (${claimErr.message})` }
  if (!claimed) {
    const { data: row } = await db.from('order_sync').select('state, message').eq('order_id', orderId).eq('target', target).single()
    return { state: (row?.state ?? 'done') as SyncState, message: row?.state === 'done' ? 'Already done' : 'Already running' }
  }
  const { data: row } = await db.from('order_sync').select('details').eq('order_id', orderId).eq('target', target).single()
  const details = (row?.details ?? {}) as Record<string, unknown>

  const done = async (state: SyncState, message: string, d?: Record<string, unknown>) => {
    await finish(db, orderId, target, state, message, d)
    return { state, message }
  }

  // The order's status may have changed since this run was scheduled.
  if (!TRIGGER[target].includes(order.status)) {
    return done('skipped', `Status is now "${order.status}", so this was not run`)
  }
  if (!isLinked(order)) return done('skipped', 'Not a Shopify order')

  if (await isDryRun(db)) {
    const message = describe(order, target)
    await log(db, order, target, 'dry_run', true, message, true)
    return done('dry_run', message)
  }

  const isShopify = target !== 'meta_delivered'
  if (isShopify && !shopifyConfigured()) {
    return done('error', 'Shopify is not configured: set SHOPIFY_STORE_DOMAIN and a token (see the sync page)')
  }
  if (!isShopify && !metaConfigured()) {
    return done('error', 'Meta is not configured: set META_DATASET_ID and META_CAPI_TOKEN')
  }

  try {
    if (target === 'shopify_deliver') {
      const [state, message] = await runShopifyDeliver(db, order)
      return done(state, message)
    }
    if (target === 'shopify_cancel') {
      const [state, message, d] = await runShopifyCancel(db, order, details)
      return done(state, message, d)
    }
    const [state, message] = await runMeta(db, order)
    return done(state, message)
  } catch (e) {
    if (e instanceof NotLinked) return done('skipped', e.message)
    const message = e instanceof Error ? e.message : String(e)
    await log(db, order, target, 'error', false, message)
    return done('error', message)
  }
}

async function runMany(jobs: { orderId: string; target: SyncTarget }[], concurrency = 4) {
  let i = 0
  const worker = async () => {
    while (i < jobs.length) {
      const job = jobs[i++]
      await runTarget(job.orderId, job.target).catch(() => {})
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))
}

export interface StatusChange { id: string; from: string | null; to: string }

const REVERSAL_NOTE: Record<SyncTarget, string> = {
  shopify_cancel: 'it was already cancelled in Shopify. Shopify won\'t un-cancel it automatically; fix it by hand in Shopify if needed',
  shopify_deliver: 'it was already fulfilled and marked paid in Shopify. Undo that by hand in Shopify if needed',
  meta_delivered: 'Meta already received a DeliveredPurchase for it, which can\'t be withdrawn',
}

/**
 * Call after any status write. Records delivered/refused times, clears stale
 * sync rows, schedules the new syncs to run after the response, and returns
 * warnings for changes that Shopify/Meta can't follow automatically.
 */
export async function afterStatusChange(changes: StatusChange[]): Promise<string[]> {
  const real = changes.filter(c => c.from !== c.to)
  if (!real.length) return []
  const db = adminDb()
  const now = new Date().toISOString()

  const ids = (to: string) => real.filter(c => c.to === to).map(c => c.id)
  if (ids('delivered').length) await db.from('orders').update({ delivered_at: now }).in('id', ids('delivered'))
  if (ids('returned').length) await db.from('orders').update({ refused_at: now }).in('id', ids('returned'))

  const allIds = real.map(c => c.id)
  const [{ data: orders }, { data: rows }] = await Promise.all([
    db.from('orders').select('id, order_number, shopify_order_gid, shopify_order_name').in('id', allIds),
    db.from('order_sync').select('order_id, target, state').in('order_id', allIds),
  ])
  if (!orders) return []
  const byId = new Map(orders.map(o => [o.id, o]))

  const warnings: string[] = []
  const stale: { order_id: string; target: string }[] = []
  const jobs: { orderId: string; target: SyncTarget }[] = []

  for (const c of real) {
    const order = byId.get(c.id)
    if (!order) continue
    const wanted = targetsForStatus(c.to)

    for (const r of (rows ?? []).filter(r => r.order_id === c.id)) {
      const target = r.target as SyncTarget
      if (wanted.includes(target)) continue
      if (r.state === 'done') {
        warnings.push(`${order.order_number}: status changed to "${c.to}", but ${REVERSAL_NOTE[target]}.`)
      } else if (r.state !== 'skipped') {
        stale.push({ order_id: c.id, target })
      }
    }
    if (isLinked(order)) wanted.forEach(target => jobs.push({ orderId: c.id, target }))
  }

  for (const s of stale) {
    await db.from('order_sync')
      .update({ state: 'skipped', message: 'Status changed before this ran', details: {}, updated_at: now })
      .eq('order_id', s.order_id).eq('target', s.target).neq('state', 'running')
  }

  if (jobs.length) after(() => runMany(jobs))
  return warnings
}
