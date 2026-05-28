import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Order } from '@/lib/types'
import EditOrderForm from './EditOrderForm'

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single()

  if (!order) redirect('/dashboard')

  const backHref = profile?.role === 'admin' ? '/dashboard/admin' : '/dashboard/employee'

  return <EditOrderForm order={order as Order} backHref={backHref} />
}
