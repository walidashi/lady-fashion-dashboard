export type Role = 'employee' | 'admin'

export type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'ready' | 'shipped' | 'returned' | 'delivered' | 'cancelled'

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
  is_returned: boolean
  shopify_order_gid?: string | null
  shopify_order_name?: string | null
  shopify_customer_gid?: string | null
  delivered_at?: string | null
  refused_at?: string | null
  customer_email?: string | null
  customer_city?: string | null
  estimated_delivery: string | null
  shipping_company_id: string | null
  shipping_company_name: string | null
  source: string | null
  created_by: string
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface Customer {
  phone: string
  name: string
  address: string
  total_orders: number
  delivered_count: number
  returned_count: number
  cancelled_count: number
  total_spent: number
  first_order_at: string | null
  last_order_at: string | null
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
  confirmed: 'مؤكد',
  preparing: 'جاري التجهيز',
  ready: 'جاهز',
  shipped: 'مشحون',
  returned: 'مرتجع',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
}

export const STATUS_COLORS: Record<OrderStatus, string> = {
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  confirmed: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  preparing: 'bg-orange-100 text-orange-800 border-orange-200',
  ready: 'bg-teal-100 text-teal-800 border-teal-200',
  shipped: 'bg-purple-100 text-purple-800 border-purple-200',
  returned: 'bg-amber-100 text-amber-800 border-amber-200',
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

export type SyncTarget = 'shopify_deliver' | 'shopify_cancel' | 'meta_delivered'
export type SyncState = 'pending' | 'running' | 'done' | 'error' | 'skipped' | 'dry_run' | 'test'

export interface OrderSyncRow {
  id: string
  order_id: string
  target: SyncTarget
  state: SyncState
  message: string | null
  attempts: number
  updated_at: string
}

export const SYNC_TARGET_LABELS: Record<SyncTarget, string> = {
  shopify_deliver: 'Shopify · تسليم ودفع',
  shopify_cancel:  'Shopify · إلغاء',
  meta_delivered:  'Meta · DeliveredPurchase',
}

export const SYNC_STATE_LABELS: Record<SyncState, string> = {
  pending: 'قيد الانتظار', running: 'جاري التنفيذ', done: 'تم', error: 'خطأ',
  skipped: 'تم التخطي', dry_run: 'تجربة فقط', test: 'تم (اختبار Meta)',
}

export const SYNC_STATE_COLORS: Record<SyncState, string> = {
  pending: 'bg-blue-50 text-blue-700 border-blue-200',
  running: 'bg-blue-50 text-blue-700 border-blue-200',
  done:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  error:   'bg-red-50 text-red-700 border-red-200',
  skipped: 'bg-gray-50 text-gray-500 border-gray-200',
  dry_run: 'bg-violet-50 text-violet-700 border-violet-200',
  test:    'bg-amber-50 text-amber-700 border-amber-200',
}
