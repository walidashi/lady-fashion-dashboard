'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Customer } from '@/lib/types'
import { customerRank, normalizePhone, RANK_META, resolvedCount, successRate } from '@/lib/customers'
import { formatDate } from '@/lib/utils'
import { UserPlus, UserCheck, AlertTriangle, Loader2 } from 'lucide-react'

interface Props {
  phone: string
  /** Offered when the customer is known, to reuse their saved name and address. */
  onFill?: (name: string, address: string) => void
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'new' }
  | { kind: 'found'; customer: Customer }

export default function CustomerLookup({ phone, onFill }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<State>({ kind: 'idle' })

  const normalized = normalizePhone(phone ?? '')
  const lookupKey = normalized && normalized.length === 11 ? normalized : null

  useEffect(() => {
    if (!lookupKey) { setState({ kind: 'idle' }); return }

    let cancelled = false
    setState({ kind: 'loading' })
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', lookupKey)
        .maybeSingle()
      if (cancelled) return
      // A lookup failure (e.g. migration not run yet) must never block the order form.
      if (error) { setState({ kind: 'idle' }); return }
      setState(data ? { kind: 'found', customer: data as Customer } : { kind: 'new' })
    }, 350)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [lookupKey, supabase])

  if (state.kind === 'idle') return null

  if (state.kind === 'loading') {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        جاري البحث عن العميل...
      </div>
    )
  }

  if (state.kind === 'new') {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-800">
        <UserPlus className="w-4 h-4 flex-shrink-0" />
        <span><span className="font-semibold">عميل جديد</span> — لا توجد طلبات سابقة بهذا الرقم</span>
      </div>
    )
  }

  const c = state.customer
  const rank = customerRank(c)
  const meta = RANK_META[rank]
  const rate = successRate(c)
  const inProgress = c.total_orders - resolvedCount(c)
  const returns = c.returned_count + c.cancelled_count

  const tone =
    rank === 'bad'       ? 'bg-red-50 border-red-100' :
    rank === 'excellent' ? 'bg-emerald-50 border-emerald-100' :
                           'bg-gray-50 border-gray-100'

  return (
    <div className={`mt-2 rounded-lg border px-3 py-2.5 text-xs ${tone}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {rank === 'bad'
            ? <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            : <UserCheck className="w-4 h-4 text-gray-600 flex-shrink-0" />}
          <span className="font-semibold text-gray-800">عميل سابق</span>
          <span className={`px-2 py-0.5 rounded-full border font-semibold ${meta.badge}`}>{meta.label}</span>
        </div>
        {onFill && (
          <button
            type="button"
            onClick={() => onFill(c.name, c.address)}
            className="text-pink-700 hover:text-pink-900 font-semibold"
          >
            ملء الاسم والعنوان
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-gray-600">
        <span>{c.name}</span>
        <span>{c.total_orders} طلب</span>
        <span className="text-emerald-700">استلم {c.delivered_count}</span>
        <span className="text-amber-700">مرتجع/ملغي {returns}</span>
        {inProgress > 0 && <span className="text-purple-700">قيد التنفيذ {inProgress}</span>}
        {rate != null && <span className="font-semibold text-gray-800">نسبة الاستلام {rate}%</span>}
      </div>

      {c.last_order_at && (
        <p className="mt-1 text-[11px] text-gray-400">آخر طلب: {formatDate(c.last_order_at)}</p>
      )}
      {rank === 'bad' && (
        <p className="mt-1.5 text-[11px] font-semibold text-red-700">
          تنبيه: هذا العميل لديه نسبة مرتجع عالية في طلباته السابقة
        </p>
      )}
    </div>
  )
}
