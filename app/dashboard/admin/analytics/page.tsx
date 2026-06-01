'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Order, STATUS_LABELS, STATUS_COLORS, OrderStatus, ORDER_TYPE_COLORS, OrderType } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import {
  TrendingUp, Package, Banknote, Clock, AlertCircle,
  ShoppingBag, RotateCcw, ArrowLeftRight, Leaf, Megaphone,
  MapPin, Truck,
} from 'lucide-react'

function pct(n: number, total: number) {
  if (!total) return 0
  return Math.round((n / total) * 100)
}

function regionFromNumber(orderNumber: string) {
  const prefix = orderNumber.replace(/\d+$/, '').toUpperCase()
  if (prefix === 'J') return 'القاهرة والجيزة'
  if (prefix === 'C') return 'محافظات مجاورة'
  if (prefix === 'F') return 'محافظات بعيدة'
  return 'أخرى'
}

function topProducts(orders: Order[], n = 8) {
  const counts: Record<string, number> = {}
  orders.forEach(o => {
    o.products.split(/\n\n+/).forEach(block => {
      const name = block.split('\n')[0]?.trim()
      if (name) counts[name] = (counts[name] || 0) + 1
    })
  })
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n)
}

function isToday(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function isThisWeek(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7)
  return d >= weekAgo
}

export default function AnalyticsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('orders').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setOrders((data ?? []) as Order[]); setLoading(false) })
  }, [supabase])

  const total = orders.length
  const active = orders.filter(o => o.status !== 'cancelled')
  const totalRevenue   = active.reduce((s, o) => s + Number(o.total), 0)
  const totalCollected = active.reduce((s, o) => s + Number(o.amount_paid), 0)
  const totalRemaining = active.filter(o => Number(o.remaining) > 0).reduce((s, o) => s + Number(o.remaining), 0)
  const avgOrderValue  = active.length ? Math.round(totalRevenue / active.length) : 0
  const todayCount     = orders.filter(o => isToday(o.created_at)).length
  const weekCount      = orders.filter(o => isThisWeek(o.created_at)).length
  const cancelRate     = total ? pct(orders.filter(o => o.status === 'cancelled').length, total) : 0
  const deliveredCount = orders.filter(o => o.status === 'delivered').length
  const deliveryRate   = total ? pct(deliveredCount, total) : 0

  const statusRows = (Object.keys(STATUS_LABELS) as OrderStatus[]).map(status => ({
    status,
    label: STATUS_LABELS[status],
    color: STATUS_COLORS[status],
    count: orders.filter(o => o.status === status).length,
    value: orders.filter(o => o.status === status).reduce((s, o) => s + Number(o.total), 0),
  }))

  const typeRows = (['تسليم', 'استرجاع', 'استبدال'] as OrderType[]).map(t => ({
    type: t,
    count: orders.filter(o => (o.order_type ?? 'تسليم') === t).length,
    value: orders.filter(o => (o.order_type ?? 'تسليم') === t).reduce((s, o) => s + Number(o.total), 0),
  }))

  const sourceRows = ['اورجانيك', 'ممول'].map(src => ({
    src,
    count: orders.filter(o => o.source === src).length,
    value: orders.filter(o => o.source === src).reduce((s, o) => s + Number(o.total), 0),
  }))

  const regionMap: Record<string, { count: number; value: number }> = {}
  orders.forEach(o => {
    const r = regionFromNumber(o.order_number)
    if (!regionMap[r]) regionMap[r] = { count: 0, value: 0 }
    regionMap[r].count++
    regionMap[r].value += Number(o.total)
  })
  const regionRows = Object.entries(regionMap).sort((a, b) => b[1].count - a[1].count)

  const companyMap: Record<string, { count: number }> = {}
  orders.filter(o => o.shipping_company_name).forEach(o => {
    const c = o.shipping_company_name!
    if (!companyMap[c]) companyMap[c] = { count: 0 }
    companyMap[c].count++
  })
  const companyRows = Object.entries(companyMap).sort((a, b) => b[1].count - a[1].count)

  const products = topProducts(orders)
  const maxProduct = products[0]?.[1] || 1

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm">جاري التحميل...</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">الإحصائيات</h1>
        <p className="text-sm text-gray-500 mt-0.5">{total} طلب إجمالي</p>
      </div>

      {/* Top KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي الإيرادات', value: formatCurrency(totalRevenue), icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'إجمالي المحصل', value: formatCurrency(totalCollected), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'المتبقي للتحصيل', value: formatCurrency(totalRemaining), icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'متوسط قيمة الطلب', value: formatCurrency(avgOrderValue), icon: ShoppingBag, color: 'text-pink-600', bg: 'bg-pink-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl p-4" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-gray-900 truncate">{value}</p>
                <p className="text-xs text-gray-500 leading-tight">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Activity row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'طلبات اليوم', value: todayCount, icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'طلبات آخر 7 أيام', value: weekCount, icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'معدل التسليم', value: `${deliveryRate}%`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'معدل الإلغاء', value: `${cancelRate}%`, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl p-4" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Status breakdown */}
        <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-pink-500" />
            توزيع الطلبات حسب الحالة
          </h2>
          <div className="space-y-3">
            {statusRows.map(({ status, label, color, count, value }) => (
              <div key={status}>
                <div className="flex items-center justify-between mb-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${color}`}>{label}</span>
                    <span className="font-bold text-gray-900">{count}</span>
                    <span className="text-gray-400 text-xs">({pct(count, total)}%)</span>
                  </div>
                  <span className="text-gray-600 font-medium text-xs">{formatCurrency(value)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct(count, total)}%`, background: status === 'delivered' ? '#16a34a' : status === 'cancelled' ? '#dc2626' : status === 'shipped' ? '#9333ea' : status === 'ready' ? '#0d9488' : status === 'preparing' ? '#ea580c' : '#2563eb' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top products */}
        <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-pink-500" />
            أكثر المنتجات طلباً
          </h2>
          {products.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">لا توجد بيانات</p>
          ) : (
            <div className="space-y-2.5">
              {products.map(([name, count]) => (
                <div key={name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 truncate flex-1 ml-3">{name}</span>
                    <span className="font-bold text-gray-900 flex-shrink-0">{count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-pink-400 rounded-full" style={{ width: `${pct(count, maxProduct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order type + source */}
        <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-pink-500" />
            نوع العملية والمصدر
          </h2>
          <div className="space-y-5">
            {/* Type */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">نوع العملية</p>
              <div className="space-y-2">
                {typeRows.map(({ type, count, value }) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${ORDER_TYPE_COLORS[type]}`}>{type}</span>
                      <span className="font-bold text-gray-900 text-sm">{count}</span>
                      <span className="text-gray-400 text-xs">({pct(count, total)}%)</span>
                    </div>
                    <span className="text-gray-600 text-xs">{formatCurrency(value)}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Source */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">المصدر</p>
              <div className="space-y-2">
                {sourceRows.map(({ src, count, value }) => (
                  <div key={src} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {src === 'اورجانيك'
                        ? <Leaf className="w-3.5 h-3.5 text-emerald-500" />
                        : <Megaphone className="w-3.5 h-3.5 text-blue-500" />}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${src === 'اورجانيك' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{src}</span>
                      <span className="font-bold text-gray-900 text-sm">{count}</span>
                      <span className="text-gray-400 text-xs">({pct(count, total)}%)</span>
                    </div>
                    <span className="text-gray-600 text-xs">{formatCurrency(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Region + Shipping companies */}
        <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-pink-500" />
            المناطق وشركات الشحن
          </h2>
          <div className="space-y-5">
            {/* Regions */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">المناطق</p>
              <div className="space-y-2">
                {regionRows.map(([region, { count, value }]) => (
                  <div key={region}>
                    <div className="flex justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700 text-xs">{region}</span>
                        <span className="font-bold text-gray-900">{count}</span>
                        <span className="text-gray-400 text-xs">({pct(count, total)}%)</span>
                      </div>
                      <span className="text-gray-600 text-xs">{formatCurrency(value)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct(count, total)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Shipping companies */}
            {companyRows.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">شركات الشحن</p>
                <div className="space-y-1.5">
                  {companyRows.map(([name, { count }]) => (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Truck className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-gray-700 text-xs">{name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-gray-900">{count}</span>
                        <span className="text-gray-400 text-xs">طلب</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
