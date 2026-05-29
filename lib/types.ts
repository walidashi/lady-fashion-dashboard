export type Role = 'employee' | 'admin'

export type OrderStatus = 'new' | 'preparing' | 'shipped' | 'delivered' | 'cancelled'

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
  shipped: 'مشحون',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
}

export const STATUS_COLORS: Record<OrderStatus, string> = {
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  preparing: 'bg-orange-100 text-orange-800 border-orange-200',
  shipped: 'bg-purple-100 text-purple-800 border-purple-200',
  delivered: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
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
