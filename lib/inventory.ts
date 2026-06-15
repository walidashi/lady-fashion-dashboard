const ENDPOINT = 'https://lady-fashion-app-production.up.railway.app/api/public/inventory'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export interface InventoryVariant {
  id: number
  color: string
  size: string
  warehouse_qty: number
  haram_qty: number
  total_qty: number
}

export interface InventoryProduct {
  id: number
  name: string
  code: string
  sale_price: number
  cost_price: number
  total_qty: number
  variants: InventoryVariant[]
}

interface Cache {
  data: InventoryProduct[]
  fetchedAt: number
}

let _cache: Cache | null = null

export async function getInventory(): Promise<InventoryProduct[]> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.data
  }

  const apiKey = process.env.INVENTORY_API_KEY
  if (!apiKey) {
    throw new Error('INVENTORY_API_KEY environment variable is not set')
  }

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      headers: { 'X-API-Key': apiKey },
      cache: 'no-store',
    })
  } catch (err) {
    throw new Error(`Inventory API network error: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!response.ok) {
    throw new Error(`Inventory API returned ${response.status}: ${response.statusText}`)
  }

  const data: InventoryProduct[] = await response.json()
  _cache = { data, fetchedAt: Date.now() }
  return data
}

export async function getProductStock(productCode: string): Promise<number | null> {
  if (!productCode) return null
  const inventory = await getInventory()
  const product = inventory.find(p => p.code === productCode)
  return product?.total_qty ?? null
}

export async function getVariantStock(
  productCode: string,
  color: string,
  size: string
): Promise<number> {
  const inventory = await getInventory()
  const product = inventory.find(p => p.code === productCode)
  if (!product) return 0
  const variant = product.variants.find(
    v => v.color.trim() === color.trim() && v.size.trim() === size.trim()
  )
  return variant?.total_qty ?? 0
}
