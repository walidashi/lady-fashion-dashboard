'use client'

import { useState, useMemo } from 'react'
import { OrderStatusLog, STATUS_LABELS, OrderStatus } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { Search, History } from 'lucide-react'

interface Props {
  logs: OrderStatusLog[]
}

const STATUS_DOT: Record<string, string> = {
  new:       'bg-blue-400',
  preparing: 'bg-orange-400',
  ready:     'bg-teal-400',
  shipped:   'bg-purple-400',
  delivered: 'bg-green-400',
  cancelled: 'bg-red-400',
}

const STATUS_BADGE: Record<string, string> = {
  new:       'bg-blue-100 text-blue-700',
  preparing: 'bg-orange-100 text-orange-700',
  ready:     'bg-teal-100 text-teal-700',
  shipped:   'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-600'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] ?? 'bg-gray-400'}`} />
      {STATUS_LABELS[status as OrderStatus] ?? status}
    </span>
  )
}

export default function LogsView({ logs }: Props) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filtered = useMemo(() => {
    return logs.filter(log => {
      const q = query.trim().toLowerCase()
      const matchSearch = !q ||
        log.order_number.toLowerCase().includes(q) ||
        log.changed_by_name.toLowerCase().includes(q)
      const matchStatus = !statusFilter || log.to_status === statusFilter
      const logDate = new Date(log.created_at)
      const matchFrom = !dateFrom || logDate >= new Date(dateFrom)
      const matchTo = !dateTo || logDate <= new Date(dateTo + 'T23:59:59')
      return matchSearch && matchStatus && matchFrom && matchTo
    })
  }, [logs, query, statusFilter, dateFrom, dateTo])

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return logs.filter(l => l.created_at.slice(0, 10) === today).length
  }, [logs])

  const hasFilters = query || statusFilter || dateFrom || dateTo

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <History className="w-5 h-5 text-gray-400" />
            سجل العمليات
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {logs.length.toLocaleString('ar-EG')} إدخال
            {todayCount > 0 && <span className="mr-2 text-pink-600 font-medium">· {todayCount} اليوم</span>}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 mb-4 flex flex-col gap-3"
        style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="بحث برقم الأوردر أو اسم الموظف..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="input-field pr-9"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Status filter */}
          <div className="flex gap-1.5 flex-wrap">
            {['', 'new', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? s ? `${STATUS_BADGE[s]} ring-1 ring-current` : 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s ? (STATUS_LABELS[s as OrderStatus] ?? s) : 'الكل'}
              </button>
            ))}
          </div>
          {/* Date range */}
          <div className="flex gap-1.5 items-center mr-auto">
            <span className="text-xs text-gray-400">من:</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="text-xs rounded-md px-2 py-1 bg-gray-100 border-0 focus:ring-1 focus:ring-pink-400 outline-none" />
            <span className="text-xs text-gray-400">إلى:</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="text-xs rounded-md px-2 py-1 bg-gray-100 border-0 focus:ring-1 focus:ring-pink-400 outline-none" />
            {hasFilters && (
              <button
                onClick={() => { setQuery(''); setStatusFilter(''); setDateFrom(''); setDateTo('') }}
                className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                مسح
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden"
        style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <History className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">لا توجد نتائج</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">التاريخ</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">رقم الأوردر</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">الموظف</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">من</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">إلى</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">ملاحظة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-pink-700">{log.order_number}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{log.changed_by_name}</td>
                    <td className="px-4 py-3">
                      {log.from_status
                        ? <StatusChip status={log.from_status} />
                        : <span className="text-xs text-gray-400 italic">إنشاء</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={log.to_status} />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{log.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
