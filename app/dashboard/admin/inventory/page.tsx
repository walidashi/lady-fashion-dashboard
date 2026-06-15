import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getInventory, InventoryProduct } from '@/lib/inventory'
import InventoryView from './InventoryView'

export default async function InventoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let products: InventoryProduct[] = []
  let fetchError: string | null = null

  try {
    products = await getInventory()
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'فشل تحميل بيانات المخزون'
  }

  return <InventoryView products={products} error={fetchError} />
}
