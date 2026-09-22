'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Customer, Order } from '@/lib/types'
import { customerRank, CustomerRank, fetchAllCustomers, RANK_META, successRate } from '@/lib/customers'
import OrderStatusBadge from '@/components/OrderStatusBadge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Users, UserPlus, Repeat, Search, X, AlertTriangle, Percent } from 'lucide-react'

const CARD: React.CSSProperties = {
  border: '1px solid rgba(0,0,0,0.08)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
}

type Segment = 'all' | 'one' | 'returning'
type SortKey = 'recent' | 'orders' | 'spent' | 'worst'

const RANK_ORDER: CustomerRank[] = ['excellent', 'good', 'bad', 'new']
const PAGE_SIZE = 100

export default function CustomersPage() {
  const supabase = useMemo(() => createClient(), [])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [rankFilter, setRankFilter] = useState<CustomerRank | 'all'>('all')
  const [segment, setSegment] = useState<Segment>('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const [selected, setSelected] = useState<Customer | null>(null)
  const [history, setHistory] = useState<Order[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    fetchAllCustomers(supabase).then(({ data, error }) => {
      setCustomers(data)
      setLoadError(error)
      setLoading(false)
    })
  }, [supabase])

  // Rank is derived, never stored, so changing the thresholds never needs a migration.
  const ranked = useMemo(
    () => customers.map(c => ({ ...c, rank: customerRank(c), rate: successRate(c) })),
    [customers]
  )

  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const at = (s: string | null) => (s ? new Date(s).getTime() : 0)

    const newThisMonth = ranked.filter(c => at(c.first_order_at) >= monthStart).length
    const returningThisMonth = ranked.filter(
      c => at(c.last_order_at) >= monthStart && at(c.first_order_at) < monthStart
    ).length
    const repeaters = ranked.filter(c => c.total_orders >= 2).length

    const rankCounts = Object.fromEntries(RANK_ORDER.map(r => [r, 0])) as Record<CustomerRank, number>
    ranked.forEach(c => { rankCounts[c.rank]++ })

    return {
      total: ranked.length,
      newThisMonth,
      returningThisMonth,
      repeaters,
      repeatRate: ranked.length ? Math.round((repeaters / ranked.length) * 100) : 0,
      rankCounts,
    }
  }, [ranked])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = ranked.filter(c => {
      if (rankFilter !== 'all' && c.rank !== rankFilter) return false
      if (segment === 'one' && c.total_orders !== 1) return false
      if (segment === 'returning' && c.total_orders < 2) return false
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q)) return false
      return true
    })
    const time = (s: string | null) => (s ? new Date(s).getTime() : 0)
    return list.sort((a, b) => {
      switch (sort) {
        case 'orders': return b.total_orders - a.total_orders
        case 'spent':  return Number(b.total_spent) - Number(a.total_spent)
        case 'worst':  return (a.rate ?? 101) - (b.rate ?? 101)
        default:       return time(b.last_order_at) - time(a.last_order_at)
      }
    })
  }, [ranked, search, rankFilter, segment, sort])

  useEffect(() => { setVisible(PAGE_SIZE) }, [search, rankFilter, segment, sort])

  const openCustomer = async (c: Customer) => {
    setSelected(c)
    setHistory([])
    setHistoryLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_phone', c.phone)
      .order('created_at', { ascending: false })
    setHistory((data ?? []) as Order[])
    setHistoryLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">جاري التحميل...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-xl p-10 text-center" style={CARD}>
        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <p className="text-gray-700 font-semibold">جدول العملاء غير متاح بعد</p>
        <p className="text-sm text-gray-500 mt-1">
          شغّل الملف <span className="font-mono" dir="ltr">supabase/migrations/add_customers.sql</span> في Supabase SQL Editor
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">العملاء</h1>
        <p className="text-sm text-gray-500 mt-0.5">{stats.total} عميل</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي العملاء', value: stats.total, icon: Users, color: 'text-gray-600', bg: 'bg-gray-100' },
          { label: 'عملاء جدد هذا الشهر', value: stats.newThisMonth, icon: UserPlus, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'عملاء عائدون هذا الشهر', value: stats.returningThisMonth, icon: Repeat, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: `معدل التكرار (${stats.repeaters} عميل)`, value: `${stats.repeatRate}%`, icon: Percent, color: 'text-pink-600', bg: 'bg-pink-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl p-4" style={CARD}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 leading-tight">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rank distribution — doubles as a filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {RANK_ORDER.map(r => {
          const meta = RANK_META[r]
          const count = stats.rankCounts[r]
          const active = rankFilter === r
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRankFilter(prev => (prev === r ? 'all' : r))}
              className={`bg-white rounded-xl p-4 text-right transition-all ${active ? 'ring-2 ring-pink-500' : 'hover:shadow-md'}`}
              style={CARD}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${meta.badge}`}>{meta.label}</span>
                <span className="text-xs text-gray-400">
                  {stats.total ? Math.round((count / stats.total) * 100) : 0}%
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-2">{count}</p>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-3 md:p-4 flex flex-col gap-3" style={CARD}>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="بحث بالاسم أو رقم الموبايل..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pr-9"
          />
        </div>
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-1.5 flex-wrap">
            {([
              { value: 'all', label: 'الكل' },
              { value: 'one', label: 'طلب واحد' },
              { value: 'returning', label: 'عائدون' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setSegment(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  segment === opt.value ? 'bg-pink-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {rankFilter !== 'all' && (
              <button
                onClick={() => setRankFilter('all')}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-800 text-white flex items-center gap-1"
              >
                {RANK_META[rankFilter].label}
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">ترتيب:</span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="text-xs rounded-md px-2 py-1.5 bg-gray-100 text-gray-700 border-0 focus:ring-1 focus:ring-pink-400 outline-none"
            >
              <option value="recent">آخر طلب</option>
              <option value="orders">الأكثر طلباً</option>
              <option value="spent">الأعلى إنفاقاً</option>
              <option value="worst">الأقل استلاماً</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden" style={CARD}>
        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400">لا يوجد عملاء مطابقون</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['الاسم', 'الموبايل', 'التقييم', 'الطلبات', 'استلم', 'مرتجع/ملغي', 'نسبة الاستلام', 'إجمالي المشتريات', 'آخر طلب'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 md:px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap ${
                        i === 1 ? 'hidden md:table-cell' : i >= 4 && i !== 6 ? 'hidden lg:table-cell' : ''
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.slice(0, visible).map(c => {
                  const meta = RANK_META[c.rank]
                  return (
                    <tr key={c.phone} onClick={() => openCustomer(c)} className="hover:bg-gray-50/70 cursor-pointer transition-colors">
                      <td className="px-3 md:px-4 py-3 text-gray-900 font-medium whitespace-nowrap">{c.name || '—'}</td>
                      <td className="hidden md:table-cell px-4 py-3 text-gray-600" dir="ltr">{c.phone}</td>
                      <td className="px-3 md:px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold whitespace-nowrap ${meta.badge}`}>{meta.label}</span>
                      </td>
                      <td className="px-3 md:px-4 py-3 text-gray-900 font-semibold">{c.total_orders}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-emerald-600 font-semibold">{c.delivered_count}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-amber-600 font-semibold">{c.returned_count + c.cancelled_count}</td>
                      <td className="px-3 md:px-4 py-3 font-bold">
                        {c.rate == null ? <span className="text-gray-300">—</span> : (
                          <span className={c.rate >= 90 ? 'text-emerald-600' : c.rate >= 60 ? 'text-sky-600' : 'text-red-500'}>{c.rate}%</span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-gray-900 whitespace-nowrap">{formatCurrency(c.total_spent)}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDate(c.last_order_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > visible && (
          <div className="border-t border-gray-100 p-3 text-center">
            <button
              onClick={() => setVisible(v => v + PAGE_SIZE)}
              className="text-sm font-semibold text-pink-700 hover:text-pink-900"
            >
              عرض المزيد ({filtered.length - visible} متبقي)
            </button>
          </div>
        )}
      </div>

      {/* Customer detail */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setSelected(null)}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-2 sm:mx-0 p-6">
            {(() => {
              const rank = customerRank(selected)
              const rate = successRate(selected)
              return (
                <>
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-900">{selected.name || '—'}</h2>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${RANK_META[rank].badge}`}>
                          {RANK_META[rank].label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5" dir="ltr">{selected.phone}</p>
                    </div>
                    <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center mb-4">
                    {[
                      { label: 'الطلبات', value: selected.total_orders, cls: 'text-gray-900' },
                      { label: 'استلم', value: selected.delivered_count, cls: 'text-emerald-600' },
                      { label: 'مرتجع', value: selected.returned_count, cls: 'text-amber-600' },
                      { label: 'ملغي', value: selected.cancelled_count, cls: 'text-red-500' },
                    ].map(s => (
                      <div key={s.label} className="bg-gray-50 rounded-lg py-2">
                        <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
                        <p className="text-[11px] text-gray-400">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="text-sm space-y-1.5 mb-5">
                    <div className="flex justify-between">
                      <span className="text-gray-500">نسبة الاستلام</span>
                      <span className="font-semibold">{rate == null ? '—' : `${rate}%`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">إجمالي المشتريات</span>
                      <span className="font-semibold">{formatCurrency(selected.total_spent)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">أول طلب</span>
                      <span>{formatDate(selected.first_order_at)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500 flex-shrink-0">العنوان</span>
                      <span className="text-right">{selected.address || '—'}</span>
                    </div>
                  </div>

                  <p className="text-sm font-semibold text-gray-700 mb-2">سجل الطلبات</p>
                  {historyLoading ? (
                    <p className="text-xs text-gray-400">جاري التحميل...</p>
                  ) : history.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">لا توجد طلبات</p>
                  ) : (
                    <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
                      {history.map(o => (
                        <div key={o.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <div>
                            <p className="font-mono font-semibold text-pink-700 text-xs">{o.order_number}</p>
                            <p className="text-[11px] text-gray-400">{formatDate(o.created_at)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-800">{formatCurrency(o.total)}</span>
                            <OrderStatusBadge status={o.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
