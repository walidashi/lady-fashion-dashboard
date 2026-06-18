import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OrderStatusLog } from '@/lib/types'
import LogsView from './LogsView'

export default async function LogsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'admin') redirect('/dashboard/employee')

  const { data: logs } = await supabase
    .from('order_status_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)

  return <LogsView logs={(logs ?? []) as OrderStatusLog[]} />
}
