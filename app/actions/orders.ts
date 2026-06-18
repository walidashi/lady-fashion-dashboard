'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getActorName(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('full_name').eq('id', userId).single()
  return data?.full_name ?? ''
}

async function logChange(params: {
  orderId: string
  orderNumber: string
  fromStatus: string | null
  toStatus: string
  userId: string
  userName: string
  note?: string
}) {
  const admin = adminClient()
  await admin.from('order_status_logs').insert({
    order_id: params.orderId,
    order_number: params.orderNumber,
    from_status: params.fromStatus,
    to_status: params.toStatus,
    changed_by: params.userId,
    changed_by_name: params.userName,
    note: params.note ?? null,
  })
}

async function fetchOrderMeta(orderId: string) {
  const admin = adminClient()
  const { data } = await admin
    .from('orders')
    .select('order_number, status')
    .eq('id', orderId)
    .single()
  return data as { order_number: string; status: string } | null
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getNextOrderNumber(prefix: string): Promise<string> {
  const supabase = adminClient()
  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .ilike('order_number', `${prefix}%`)

  let max = 0
  for (const row of data ?? []) {
    const num = parseInt(row.order_number.replace(/^[A-Za-z]+/, ''), 10)
    if (!isNaN(num) && num > max) max = num
  }
  return `${prefix}${max + 1}`
}

export interface CreateOrderPayload {
  order_number: string
  customer_name: string
  mobile: string
  address: string
  products: string
  products_total: number
  shipping_cost: number
  total: number
  amount_paid: number
  remaining: number
  items_count: number
  notes: string
  payment_method: string
  source: string
  order_type: string
  returned_products: string | null
  returned_products_total: number
}

export async function createOrder(payload: CreateOrderPayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  const userName = profile?.full_name ?? ''

  const { data: inserted, error } = await supabase
    .from('orders')
    .insert({ ...payload, created_by: user.id, created_by_name: userName, status: 'new' })
    .select('id, order_number')
    .single()

  if (error) return { error: error.message }

  await logChange({
    orderId: inserted.id, orderNumber: inserted.order_number,
    fromStatus: null, toStatus: 'new',
    userId: user.id, userName,
  })

  revalidatePath('/dashboard/employee')
  return { success: true }
}

export async function updateOrder(orderId: string, payload: CreateOrderPayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const { error } = await supabase.from('orders').update(payload).eq('id', orderId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/employee')
  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function acceptOrder(orderId: string, estimatedDelivery: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const [meta, userName] = await Promise.all([
    fetchOrderMeta(orderId),
    getActorName(supabase, user.id),
  ])

  const { error } = await supabase
    .from('orders')
    .update({ status: 'preparing', estimated_delivery: estimatedDelivery })
    .eq('id', orderId)

  if (error) return { error: error.message }

  if (meta) await logChange({ orderId, orderNumber: meta.order_number, fromStatus: meta.status, toStatus: 'preparing', userId: user.id, userName })

  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function setMigrated(orderId: string, migrated: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const { error } = await supabase.from('orders').update({ migrated }).eq('id', orderId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function markOrderReady(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const [meta, userName] = await Promise.all([
    fetchOrderMeta(orderId),
    getActorName(supabase, user.id),
  ])

  const { error } = await supabase.from('orders').update({ status: 'ready' }).eq('id', orderId)

  if (error) return { error: error.message }

  if (meta) await logChange({ orderId, orderNumber: meta.order_number, fromStatus: meta.status, toStatus: 'ready', userId: user.id, userName })

  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function shipOrder(orderId: string, shippingCompanyId: string, shippingCompanyName: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const [meta, userName] = await Promise.all([
    fetchOrderMeta(orderId),
    getActorName(supabase, user.id),
  ])

  const { error } = await supabase
    .from('orders')
    .update({ status: 'shipped', shipping_company_id: shippingCompanyId, shipping_company_name: shippingCompanyName })
    .eq('id', orderId)

  if (error) return { error: error.message }

  if (meta) await logChange({ orderId, orderNumber: meta.order_number, fromStatus: meta.status, toStatus: 'shipped', userId: user.id, userName, note: shippingCompanyName })

  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function deliverOrder(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const [meta, userName] = await Promise.all([
    fetchOrderMeta(orderId),
    getActorName(supabase, user.id),
  ])

  const { error } = await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId)

  if (error) return { error: error.message }

  if (meta) await logChange({ orderId, orderNumber: meta.order_number, fromStatus: meta.status, toStatus: 'delivered', userId: user.id, userName })

  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function cancelOrder(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const [meta, userName] = await Promise.all([
    fetchOrderMeta(orderId),
    getActorName(supabase, user.id),
  ])

  const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)

  if (error) return { error: error.message }

  if (meta) await logChange({ orderId, orderNumber: meta.order_number, fromStatus: meta.status, toStatus: 'cancelled', userId: user.id, userName })

  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/employee')
  return { success: true }
}

export interface ImportOrderRow {
  order_number: string
  customer_name: string
  mobile: string
  address: string
  products: string
  products_total: number
  shipping_cost: number
  total: number
  amount_paid: number
  remaining: number
  items_count: number
  notes: string
  payment_method: string
  status: string
}

export async function bulkImportOrders(rows: ImportOrderRow[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'غير مصرح' }

  const admin = adminClient()
  const toInsert = rows.map(row => ({
    ...row,
    source: 'اورجانيك',
    order_type: 'تسليم',
    returned_products: null,
    returned_products_total: 0,
    created_by: user.id,
    created_by_name: profile?.full_name ?? '',
  }))

  const { error } = await admin
    .from('orders')
    .upsert(toInsert, { onConflict: 'order_number', ignoreDuplicates: true })

  if (error) return { error: error.message }
  revalidatePath('/dashboard/admin')
  return { success: true, count: toInsert.length }
}

export async function bulkShipOrders(orderIds: string[], companyId: string, companyName: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const admin = adminClient()
  const [{ data: ordersData }, userName] = await Promise.all([
    admin.from('orders').select('id, order_number, status').in('id', orderIds),
    getActorName(supabase, user.id),
  ])

  const { error } = await supabase
    .from('orders')
    .update({ status: 'shipped', shipping_company_id: companyId, shipping_company_name: companyName })
    .in('id', orderIds)

  if (error) return { error: error.message }

  if (ordersData?.length) {
    await admin.from('order_status_logs').insert(
      ordersData.map(o => ({
        order_id: o.id, order_number: o.order_number,
        from_status: o.status, to_status: 'shipped',
        changed_by: user.id, changed_by_name: userName,
        note: companyName,
      }))
    )
  }

  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function revertOrdersSnapshot(
  snapshots: Array<{ id: string; status: string; shipping_company_id: string | null; shipping_company_name: string | null }>
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const admin = adminClient()
  const [{ data: currentOrders }, userName] = await Promise.all([
    admin.from('orders').select('id, order_number, status').in('id', snapshots.map(s => s.id)),
    getActorName(supabase, user.id),
  ])

  const { error } = await admin.from('orders').upsert(
    snapshots.map(s => ({
      id: s.id, status: s.status,
      shipping_company_id: s.shipping_company_id,
      shipping_company_name: s.shipping_company_name,
    })),
    { onConflict: 'id' }
  )

  if (error) return { error: error.message }

  if (currentOrders?.length) {
    const targetMap = new Map(snapshots.map(s => [s.id, s.status]))
    await admin.from('order_status_logs').insert(
      currentOrders.map(o => ({
        order_id: o.id, order_number: o.order_number,
        from_status: o.status, to_status: targetMap.get(o.id) ?? o.status,
        changed_by: user.id, changed_by_name: userName,
        note: 'تراجع',
      }))
    )
  }

  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function bulkUpdateStatus(orderIds: string[], status: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const admin = adminClient()
  const [{ data: ordersData }, userName] = await Promise.all([
    admin.from('orders').select('id, order_number, status').in('id', orderIds),
    getActorName(supabase, user.id),
  ])

  const { error } = await supabase.from('orders').update({ status }).in('id', orderIds)

  if (error) return { error: error.message }

  if (ordersData?.length) {
    await admin.from('order_status_logs').insert(
      ordersData.map(o => ({
        order_id: o.id, order_number: o.order_number,
        from_status: o.status, to_status: status,
        changed_by: user.id, changed_by_name: userName,
      }))
    )
  }

  revalidatePath('/dashboard/admin')
  return { success: true }
}
