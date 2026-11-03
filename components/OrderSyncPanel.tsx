'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { retrySync, syncOrderNow } from '@/app/actions/sync'
import {
  Order, OrderSyncRow, SyncTarget,
  SYNC_STATE_COLORS, SYNC_STATE_LABELS, SYNC_TARGET_LABELS,
} from '@/lib/types'
import { RefreshCw, Link2, Link2Off } from 'lucide-react'

const TARGETS_FOR: Record<string, SyncTarget[]> = {
  delivered: ['shopify_deliver', 'meta_delivered'],
  returned: ['shopify_cancel'],
  cancelled: ['shopify_cancel'],
}

const RETRYABLE = new Set(['pending', 'error', 'dry_run', 'test', 'skipped'])

export default function OrderSyncPanel({ order }: { order: Order }) {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<OrderSyncRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('order_sync')
      .select('id, order_id, target, state, message, attempts, updated_at')
      .eq('order_id', order.id)
    setRows((data ?? []) as OrderSyncRow[])
    setLoaded(true)
  }, [supabase, order.id])

  useEffect(() => { load() }, [load])

  // Syncs start in the background after a status change; poll until they settle.
  useEffect(() => {
    if (!rows.some(r => r.state === 'pending' || r.state === 'running')) return
    const t = setTimeout(load, 3000)
    return () => clearTimeout(t)
  }, [rows, load])

  const linked = !!(order.shopify_order_gid || order.shopify_order_name)
  const expected = TARGETS_FOR[order.status] ?? []
  const shown = rows.filter(r => expected.includes(r.target) || r.state === 'done')
  const missing = expected.filter(t => !rows.some(r => r.target === t))

  const retry = async (target: SyncTarget) => {
    setBusy(target)
    const res = await retrySync(order.id, target)
    if (res.error) alert(res.error)
    await load()
    setBusy(null)
  }

  const runNow = async () => {
    setBusy('all')
    const res = await syncOrderNow(order.id)
    if (res.error) alert(res.error)
    await load()
    setBusy(null)
  }

  return (
    <div className="border-t border-gray-100 pt-4 mt-2">
      <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
        {linked ? <Link2 className="w-4 h-4 text-gray-400" /> : <Link2Off className="w-4 h-4 text-gray-300" />}
        Shopify و Meta
        {order.shopify_order_name && (
          <span className="font-mono text-xs text-gray-500 font-normal" dir="ltr">{order.shopify_order_name}</span>
        )}
      </p>

      {!linked ? (
        <p className="text-xs text-gray-400">غير مرتبط بطلب على Shopify، فمفيش مزامنة. أضف رقم أوردر Shopify من صفحة تعديل الطلب لو موجود.</p>
      ) : !loaded ? (
        <p className="text-xs text-gray-400">جاري التحميل...</p>
      ) : (
        <div className="space-y-2">
          {shown.map(r => (
            <div key={r.id} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-700">{SYNC_TARGET_LABELS[r.target]}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${SYNC_STATE_COLORS[r.state]}`}>
                    {SYNC_STATE_LABELS[r.state]}
                  </span>
                  {RETRYABLE.has(r.state) && expected.includes(r.target) && (
                    <button
                      onClick={() => retry(r.target)}
                      disabled={!!busy}
                      title="إعادة المحاولة"
                      className="p-1 text-gray-400 hover:text-pink-700 hover:bg-pink-50 rounded disabled:opacity-40"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${busy === r.target ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
              {r.message && (
                <p className={`text-[11px] mt-1 leading-relaxed ${r.state === 'error' ? 'text-red-600' : 'text-gray-500'}`} dir="auto">
                  {r.message}
                </p>
              )}
            </div>
          ))}
          {missing.length > 0 && (
            <button
              onClick={runNow}
              disabled={!!busy}
              className="text-xs text-pink-700 hover:text-pink-800 font-medium disabled:opacity-40"
            >
              {busy === 'all' ? 'جاري المزامنة...' : 'مزامنة الآن'}
            </button>
          )}
          {shown.length === 0 && missing.length === 0 && (
            <p className="text-xs text-gray-400">مفيش مزامنة مطلوبة للحالة دي.</p>
          )}
        </div>
      )}
    </div>
  )
}
