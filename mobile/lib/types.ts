export type Role = 'employee' | 'admin'

export type OrderStatus = 'new' | 'preparing' | 'ready' | 'shipped' | 'delivered' | 'cancelled'

export type OrderType = 'تسليم' | 'استرجاع' | 'استبدال'

export interface Profile {
  id: string
  full_name: string
  role: Role
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
  estimated_delivery: string | null
  shipping_company_id: string | null
  shipping_company_name: string | null
  source: string | null
  created_by: string
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface ShippingCompany {
  id: string
  name: string
}

export interface OrderStatusLog {
  id: string
  order_id: string
  order_number: string
  from_status: string | null
  to_status: string
  changed_by: string | null
  changed_by_name: string
  note: string | null
  created_at: string
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

export const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  new:       { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe' },
  preparing: { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa' },
  ready:     { bg: '#ccfbf1', text: '#0f766e', border: '#99f6e4' },
  shipped:   { bg: '#f3e8ff', text: '#7c3aed', border: '#e9d5ff' },
  delivered: { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
  cancelled: { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' },
}

export const PAYMENT_METHODS = [
  'الدفع عند الاستلام',
  'تحويل بنكي',
  'أونلاين',
  'مدفوع مسبقاً',
]

export function formatProductItems(items: ProductItem[]): string {
  return items
    .map(item => `${item.name}\nاللون ${item.color}\nالمقاس ${item.size}\nالسعر ${item.price}`)
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
