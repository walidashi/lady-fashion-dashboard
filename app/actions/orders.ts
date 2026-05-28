'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface CreateOrderPayload {
  order_number: string
  customer_name: string
  mobile: string
  address: string
  products: string
  products_total: number
  shipping_cost: number
  amount_paid: number
  items_count: number
  notes: string
  payment_method: string
}

export async function createOrder(payload: CreateOrderPayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const { error } = await supabase.from('orders').insert({
    ...payload,
    created_by: user.id,
    created_by_name: profile?.full_name ?? '',
    status: 'new',
  })

  if (error) return { error: error.message }
  revalidatePath('/dashboard/employee')
  return { success: true }
}

export async function updateOrder(orderId: string, payload: CreateOrderPayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const { error } = await supabase
    .from('orders')
    .update(payload)
    .eq('id', orderId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/employee')
  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function acceptOrder(orderId: string, estimatedDelivery: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const { error } = await supabase
    .from('orders')
    .update({ status: 'preparing', estimated_delivery: estimatedDelivery })
    .eq('id', orderId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function shipOrder(
  orderId: string,
  shippingCompanyId: string,
  shippingCompanyName: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const { error } = await supabase
    .from('orders')
    .update({
      status: 'shipped',
      shipping_company_id: shippingCompanyId,
      shipping_company_name: shippingCompanyName,
    })
    .eq('id', orderId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function deliverOrder(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const { error } = await supabase
    .from('orders')
    .update({ status: 'delivered' })
    .eq('id', orderId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function cancelOrder(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', orderId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/employee')
  return { success: true }
}

export async function bulkUpdateStatus(orderIds: string[], status: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'غير مصرح' }

  const { error } = await supabase
    .from('orders')
    .update({ status })
    .in('id', orderIds)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/admin')
  return { success: true }
}
