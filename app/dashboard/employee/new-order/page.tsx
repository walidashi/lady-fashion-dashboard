import { getInventory, InventoryProduct } from '@/lib/inventory'
import NewOrderForm from './NewOrderForm'

export default async function NewOrderPage() {
  let inventoryProducts: InventoryProduct[] = []
  try {
    inventoryProducts = await getInventory()
  } catch {
    // fall through — form works in manual mode
  }
  return <NewOrderForm inventoryProducts={inventoryProducts} />
}
