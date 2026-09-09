'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Order } from '@/lib/types'
import { fetchAllOrders } from '@/lib/orders'
import { generateReportExcel } from '@/lib/excel'
import { formatCurrency } from '@/lib/utils'
import {
  Package, Banknote, TrendingUp, TrendingDown, RotateCcw, CheckCircle,
  Truck, Calendar, FileDown, Printer, Users, Tag, Minus, Leaf, Megaphone,
} from 'lucide-react'

// ── Period helpers ───────────────────────────────────────────────────────────

type PresetKey = 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom'

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today',     label: 'اليوم' },
  { key: 'last7',     label: 'آخر ٧ أيام' },
  { key: 'last30',    label: 'آخر ٣٠ يوم' },
  { key: 'thisMonth', label: 'هذا الشهر' },
  { key: 'lastMonth', label: 'الشهر الماضي' },
  { key: 'custom',    label: 'مخصص' },
]

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function endOfDay(d: Date)   { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }

function resolvePeriod(preset: PresetKey, customFrom: string, customTo: string): { from: Date; to: Date } | null {
  const now = new Date()
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) }
    case 'last7': {
      const f = new Date(now); f.setDate(now.getDate() - 6)
      return { from: startOfDay(f), to: endOfDay(now) }
    }
    case 'last30': {
      const f = new Date(now); f.setDate(now.getDate() - 29)
      return { from: startOfDay(f), to: endOfDay(now) }
    }
    case 'thisMonth':
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) }
    case 'lastMonth':
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to:   endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
      }
    case 'custom':
      if (!customFrom || !customTo) return null
      return { from: startOfDay(new Date(customFrom)), to: endOfDay(new Date(customTo)) }
  }
}

/** The equal-length window immediately preceding [from, to]. */
function previousPeriod(from: Date, to: Date): { from: Date; to: Date } {
  const span = to.getTime() - from.getTime()
  const prevTo = new Date(from.getTime() - 1)
  return { from: new Date(prevTo.getTime() - span), to: prevTo }
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Stats ────────────────────────────────────────────────────────────────────

interface PeriodStats {
  orders: Order[]
  count: number
  grossValue: number
  delivered: number; deliveredValue: number
  returned: number;  returnedValue: number
  cancelled: number; cancelledValue: number
  returnsCount: number; returnsValue: number
  resolved: number
  inTransit: number
  successRate: number | null
  returnRate: number | null
  avgOrderValue: number
  collected: number
}

const sumTotal = (list: Order[]) => list.reduce((s, o) => s + Number(o.total), 0)

function computeStats(orders: Order[]): PeriodStats {
  const delivered = orders.filter(o => o.status === 'delivered')
  const returned  = orders.filter(o => o.status === 'returned')
  const cancelled = orders.filter(o => o.status === 'cancelled')

  const resolved     = delivered.length + returned.length + cancelled.length
  const returnsCount = returned.length + cancelled.length
  const grossValue   = sumTotal(orders)

  return {
    orders,
    count: orders.length,
    grossValue,
    delivered: delivered.length, deliveredValue: sumTotal(delivered),
    returned:  returned.length,  returnedValue:  sumTotal(returned),
    cancelled: cancelled.length, cancelledValue: sumTotal(cancelled),
    returnsCount,                returnsValue:   sumTotal(returned) + sumTotal(cancelled),
    resolved,
    inTransit: orders.length - resolved,
    successRate: resolved ? Math.round((delivered.length / resolved) * 100) : null,
    returnRate:  resolved ? Math.round((returnsCount / resolved) * 100) : null,
    avgOrderValue: orders.length ? Math.round(grossValue / orders.length) : 0,
    collected: orders.reduce((s, o) => s + Number(o.amount_paid), 0),
  }
}

// ── Delta badge ──────────────────────────────────────────────────────────────

function Delta({ current, previous, higherIsBetter = true, points = false }: {
  current: number | null; previous: number | null
  higherIsBetter?: boolean; points?: boolean
}) {
  if (current == null || previous == null) return null
  if (previous === 0 && current === 0) return null

  const diff = current - previous
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400 font-medium">
        <Minus className="w-3 h-3" /> ثابت
      </span>
    )
  }

  // Rates compare as percentage points; counts and money as relative change.
  const magnitude = points
    ? `${Math.abs(diff)} نقطة`
    : previous === 0
      ? 'جديد'
      : `${Math.abs(Math.round((diff / previous) * 100))}%`

  const good = higherIsBetter ? diff > 0 : diff < 0
  const Icon = diff > 0 ? TrendingUp : TrendingDown

  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${good ? 'text-emerald-600' : 'text-red-500'}`}>
      <Icon className="w-3 h-3" />
      {magnitude}
    </span>
  )
}

// ── Shared shells ────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  border: '1px solid rgba(0,0,0,0.08)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
}

function Section({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl p-5" style={CARD}>
      <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Icon className="w-4 h-4 text-pink-500" />
        {title}
      </h2>
      {children}
    </div>
  )
}

function EmptyRow() {
  return <p className="text-xs text-gray-400 italic py-2">لا توجد بيانات في هذه الفترة</p>
}

// ── Product parsing ──────────────────────────────────────────────────────────

function topProducts(orders: Order[], n = 10): [string, number][] {
  const counts: Record<string, number> = {}
  orders.forEach(o => {
    (o.products ?? '').split(/\n\n+/).forEach(block => {
      const name = block.split('\n')[0]?.trim()
      if (name) counts[name] = (counts[name] || 0) + 1
    })
  })
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n)
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const [preset, setPreset] = useState<PresetKey>('last30')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    fetchAllOrders(supabase).then(all => { setAllOrders(all); setLoading(false) })
  }, [supabase])

  const period = resolvePeriod(preset, customFrom, customTo)
  const fromMs = period?.from.getTime()
  const toMs   = period?.to.getTime()

  const { current, previous } = useMemo(() => {
    if (fromMs == null || toMs == null) return { current: null, previous: null }
    const inRange = (o: Order, a: number, b: number) => {
      const t = new Date(o.created_at).getTime()
      return t >= a && t <= b
    }
    const prev = previousPeriod(new Date(fromMs), new Date(toMs))
    const prevFrom = prev.from.getTime()
    const prevTo   = prev.to.getTime()
    return {
      current:  computeStats(allOrders.filter(o => inRange(o, fromMs, toMs))),
      previous: computeStats(allOrders.filter(o => inRange(o, prevFrom, prevTo))),
    }
  }, [allOrders, fromMs, toMs])

  // ── Breakdowns ─────────────────────────────────────────────────────────────

  const courierRows = useMemo(() => {
    if (!current) return []
    const map = new Map<string, { name: string; total: number; delivered: number; returns: number; deliveredValue: number; returnsValue: number }>()
    for (const o of current.orders) {
      const name = o.shipping_company_name
      if (!name) continue
      const row = map.get(name) ?? { name, total: 0, delivered: 0, returns: 0, deliveredValue: 0, returnsValue: 0 }
      row.total++
      if (o.status === 'delivered') { row.delivered++; row.deliveredValue += Number(o.total) }
      if (o.status === 'returned' || o.status === 'cancelled') { row.returns++; row.returnsValue += Number(o.total) }
      map.set(name, row)
    }
    return Array.from(map.values())
      .map(r => {
        const resolved = r.delivered + r.returns
        return { ...r, resolved, successRate: resolved ? Math.round((r.delivered / resolved) * 100) : null }
      })
      .sort((a, b) => b.total - a.total)
  }, [current])

  const dailyRows = useMemo(() => {
    if (!current || fromMs == null || toMs == null) return []
    const map = new Map<string, { count: number; value: number }>()
    for (const o of current.orders) {
      const key = dayKey(new Date(o.created_at))
      const row = map.get(key) ?? { count: 0, value: 0 }
      row.count++
      row.value += Number(o.total)
      map.set(key, row)
    }
    // Fill every day in the range so gaps read as real zeros, not missing bars.
    const out: { date: string; count: number; value: number }[] = []
    const cursor = new Date(fromMs)
    const end = new Date(toMs)
    while (cursor <= end) {
      const key = dayKey(cursor)
      const row = map.get(key) ?? { count: 0, value: 0 }
      out.push({ date: key, ...row })
      cursor.setDate(cursor.getDate() + 1)
    }
    return out
  }, [current, fromMs, toMs])

  const sourceRows = useMemo(() => {
    if (!current) return []
    return ['اورجانيك', 'ممول'].map(src => {
      const list = current.orders.filter(o => o.source === src)
      const delivered = list.filter(o => o.status === 'delivered').length
      const returns   = list.filter(o => o.status === 'returned' || o.status === 'cancelled').length
      const resolved  = delivered + returns
      return {
        src,
        count: list.length,
        value: sumTotal(list),
        returnRate: resolved ? Math.round((returns / resolved) * 100) : null,
      }
    }).filter(r => r.count > 0)
  }, [current])

  const employeeRows = useMemo(() => {
    if (!current) return []
    const map = new Map<string, { name: string; count: number; value: number; delivered: number }>()
    for (const o of current.orders) {
      const name = o.created_by_name || 'غير محدد'
      const row = map.get(name) ?? { name, count: 0, value: 0, delivered: 0 }
      row.count++
      row.value += Number(o.total)
      if (o.status === 'delivered') row.delivered++
      map.set(name, row)
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [current])

  const products = useMemo(() => (current ? topProducts(current.orders) : []), [current])

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = () => {
    if (!current || !period) return
    generateReportExcel({
      from: period.from,
      to: period.to,
      summary: {
        count: current.count,
        grossValue: current.grossValue,
        delivered: current.delivered,
        deliveredValue: current.deliveredValue,
        returns: current.returnsCount,
        returnsValue: current.returnsValue,
        inTransit: current.inTransit,
        successRate: current.successRate,
        returnRate: current.returnRate,
        avgOrderValue: current.avgOrderValue,
        collected: current.collected,
      },
      couriers: courierRows.map(c => ({
        name: c.name, total: c.total, delivered: c.delivered,
        returns: c.returns, successRate: c.successRate,
      })),
      sources: sourceRows,
      employees: employeeRows,
      products,
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">جاري التحميل...</p>
      </div>
    )
  }

  const periodLabel = period
    ? `${period.from.toLocaleDateString('ar-EG')} — ${period.to.toLocaleDateString('ar-EG')}`
    : 'اختر تاريخ البداية والنهاية'

  const maxDaily = Math.max(1, ...dailyRows.map(d => d.count))
  const maxProduct = products[0]?.[1] || 1

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">التقارير</h1>
          <p className="text-sm text-gray-500 mt-0.5">{periodLabel}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            onClick={handleExport}
            disabled={!current || current.count === 0}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">تصدير Excel</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">طباعة</span>
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="bg-white rounded-xl p-4 flex flex-col gap-3 print:hidden" style={CARD}>
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                preset === p.key ? 'bg-pink-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex gap-2 items-center border-t border-gray-50 pt-3 flex-wrap">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-400">من:</span>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="text-xs rounded-md px-2 py-1.5 bg-gray-100 text-gray-700 border-0 focus:ring-1 focus:ring-pink-400 outline-none" />
            <span className="text-xs text-gray-400">إلى:</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="text-xs rounded-md px-2 py-1.5 bg-gray-100 text-gray-700 border-0 focus:ring-1 focus:ring-pink-400 outline-none" />
          </div>
        )}
      </div>

      {!current ? (
        <div className="bg-white rounded-xl p-16 text-center" style={CARD}>
          <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">اختر تاريخ البداية والنهاية لعرض التقرير</p>
        </div>
      ) : current.count === 0 ? (
        <div className="bg-white rounded-xl p-16 text-center" style={CARD}>
          <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">لا توجد طلبات في هذه الفترة</p>
        </div>
      ) : (
        <>
          {/* Core KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Total orders */}
            <div className="bg-white rounded-xl p-5" style={CARD}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Package className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-gray-900">{current.count}</p>
                    <Delta current={current.count} previous={previous!.count} />
                  </div>
                  <p className="text-xs text-gray-500">إجمالي الطلبات</p>
                </div>
              </div>
              <div className="border-t border-gray-50 pt-2.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">القيمة الإجمالية</span>
                  <span className="font-bold text-gray-900">{formatCurrency(current.grossValue)}</span>
                </div>
              </div>
            </div>

            {/* Success */}
            <div className="bg-white rounded-xl p-5" style={CARD}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-emerald-600">
                      {current.successRate == null ? '—' : `${current.successRate}%`}
                    </p>
                    <Delta current={current.successRate} previous={previous!.successRate} points />
                  </div>
                  <p className="text-xs text-gray-500">معدل النجاح</p>
                </div>
              </div>
              <div className="border-t border-gray-50 pt-2.5 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">عدد الطلبات</span>
                  <span className="font-semibold text-gray-900">{current.delivered} طلب</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">القيمة</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(current.deliveredValue)}</span>
                </div>
              </div>
            </div>

            {/* Returns */}
            <div className="bg-white rounded-xl p-5" style={CARD}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <RotateCcw className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-amber-600">
                      {current.returnRate == null ? '—' : `${current.returnRate}%`}
                    </p>
                    <Delta current={current.returnRate} previous={previous!.returnRate} higherIsBetter={false} points />
                  </div>
                  <p className="text-xs text-gray-500">معدل المرتجع</p>
                </div>
              </div>
              <div className="border-t border-gray-50 pt-2.5 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">عدد الطلبات</span>
                  <span className="font-semibold text-gray-900">{current.returnsCount} طلب</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">القيمة</span>
                  <span className="font-bold text-amber-600">{formatCurrency(current.returnsValue)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-gray-400 pt-0.5">
                  <span>مرتجع {current.returned}</span>
                  <span>ملغي {current.cancelled}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Money row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'صافي الإيرادات', hint: 'من الطلبات المسلّمة', value: formatCurrency(current.deliveredValue),
                cur: current.deliveredValue, prev: previous!.deliveredValue, icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'إجمالي المحصل', hint: 'المبالغ المدفوعة', value: formatCurrency(current.collected),
                cur: current.collected, prev: previous!.collected, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'متوسط قيمة الطلب', hint: '', value: formatCurrency(current.avgOrderValue),
                cur: current.avgOrderValue, prev: previous!.avgOrderValue, icon: Tag, color: 'text-pink-600', bg: 'bg-pink-50' },
              { label: 'قيد التنفيذ', hint: 'لم تُحسم بعد', value: String(current.inTransit),
                cur: null, prev: null, icon: Truck, color: 'text-purple-600', bg: 'bg-purple-50' },
            ].map(({ label, hint, value, cur, prev, icon: Icon, color, bg }) => (
              <div key={label} className="bg-white rounded-xl p-4" style={CARD}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-base font-bold text-gray-900 truncate">{value}</p>
                      <Delta current={cur} previous={prev} />
                    </div>
                    <p className="text-xs text-gray-500 leading-tight">{label}</p>
                    {hint && <p className="text-[10px] text-gray-400 leading-tight">{hint}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Daily chart */}
          <Section title="الأداء اليومي" icon={Calendar}>
            {dailyRows.length === 0 ? <EmptyRow /> : (
              <div className="overflow-x-auto">
                <div className="flex items-end gap-1 min-w-full" style={{ height: '140px' }}>
                  {dailyRows.map(d => (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group" style={{ minWidth: '6px' }}>
                      <div
                        className="w-full bg-pink-400 group-hover:bg-pink-600 rounded-t transition-colors"
                        style={{ height: `${Math.max(2, (d.count / maxDaily) * 100)}%` }}
                        title={`${new Date(d.date).toLocaleDateString('ar-EG')} — ${d.count} طلب — ${formatCurrency(d.value)}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-gray-400">
                  <span>{new Date(dailyRows[0].date).toLocaleDateString('ar-EG')}</span>
                  <span>ذروة {maxDaily} طلب/يوم</span>
                  <span>{new Date(dailyRows[dailyRows.length - 1].date).toLocaleDateString('ar-EG')}</span>
                </div>
              </div>
            )}
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Couriers */}
            <Section title="أداء شركات الشحن" icon={Truck}>
              {courierRows.length === 0 ? <EmptyRow /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-100">
                        <th className="text-right font-medium pb-2">الشركة</th>
                        <th className="text-right font-medium pb-2">الطلبات</th>
                        <th className="text-right font-medium pb-2">نجاح</th>
                        <th className="text-right font-medium pb-2">مرتجع</th>
                        <th className="text-right font-medium pb-2">المعدل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {courierRows.map(c => (
                        <tr key={c.name}>
                          <td className="py-2 text-gray-800 text-xs font-medium">{c.name}</td>
                          <td className="py-2 text-gray-600 text-xs">{c.total}</td>
                          <td className="py-2 text-emerald-600 text-xs font-semibold">{c.delivered}</td>
                          <td className="py-2 text-amber-600 text-xs font-semibold">{c.returns}</td>
                          <td className="py-2 text-xs font-bold">
                            {c.successRate == null ? <span className="text-gray-300">—</span> : (
                              <span className={c.successRate >= 70 ? 'text-emerald-600' : c.successRate >= 50 ? 'text-amber-600' : 'text-red-500'}>
                                {c.successRate}%
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Sources */}
            <Section title="حسب المصدر" icon={Megaphone}>
              {sourceRows.length === 0 ? <EmptyRow /> : (
                <div className="space-y-3">
                  {sourceRows.map(s => (
                    <div key={s.src} className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {s.src === 'اورجانيك'
                          ? <Leaf className="w-4 h-4 text-emerald-500" />
                          : <Megaphone className="w-4 h-4 text-blue-500" />}
                        <span className="text-sm text-gray-700">{s.src}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500">{s.count} طلب</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(s.value)}</span>
                        <span className={`font-bold ${
                          s.returnRate == null ? 'text-gray-300'
                            : s.returnRate <= 20 ? 'text-emerald-600'
                            : s.returnRate <= 40 ? 'text-amber-600' : 'text-red-500'
                        }`}>
                          {s.returnRate == null ? '—' : `${s.returnRate}% مرتجع`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Employees */}
            <Section title="أداء الموظفين" icon={Users}>
              {employeeRows.length === 0 ? <EmptyRow /> : (
                <div className="space-y-2.5">
                  {employeeRows.map(e => (
                    <div key={e.name} className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-gray-700 text-xs">{e.name}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500">{e.count} طلب</span>
                        <span className="text-emerald-600">{e.delivered} مسلّم</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(e.value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Products */}
            <Section title="أكثر المنتجات مبيعاً" icon={Package}>
              {products.length === 0 ? <EmptyRow /> : (
                <div className="space-y-2">
                  {products.map(([name, count]) => (
                    <div key={name}>
                      <div className="flex items-center justify-between text-xs mb-1 gap-2">
                        <span className="text-gray-700 truncate flex-1">{name}</span>
                        <span className="font-bold text-gray-900 flex-shrink-0">{count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-pink-400 rounded-full" style={{ width: `${(count / maxProduct) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
