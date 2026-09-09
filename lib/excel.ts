import * as XLSX from 'xlsx'
import { Order, STATUS_LABELS } from './types'

export function generateShippingExcel(orders: Order[], filename?: string): void {
  const wb = XLSX.utils.book_new()

  const headers = [
    'نوع الطلب',
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

  const rows = orders.map((order) => [
    order.order_type || 'تسليم',
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
    { wch: 14 },
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

// ── Period report export ─────────────────────────────────────────────────────

export interface ReportPayload {
  from: Date
  to: Date
  summary: {
    count: number
    grossValue: number
    delivered: number
    deliveredValue: number
    returns: number
    returnsValue: number
    inTransit: number
    successRate: number | null
    returnRate: number | null
    avgOrderValue: number
    collected: number
  }
  couriers: { name: string; total: number; delivered: number; returns: number; successRate: number | null }[]
  sources: { src: string; count: number; value: number; returnRate: number | null }[]
  employees: { name: string; count: number; value: number; delivered: number }[]
  products: [string, number][]
}

export function generateReportExcel(r: ReportPayload, filename?: string): void {
  const wb = XLSX.utils.book_new()
  const d = (x: Date) => x.toLocaleDateString('ar-EG')
  const rate = (n: number | null) => (n == null ? '—' : `${n}%`)

  const rows: (string | number)[][] = [
    ['تقرير الفترة'],
    ['من', d(r.from), 'إلى', d(r.to)],
    [],
    ['الملخص'],
    ['إجمالي الطلبات', r.summary.count],
    ['القيمة الإجمالية', r.summary.grossValue],
    ['متوسط قيمة الطلب', r.summary.avgOrderValue],
    ['إجمالي المحصل', r.summary.collected],
    [],
    ['معدل النجاح', rate(r.summary.successRate)],
    ['الطلبات المسلّمة', r.summary.delivered],
    ['قيمة المسلّم', r.summary.deliveredValue],
    [],
    ['معدل المرتجع', rate(r.summary.returnRate)],
    ['الطلبات المرتجعة والملغاة', r.summary.returns],
    ['قيمة المرتجع', r.summary.returnsValue],
    [],
    ['قيد التنفيذ', r.summary.inTransit],
  ]

  if (r.couriers.length) {
    rows.push([], ['أداء شركات الشحن'], ['الشركة', 'الطلبات', 'مسلّم', 'مرتجع', 'المعدل'])
    r.couriers.forEach(c => rows.push([c.name, c.total, c.delivered, c.returns, rate(c.successRate)]))
  }

  if (r.sources.length) {
    rows.push([], ['حسب المصدر'], ['المصدر', 'الطلبات', 'القيمة', 'معدل المرتجع'])
    r.sources.forEach(s => rows.push([s.src, s.count, s.value, rate(s.returnRate)]))
  }

  if (r.employees.length) {
    rows.push([], ['أداء الموظفين'], ['الموظف', 'الطلبات', 'مسلّم', 'القيمة'])
    r.employees.forEach(e => rows.push([e.name, e.count, e.delivered, e.value]))
  }

  if (r.products.length) {
    rows.push([], ['أكثر المنتجات مبيعاً'], ['المنتج', 'عدد القطع'])
    r.products.forEach(([name, count]) => rows.push([name, count]))
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  ws['!views'] = [{ rightToLeft: true }]

  XLSX.utils.book_append_sheet(wb, ws, 'Report')

  const stamp = r.from.toISOString().slice(0, 10) + '_' + r.to.toISOString().slice(0, 10)
  XLSX.writeFile(wb, filename ?? `LadyFashion_Report_${stamp}.xlsx`)
}
