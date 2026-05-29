'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Order, OrderType, ORDER_TYPE_COLORS } from '@/lib/types'
import OrderStatusBadge from '@/components/OrderStatusBadge'
import Link from 'next/link'
import { Plus, Package, Pencil, XCircle } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import { cancelOrder } from '@/app/actions/orders'

export default function EmployeeOrdersPage() {
  const supabase = useMemo(() => createClient(), [])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase
        .from('orders')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setOrders((data ?? []) as Order[])
          setLoading(false)
        })
    })
  }, [supabase])

  const handleCancel = async (orderId: string) => {
    if (!confirm('تأكيد: إلغاء هذا الطلب؟')) return
    const result = await cancelOrder(orderId)
    if (result.error) { alert(result.error); return }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' as const } : o))
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-400 text-sm">جاري التحميل...</p></div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">طلباتي</h1>
          <p className="text-sm text-gray-500 mt-0.5">{orders.length} طلب</p>
        </div>
        <Link
          href="/dashboard/employee/new-order"
          className="flex items-center gap-2 bg-pink-700 hover:bg-pink-800 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          طلب جديد
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-xl p-16 text-center" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
          <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">لا توجد طلبات بعد</p>
          <Link
            href="/dashboard/employee/new-order"
            className="mt-4 inline-flex items-center gap-1.5 text-pink-700 text-sm hover:underline font-medium"
          >
            <Plus className="w-4 h-4" />
            أضف أول طلب
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 md:px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">رقم الأوردر</th>
                  <th className="px-3 md:px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">الاسم</th>
                  <th className="hidden md:table-cell px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">الموبايل</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">طريقة الدفع</th>
                  <th className="px-3 md:px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">الإجمالي</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">الباقي</th>
                  <th className="px-3 md:px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">الحالة</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">التاريخ</th>
                  <th className="px-3 md:px-4 py-3 text-right font-semibold text-gray-600 whitespace-nowrap">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
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
                    <td className="px-3 md:px-4 py-3 text-gray-900 font-medium">{order.customer_name}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-600" dir="ltr">{order.mobile}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-600">{order.payment_method}</td>
                    <td className="px-3 md:px-4 py-3 text-gray-900 font-medium">{formatCurrency(order.total)}</td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      <span className={Number(order.remaining) > 0 ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
                        {formatCurrency(order.remaining)}
                      </span>
                    </td>
                    <td className="px-3 md:px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDate(order.created_at)}</td>
                    <td className="px-3 md:px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/dashboard/employee/edit-order/${order.id}`}
                          title="تعديل الطلب"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
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
        </div>
      )}
    </div>
  )
}
