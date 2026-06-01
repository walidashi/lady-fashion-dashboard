export type Role = 'employee' | 'admin'

export type OrderStatus = 'new' | 'preparing' | 'ready' | 'shipped' | 'delivered' | 'cancelled'

export type OrderType = 'تسليم' | 'استرجاع' | 'استبدال'

export interface Profile {
  id: string
  full_name: string
  role: Role
  created_at: string
}

export interface ShippingCompany {
  id: string
  name: string
}

export interface Order {
  id: string
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
  status: OrderStatus
  order_type: OrderType
  returned_products: string | null
  returned_products_total: number
  migrated: boolean
  estimated_delivery: string | null
  shipping_company_id: string | null
  shipping_company_name: string | null
  source: string | null
  created_by: string
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface ProductItem {
  name: string
  color: string
  size: string
  price: number
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'جديد',
  preparing: 'جاري التجهيز',
  ready: 'جاهز',
  shipped: 'مشحون',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
}

export const STATUS_COLORS: Record<OrderStatus, string> = {
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  preparing: 'bg-orange-100 text-orange-800 border-orange-200',
  ready: 'bg-teal-100 text-teal-800 border-teal-200',
  shipped: 'bg-purple-100 text-purple-800 border-purple-200',
  delivered: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
}

export const ORDER_TYPE_COLORS: Record<OrderType, string> = {
  'تسليم':   'bg-gray-100 text-gray-700 border-gray-200',
  'استرجاع': 'bg-red-100 text-red-700 border-red-200',
  'استبدال': 'bg-amber-100 text-amber-700 border-amber-200',
}

export const PAYMENT_METHODS = [
  'الدفع عند الاستلام',
  'تحويل بنكي',
  'أونلاين',
  'مدفوع مسبقاً',
]

export function formatProductItems(items: ProductItem[]): string {
  return items
    .map(
      (item) =>
        `${item.name}\nاللون ${item.color}\nالمقاس ${item.size}\nالسعر ${item.price}`
    )
    .join('\n\n')
}

export function parseProductItems(text: string | null | undefined): ProductItem[] {
  if (!text || text === '-') return [{ name: '', color: '', size: '', price: 0 }]
  const blocks = text.trim().split(/\n\n+/).filter(Boolean)
  const parsed = blocks.map(block => {
    const lines = block.split('\n').map(l => l.trim())
    return {
      name:  lines[0] || '',
      color: (lines[1] || '').replace(/^اللون\s*/, ''),
      size:  (lines[2] || '').replace(/^المقاس\s*/, ''),
      price: parseFloat((lines[3] || '').replace(/^السعر\s*/, '')) || 0,
    }
  }).filter(p => p.name)
  return parsed.length > 0 ? parsed : [{ name: '', color: '', size: '', price: 0 }]
}
