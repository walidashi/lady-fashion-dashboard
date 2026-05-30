'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Order, ShippingCompany, STATUS_LABELS, OrderStatus, OrderType, ORDER_TYPE_COLORS } from '@/lib/types'
import { generateShippingExcel } from '@/lib/excel'
import { printLabels } from '@/lib/printLabels'
import { acceptOrder, shipOrder, deliverOrder, cancelOrder, bulkUpdateStatus, markOrderReady } from '@/app/actions/orders'
import OrderStatusBadge from '@/components/OrderStatusBadge'
import { formatDate, formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import {
  FileDown, Search, Check, Truck, X, Eye,
  Package, Clock, CheckCircle, XCircle, ChevronDown, Pencil, Printer, FileUp, PackageCheck,
} from 'lucide-react'

const BULK_STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'new',       label: 'جديد',           color: 'text-blue-700 hover:bg-blue-50' },
  { value: 'preparing', label: 'جاري التجهيز',   color: 'text-orange-700 hover:bg-orange-50' },
  { value: 'ready',     label: 'جاهز',            color: 'text-teal-700 hover:bg-teal-50' },
  { value: 'shipped',   label: 'مشحون',           color: 'text-purple-700 hover:bg-purple-50' },
  { value: 'delivered', label: 'تم التسليم',      color: 'text-green-700 hover:bg-green-50' },
  { value: 'cancelled', label: 'ملغي',            color: 'text-red-700 hover:bg-red-50' },
]

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all',       label: 'جميع الطلبات' },
  { value: 'new',       label: 'جديد' },
  { value: 'preparing', label: 'جاري التجهيز' },
  { value: 'ready',     label: 'جاهز' },
  { value: 'shipped',   label: 'مشحون' },
  { value: 'delivered', label: 'تم التسليم' },
  { value: 'cancelled', label: 'ملغي' },
]

type ModalType = 'accept' | 'ship' | 'detail' | null

interface ModalState {
  type: ModalType
  order: Order | null
}

export default function AdminOrdersPage() {
  const supabase = useMemo(() => createClient(), [])
  const [orders, setOrders] = useState<Order[]>([])
  const [companies, setCompanies] = useState<ShippingCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalState>({ type: null, order: null })
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')
  const [companyFilter, setCompanyFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Accept form state
  const [deliveryDate, setDeliveryDate] = useState('')
  // Ship form state
  const [selectedCompany, setSelectedCompany] = useState<ShippingCompany | null>(null)

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
    setOrders((data ?? []) as Order[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchOrders()
    supabase
      .from('shipping_companies')
      .select('*')
      .order('name')
      .then(({ data }) => setCompanies((data ?? []) as ShippingCompany[]))
  }, [fetchOrders, supabase])

  const filtered = orders.filter((o) => {
    const matchStatus = statusFilter === 'all' || o.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.mobile.includes(q)
    const matchSource = sourceFilter === 'all' || o.source === sourceFilter
    const matchOrderType = orderTypeFilter === 'all' || o.order_type === orderTypeFilter
    const matchCompany = !companyFilter || o.shipping_company_id === companyFilter
    const orderDate = new Date(o.created_at)
    const matchDateFrom = !dateFrom || orderDate >= new Date(dateFrom)
    const matchDateTo = !dateTo || orderDate <= new Date(dateTo + 'T23:59:59')
    return matchStatus && matchSearch && matchSource && matchOrderType && matchCompany && matchDateFrom && matchDateTo
  })

  // Stats
  const stats = {
    new: orders.filter((o) => o.status === 'new').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    ready: orders.filter((o) => o.status === 'ready').length,
    total: orders.length,
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((o) => o.id)))
    }
  }

  const openModal = (type: ModalType, order: Order) => {
    setModal({ type, order })
    setActionError('')
    setDeliveryDate('')
    setSelectedCompany(null)
  }

  const closeModal = () => {
    setModal({ type: null, order: null })
    setActionError('')
  }

  const handleAccept = async () => {
    if (!modal.order || !deliveryDate) return
    setActionLoading(true)
    const result = await acceptOrder(modal.order.id, deliveryDate)
    if (result.error) {
      setActionError(result.error)
    } else {
      closeModal()
      fetchOrders()
    }
    setActionLoading(false)
  }

  const handleShip = async () => {
    if (!modal.order || !selectedCompany) return
    setActionLoading(true)
    const result = await shipOrder(modal.order.id, selectedCompany.id, selectedCompany.name)
    if (result.error) {
      setActionError(result.error)
    } else {
      closeModal()
      fetchOrders()
    }
    setActionLoading(false)
  }

  const handleMarkReady = async (orderId: string) => {
    await markOrderReady(orderId)
    fetchOrders()
  }

  const handleDeliver = async (orderId: string) => {
    if (!confirm('تأكيد: تم تسليم هذا الطلب؟')) return
    await deliverOrder(orderId)
    fetchOrders()
  }

  const handleCancel = async (orderId: string) => {
    if (!confirm('تأكيد: إلغاء هذا الطلب؟')) return
    await cancelOrder(orderId)
    fetchOrders()
  }

  const handleBulkStatus = async (status: string) => {
    setBulkStatusOpen(false)
    if (!confirm(`تغيير حالة ${selected.size} طلب إلى "${BULK_STATUS_OPTIONS.find(o => o.value === status)?.label}"؟`)) return
    await bulkUpdateStatus(Array.from(selected), status)
    setSelected(new Set())
    fetchOrders()
  }

  const handleExport = () => {
    const toExport =
      selected.size > 0
        ? orders.filter((o) => selected.has(o.id))
        : filtered
    if (toExport.length === 0) return
    generateShippingExcel(toExport)
  }

  const handlePrint = () => {
    const toPrint =
      selected.size > 0
        ? orders.filter((o) => selected.has(o.id))
        : filtered
    if (toPrint.length === 0) return
    printLabels(toPrint)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">جميع الطلبات</h1>
          <p className="text-sm text-gray-500 mt-0.5">{orders.length} طلب</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/admin/import"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 md:px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            <FileUp className="w-4 h-4" />
            <span className="hidden sm:inline">استيراد Excel</span>
          </Link>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-3 md:px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">
              {selected.size > 0 ? `طباعة (${selected.size})` : 'طباعة Labels'}
            </span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-3 md:px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">
              {selected.size > 0 ? `تصدير (${selected.size})` : 'تصدير Excel'}
            </span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        {[
          { label: 'إجمالي الطلبات', value: stats.total, icon: Package, color: 'text-gray-600', bg: 'bg-gray-100' },
          { label: 'جديد', value: stats.new, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'جاري التجهيز', value: stats.preparing, icon: Truck, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'جاهز', value: stats.ready, icon: PackageCheck, color: 'text-teal-600', bg: 'bg-teal-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl p-4" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center`}>
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

      {/* Filters */}
      <div className="bg-white rounded-xl p-3 md:p-4 mb-4 flex flex-col gap-3" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="بحث باسم العميل أو رقم الأوردر..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pr-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-pink-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center border-t border-gray-50 pt-3">
          {/* Order type filter */}
          <div className="flex gap-1.5 items-center">
            <span className="text-xs text-gray-400 whitespace-nowrap">النوع:</span>
            {([
              { value: 'all', label: 'الكل' },
              { value: 'تسليم', label: 'تسليم' },
              { value: 'استرجاع', label: 'استرجاع' },
              { value: 'استبدال', label: 'استبدال' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setOrderTypeFilter(opt.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  orderTypeFilter === opt.value
                    ? opt.value === 'استرجاع' ? 'bg-red-600 text-white'
                      : opt.value === 'استبدال' ? 'bg-amber-600 text-white'
                      : opt.value === 'تسليم' ? 'bg-gray-600 text-white'
                      : 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Source filter */}
          <div className="flex gap-1.5 items-center">
            <span className="text-xs text-gray-400 whitespace-nowrap">المصدر:</span>
            {[{ value: 'all', label: 'الكل' }, { value: 'اورجانيك', label: 'اورجانيك' }, { value: 'ممول', label: 'ممول' }].map(opt => (
              <button
                key={opt.value}
                onClick={() => setSourceFilter(opt.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  sourceFilter === opt.value
                    ? opt.value === 'اورجانيك' ? 'bg-emerald-600 text-white' : opt.value === 'ممول' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Company filter */}
          {companies.length > 0 && (
            <div className="flex gap-1.5 items-center">
              <span className="text-xs text-gray-400 whitespace-nowrap">الشركة:</span>
              <select
                value={companyFilter}
                onChange={e => setCompanyFilter(e.target.value)}
                className="text-xs rounded-md px-2 py-1 bg-gray-100 text-gray-700 border-0 focus:ring-1 focus:ring-pink-400 outline-none"
              >
                <option value="">الكل</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {/* Date range */}
          <div className="flex gap-1.5 items-center">
            <span className="text-xs text-gray-400 whitespace-nowrap">من:</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="text-xs rounded-md px-2 py-1 bg-gray-100 text-gray-700 border-0 focus:ring-1 focus:ring-pink-400 outline-none" />
            <span className="text-xs text-gray-400">إلى:</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="text-xs rounded-md px-2 py-1 bg-gray-100 text-gray-700 border-0 focus:ring-1 focus:ring-pink-400 outline-none" />
          </div>
          {/* Clear filters */}
          {(sourceFilter !== 'all' || orderTypeFilter !== 'all' || companyFilter || dateFrom || dateTo) && (
            <button
              onClick={() => { setSourceFilter('all'); setOrderTypeFilter('all'); setCompanyFilter(''); setDateFrom(''); setDateTo('') }}
              className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              مسح الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-gray-900 text-white rounded-xl px-4 py-3 mb-4 flex items-center gap-3 shadow-lg overflow-x-auto scrollbar-thin">
          <span className="text-sm font-medium flex-1">
            {selected.size} طلب محدد
          </span>
          {/* Bulk status change */}
          <div className="relative">
            <button
              onClick={() => setBulkStatusOpen(v => !v)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              تغيير الحالة
              <ChevronDown className="w-4 h-4" />
            </button>
            {bulkStatusOpen && (
              <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 min-w-[160px]">
                {BULK_STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleBulkStatus(opt.value)}
                    className={`w-full text-right px-4 py-2.5 text-sm font-medium transition-colors ${opt.color}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Bulk print */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Printer className="w-4 h-4" />
            طباعة Labels
          </button>
          {/* Bulk export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <FileDown className="w-4 h-4" />
            تصدير Excel
          </button>
          {/* Bulk cancel */}
          <button
            onClick={() => handleBulkStatus('cancelled')}
            className="flex items-center gap-2 bg-red-500 hover:bg-red-400 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <XCircle className="w-4 h-4" />
            إلغاء الكل
          </button>
          {/* Deselect */}
          <button
            onClick={() => setSelected(new Set())}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            title="إلغاء التحديد"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400">لا توجد طلبات مطابقة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 md:px-4 py-3 text-right">
                    <input
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === filtered.length}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-pink-600 focus:ring-pink-400"
                    />
                  </th>
                  <th className="px-3 md:px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">رقم الأوردر</th>
                  <th className="px-3 md:px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">الاسم</th>
                  <th className="hidden md:table-cell px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">الموبايل</th>
                  <th className="px-3 md:px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">الإجمالي</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">الباقي</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">الموظف</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">التاريخ</th>
                  <th className="px-3 md:px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">الحالة</th>
                  <th className="px-3 md:px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((order) => (
                  <tr key={order.id} className={`hover:bg-gray-50/50 transition-colors ${selected.has(order.id) ? 'bg-pink-50/30' : ''}`}>
                    <td className="px-3 md:px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(order.id)}
                        onChange={() => toggleSelect(order.id)}
                        className="rounded border-gray-300 text-pink-600 focus:ring-pink-400"
                      />
                    </td>
                    <td className="px-3 md:px-4 py-3">
                      <div className="font-mono font-semibold text-pink-700">{order.order_number}</div>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {order.source && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${order.source === 'اورجانيك' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                            {order.source}
                          </span>
                        )}
                        {order.order_type && order.order_type !== 'تسليم' && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium border ${ORDER_TYPE_COLORS[order.order_type as OrderType]}`}>
                            {order.order_type}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 md:px-4 py-3 text-gray-900 font-medium whitespace-nowrap">{order.customer_name}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-600" dir="ltr">{order.mobile}</td>
                    <td className="px-3 md:px-4 py-3 text-gray-900 font-medium whitespace-nowrap">{formatCurrency(order.total)}</td>
                    <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap">
                      <span className={Number(order.remaining) > 0 ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
                        {formatCurrency(order.remaining)}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-500 whitespace-nowrap">{order.created_by_name}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDate(order.created_at)}</td>
                    <td className="px-3 md:px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {/* View */}
                        <button
                          onClick={() => openModal('detail', order)}
                          title="عرض التفاصيل"
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {/* Edit */}
                        <Link
                          href={`/dashboard/employee/edit-order/${order.id}`}
                          title="تعديل الطلب"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        {/* Accept (new orders only) */}
                        {order.status === 'new' && (
                          <button
                            onClick={() => openModal('accept', order)}
                            title="قبول الطلب"
                            className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        {/* Mark ready (preparing orders only) */}
                        {order.status === 'preparing' && (
                          <button
                            onClick={() => handleMarkReady(order.id)}
                            title="تم التجهيز - جاهز"
                            className="p-1.5 text-teal-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                          >
                            <PackageCheck className="w-4 h-4" />
                          </button>
                        )}
                        {/* Ship (preparing or ready orders) */}
                        {(order.status === 'preparing' || order.status === 'ready') && (
                          <button
                            onClick={() => openModal('ship', order)}
                            title="شحن الطلب"
                            className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
                          >
                            <Truck className="w-4 h-4" />
                          </button>
                        )}
                        {/* Deliver (shipped orders) */}
                        {order.status === 'shipped' && (
                          <button
                            onClick={() => handleDeliver(order.id)}
                            title="تم التسليم"
                            className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        {/* Cancel — available unless already delivered or cancelled */}
                        {order.status !== 'delivered' && order.status !== 'cancelled' && (
                          <button
                            onClick={() => handleCancel(order.id)}
                            title="إلغاء الطلب"
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {modal.type && modal.order && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-2 sm:mx-0">
            {/* Accept Modal */}
            {modal.type === 'accept' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900">قبول الطلب</h2>
                  <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 mb-5 text-sm">
                  <p className="font-semibold text-gray-800">{modal.order.customer_name}</p>
                  <p className="text-gray-500 mt-0.5">{modal.order.order_number} • {formatCurrency(modal.order.total)}</p>
                </div>
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    تاريخ التسليم المتوقع <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="input-field"
                  />
                </div>
                {actionError && <p className="error-text mb-3">{actionError}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={handleAccept}
                    disabled={!deliveryDate || actionLoading}
                    className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm"
                  >
                    {actionLoading ? 'جاري الحفظ...' : 'تأكيد القبول'}
                  </button>
                  <button onClick={closeModal} className="btn-secondary">إلغاء</button>
                </div>
              </div>
            )}

            {/* Ship Modal */}
            {modal.type === 'ship' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900">شحن الطلب</h2>
                  <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 mb-5 text-sm">
                  <p className="font-semibold text-gray-800">{modal.order.customer_name}</p>
                  <p className="text-gray-500 mt-0.5">{modal.order.order_number} • {formatCurrency(modal.order.total)}</p>
                  {modal.order.estimated_delivery && (
                    <p className="text-gray-500 mt-0.5">التسليم المتوقع: {formatDate(modal.order.estimated_delivery)}</p>
                  )}
                </div>
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    شركة الشحن <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {companies.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCompany(c)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-right ${
                          selectedCompany?.id === c.id
                            ? 'border-purple-500 bg-purple-50 text-purple-800'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <Truck className={`w-4 h-4 flex-shrink-0 ${selectedCompany?.id === c.id ? 'text-purple-600' : 'text-gray-400'}`} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
                {actionError && <p className="error-text mb-3">{actionError}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={handleShip}
                    disabled={!selectedCompany || actionLoading}
                    className="flex-1 bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm"
                  >
                    {actionLoading ? 'جاري الحفظ...' : 'تأكيد الشحن'}
                  </button>
                  <button onClick={closeModal} className="btn-secondary">إلغاء</button>
                </div>
              </div>
            )}

            {/* Detail Modal */}
            {modal.type === 'detail' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-gray-900">تفاصيل الطلب</h2>
                    <OrderStatusBadge status={modal.order.status} />
                  </div>
                  <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 text-sm">
                  <Row label="رقم الأوردر" value={<span className="font-mono font-bold text-pink-700">{modal.order.order_number}</span>} />
                  <Row label="نوع العملية" value={
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${ORDER_TYPE_COLORS[(modal.order.order_type ?? 'تسليم') as OrderType]}`}>
                      {modal.order.order_type ?? 'تسليم'}
                    </span>
                  } />
                  {modal.order.source && (
                    <Row label="المصدر" value={
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${modal.order.source === 'اورجانيك' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                        {modal.order.source}
                      </span>
                    } />
                  )}
                  <Row label="الاسم" value={modal.order.customer_name} />
                  <Row label="الموبايل" value={<span dir="ltr">{modal.order.mobile}</span>} />
                  <Row label="العنوان" value={modal.order.address} />
                  {modal.order.order_type === 'استبدال' ? (
                    <>
                      <div>
                        <p className="text-gray-500 mb-1 font-medium">المنتجات الصادرة</p>
                        <pre className="bg-gray-50 rounded-lg p-3 text-gray-800 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                          {modal.order.products}
                        </pre>
                      </div>
                      {modal.order.returned_products && (
                        <div>
                          <p className="text-red-600 mb-1 font-medium">المنتجات المرتجعة</p>
                          <pre className="bg-red-50 rounded-lg p-3 text-gray-800 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                            {modal.order.returned_products}
                          </pre>
                        </div>
                      )}
                    </>
                  ) : (
                    <div>
                      <p className="text-gray-500 mb-1">المنتجات</p>
                      <pre className="bg-gray-50 rounded-lg p-3 text-gray-800 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                        {modal.order.products}
                      </pre>
                    </div>
                  )}
                  <div className="bg-pink-50 rounded-lg p-4 space-y-1.5">
                    <Row label="إجمالي المنتجات" value={formatCurrency(modal.order.products_total)} />
                    {modal.order.order_type === 'استبدال' && (
                      <Row label="إجمالي المرتجع" value={<span className="text-red-600">- {formatCurrency(modal.order.returned_products_total)}</span>} />
                    )}
                    <Row label="الشحن" value={formatCurrency(modal.order.shipping_cost)} />
                    <Row label="الإجمالي" value={<span className="font-bold">{formatCurrency(modal.order.total)}</span>} />
                    <Row label="المدفوع" value={<span className="text-green-600">{formatCurrency(modal.order.amount_paid)}</span>} />
                    <Row label="الباقي" value={<span className={Number(modal.order.remaining) > 0 ? 'text-orange-600 font-bold' : 'text-green-600 font-bold'}>{formatCurrency(modal.order.remaining)}</span>} />
                  </div>
                  <Row label="طريقة الدفع" value={modal.order.payment_method} />
                  <Row label="ملاحظات" value={modal.order.notes} />
                  {modal.order.estimated_delivery && (
                    <Row label="تاريخ التسليم المتوقع" value={formatDate(modal.order.estimated_delivery)} />
                  )}
                  {modal.order.shipping_company_name && (
                    <Row label="شركة الشحن" value={modal.order.shipping_company_name} />
                  )}
                  <Row label="الموظف" value={modal.order.created_by_name} />
                  <Row label="تاريخ الإضافة" value={formatDate(modal.order.created_at)} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-gray-900 text-right">{value}</span>
    </div>
  )
}
