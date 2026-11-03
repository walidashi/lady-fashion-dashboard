'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminDb, isDryRun, runTarget, SyncTarget, SYNC_TARGETS, targetsForStatus } from '@/lib/sync/engine'
import { backfillEnabled, getSyncConfigStatus, shopifyConfigured, SyncConfigStatus } from '@/lib/sync/config'
import { normalizeEgPhone } from '@/lib/sync/phone'
import { listOrdersForMatching } from '@/lib/sync/shopify'

async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'غير مصرح'
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? null : 'غير مصرح'
}

// ── Overview ─────────────────────────────────────────────────────────────────

export interface SyncOverview {
  config: SyncConfigStatus
  dryRun: boolean
  migrated: boolean
  counts: Record<string, number>
}

export async function getSyncOverview(): Promise<{ error?: string; data?: SyncOverview }> {
  const denied = await requireAdmin()
  if (denied) return { error: denied }
  const db = adminDb()
  const { data: rows, error } = await db.from('order_sync').select('state')
  const counts: Record<string, number> = {}
  for (const r of rows ?? []) counts[r.state] = (counts[r.state] ?? 0) + 1
  return {
    data: {
      config: getSyncConfigStatus(),
      dryRun: await isDryRun(db),
      migrated: !error,
      counts,
    },
  }
}

export async function setDryRun(value: boolean) {
  const denied = await requireAdmin()
  if (denied) return { error: denied }
  const { error } = await adminDb().from('app_settings')
    .upsert({ key: 'sync_dry_run', value, updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/admin/sync')
  return { success: true }
}

// ── Retry ────────────────────────────────────────────────────────────────────

export async function retrySync(orderId: string, target: SyncTarget) {
  const denied = await requireAdmin()
  if (denied) return { error: denied }
  if (!SYNC_TARGETS.includes(target)) return { error: 'Unknown target' }
  const result = await runTarget(orderId, target)
  revalidatePath('/dashboard/admin')
  return { success: true, result }
}

/** Starts the syncs an order's current status calls for (e.g. after linking it). */
export async function syncOrderNow(orderId: string) {
  const denied = await requireAdmin()
  if (denied) return { error: denied }
  const { data: order } = await adminDb().from('orders').select('status').eq('id', orderId).maybeSingle()
  if (!order) return { error: 'Order not found' }
  const results = []
  for (const target of targetsForStatus(order.status)) results.push({ target, ...(await runTarget(orderId, target)) })
  return { success: true, results }
}

/**
 * Runs up to `limit` unfinished rows (pending / error / dry-run / test).
 * The page calls it repeatedly until `remaining` is 0, so no single request
 * runs long enough to time out.
 */
export async function runUnfinishedBatch(states: string[], limit = 8) {
  const denied = await requireAdmin()
  if (denied) return { error: denied }
  const allowed = states.filter(s => ['pending', 'error', 'dry_run', 'test'].includes(s))
  if (!allowed.length) return { error: 'Nothing selected' }
  const db = adminDb()
  const { data: rows, count } = await db.from('order_sync')
    .select('order_id, target', { count: 'exact' })
    .in('state', allowed).order('updated_at', { ascending: true }).limit(limit)
  const results = []
  for (const r of rows ?? []) {
    results.push({ ...r, ...(await runTarget(r.order_id, r.target as SyncTarget)) })
  }
  // A row that re-fails keeps its state, so report what's left, not a re-count.
  return { success: true, processed: results.length, total: count ?? 0, results }
}

// ── Refused phones CSV ───────────────────────────────────────────────────────

export async function exportRefusedPhones(fromIso: string, toIso: string) {
  const denied = await requireAdmin()
  if (denied) return { error: denied }
  const db = adminDb()
  const phones = new Set<string>()
  let orders = 0
  let invalid = 0
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('orders').select('mobile')
      .eq('status', 'returned').gte('refused_at', fromIso).lte('refused_at', toIso)
      .range(from, from + 999)
    if (error) return { error: error.message }
    for (const o of data ?? []) {
      orders++
      const p = normalizeEgPhone(o.mobile)
      if (p) phones.add(p)
      else invalid++
    }
    if (!data || data.length < 1000) break
  }
  const csv = ['phone', ...Array.from(phones)].join('\n') + '\n'
  return { success: true, csv, orders, unique: phones.size, invalid }
}

// ── Backfill (Shopify only) ──────────────────────────────────────────────────

export interface BackfillRow {
  orderId: string
  orderNumber: string
  status: string
  createdAt: string
  total: number
  link: 'linked' | 'matched' | 'ambiguous' | 'none'
  shopifyName: string | null
  shopifyGid: string | null
  customerGid: string | null
  action: string
  syncState: string | null
}

const ACTION_LABEL: Record<string, string> = {
  delivered: 'Fulfil + mark paid',
  returned: 'Cancel (DECLINED, restock)',
  cancelled: 'Cancel (CUSTOMER, restock)',
}

export async function backfillPreview(fromIso: string, toIso: string) {
  const denied = await requireAdmin()
  if (denied) return { error: denied }
  if (!backfillEnabled()) return { error: 'Backfill is off. Set SYNC_BACKFILL_ENABLED=true to use it.' }
  if (!shopifyConfigured()) return { error: 'Shopify is not configured' }

  const db = adminDb()
  const { data: orders, error } = await db.from('orders')
    .select('id, order_number, status, created_at, total, mobile, shopify_order_gid, shopify_order_name, shopify_customer_gid')
    .in('status', ['delivered', 'returned', 'cancelled'])
    .gte('created_at', fromIso).lte('created_at', toIso)
    .order('created_at', { ascending: true })
    .limit(2000)
  if (error) return { error: error.message }

  const ids = (orders ?? []).map(o => o.id)
  const { data: syncRows } = ids.length
    ? await db.from('order_sync').select('order_id, target, state').in('order_id', ids)
    : { data: [] }
  const stateOf = (orderId: string, status: string) => {
    const target = targetsForStatus(status).find(t => t !== 'meta_delivered')
    return syncRows?.find(r => r.order_id === orderId && r.target === target)?.state ?? null
  }

  // Only SH orders came from Shopify; hand-entered ones are linked by number.
  const unlinked = (orders ?? []).filter(o => !o.shopify_order_gid && !o.shopify_order_name && o.order_number.startsWith('SH'))

  const matches = new Map<string, { gid: string; name: string; customerGid: string | null } | 'ambiguous'>()
  let warning: string | null = null
  if (unlinked.length) {
    const pad = 2 * 86_400_000
    let candidates
    try {
      candidates = await listOrdersForMatching(
        new Date(new Date(fromIso).getTime() - pad).toISOString(),
        new Date(new Date(toIso).getTime() + pad).toISOString(),
      )
    } catch (e) {
      return { error: `Couldn't list Shopify orders for matching: ${e instanceof Error ? e.message : e}` }
    }
    if (Date.now() - new Date(fromIso).getTime() > 60 * 86_400_000) {
      warning = 'Shopify only lets this app read the last 60 days of orders, so older SH orders will show as "no match".'
    }

    const { data: taken } = await db.from('orders').select('shopify_order_gid').not('shopify_order_gid', 'is', null)
    const takenGids = new Set((taken ?? []).map(t => t.shopify_order_gid))
    const pool = candidates.filter(c => !takenGids.has(c.gid))

    const fits = (o: typeof unlinked[number], c: typeof pool[number]) => {
      const phone = normalizeEgPhone(o.mobile)
      return !!phone
        && c.phones.some(p => normalizeEgPhone(p) === phone)
        && Math.abs(c.total - Number(o.total)) <= 1
        && Math.abs(new Date(c.createdAt).getTime() - new Date(o.created_at).getTime()) <= pad
    }
    for (const o of unlinked) {
      const hits = pool.filter(c => fits(o, c))
      // One-to-one only: the Shopify order must also fit no other dashboard order.
      if (hits.length === 1 && unlinked.filter(other => fits(other, hits[0])).length === 1) {
        matches.set(o.id, { gid: hits[0].gid, name: hits[0].name, customerGid: hits[0].customerGid })
      } else if (hits.length > 1) {
        matches.set(o.id, 'ambiguous')
      }
    }
  }

  const rows: BackfillRow[] = (orders ?? []).flatMap((o): BackfillRow[] => {
    const base = {
      orderId: o.id, orderNumber: o.order_number, status: o.status, createdAt: o.created_at,
      total: Number(o.total), action: ACTION_LABEL[o.status] ?? '—', syncState: stateOf(o.id, o.status),
    }
    if (o.shopify_order_gid || o.shopify_order_name) {
      return [{ ...base, link: 'linked' as const, shopifyName: o.shopify_order_name, shopifyGid: o.shopify_order_gid, customerGid: o.shopify_customer_gid }]
    }
    if (!o.order_number.startsWith('SH')) return [] // hand-entered, never on Shopify
    const m = matches.get(o.id)
    if (m && m !== 'ambiguous') return [{ ...base, link: 'matched' as const, shopifyName: m.name, shopifyGid: m.gid, customerGid: m.customerGid }]
    return [{ ...base, link: (m === 'ambiguous' ? 'ambiguous' : 'none') as BackfillRow['link'], shopifyName: null, shopifyGid: null, customerGid: null }]
  })

  return { success: true, rows, warning, dryRun: await isDryRun(db) }
}

/** Links matched orders and runs their Shopify sync. Called in small chunks. */
export async function backfillRun(items: { orderId: string; shopifyGid: string | null; shopifyName: string | null; customerGid: string | null }[]) {
  const denied = await requireAdmin()
  if (denied) return { error: denied }
  if (!backfillEnabled()) return { error: 'Backfill is off' }
  if (items.length > 20) return { error: 'Send at most 20 orders per call' }

  const db = adminDb()
  const results: { orderId: string; state: string; message: string }[] = []
  for (const item of items) {
    const { data: order } = await db.from('orders')
      .select('id, status, shopify_order_gid, shopify_order_name').eq('id', item.orderId).maybeSingle()
    if (!order) { results.push({ orderId: item.orderId, state: 'skipped', message: 'Order not found' }); continue }

    if (!order.shopify_order_gid && !order.shopify_order_name && item.shopifyGid) {
      const { error } = await db.from('orders').update({
        shopify_order_gid: item.shopifyGid, shopify_order_name: item.shopifyName, shopify_customer_gid: item.customerGid,
      }).eq('id', order.id).is('shopify_order_gid', null)
      if (error) { results.push({ orderId: order.id, state: 'error', message: `Couldn't link: ${error.message}` }); continue }
    }

    // Shopify only: Meta won't accept events this old.
    const target = targetsForStatus(order.status).find(t => t !== 'meta_delivered')
    if (!target) { results.push({ orderId: order.id, state: 'skipped', message: `Nothing to do for "${order.status}"` }); continue }
    const r = await runTarget(order.id, target)
    results.push({ orderId: order.id, state: r.state, message: r.message })
  }
  return { success: true, results }
}
