import * as XLSX from 'xlsx'
import { Order, STATUS_LABELS } from './types'

export function generateShippingExcel(orders: Order[], filename?: string): void {
  const wb = XLSX.utils.book_new()

  const headers = [
    'حالة الاوردرات',
    'طريقة الدفع',
    'ملاحظات',
    'عدد القطع',
    'الباقي',
    'المبلغ المدفوع',
    'اجمالي',
    'شحن',
    'اجمالي المنتجات',
    'المنتجات',
    'العنوان',
    'رقم موبايل',
    'الاسم',
    'رقم الاوردر',
  ]

  const rows = orders.map((order, index) => [
    STATUS_LABELS[order.status] ?? order.status,
    order.payment_method,
    order.notes || '-',
    order.items_count,
    Number(order.remaining),
    Number(order.amount_paid),
    Number(order.total),
    Number(order.shipping_cost),
    Number(order.products_total),
    order.products,
    order.address,
    order.mobile,
    order.customer_name,
    order.order_number,
  ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  ws['!cols'] = [
    { wch: 18 },
    { wch: 22 },
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 10 },
    { wch: 18 },
    { wch: 45 },
    { wch: 55 },
    { wch: 18 },
    { wch: 22 },
    { wch: 15 },
  ]

  // RTL sheet view
  ws['!views'] = [{ rightToLeft: true }]

  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, filename ?? `LadyFashion_${date}.xlsx`)
}
