import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getInventory, getLocations, InventoryProduct, InventoryLocation } from '@/lib/inventory'
import InventoryView from './InventoryView'

export default async function InventoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let products: InventoryProduct[] = []
  let locations: InventoryLocation[] = []
  let fetchError: string | null = null

  try {
    ;[products, locations] = await Promise.all([getInventory(), getLocations()])
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'فشل تحميل بيانات المخزون'
  }

  return <InventoryView products={products} locations={locations} error={fetchError} />
}
