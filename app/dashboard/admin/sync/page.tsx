'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  backfillPreview, backfillRun, BackfillRow, exportRefusedPhones, getSyncOverview,
  retrySync, runUnfinishedBatch, setDryRun, SyncOverview,
} from '@/app/actions/sync'
import {
  SyncState, SyncTarget, SYNC_STATE_COLORS, SYNC_STATE_LABELS, SYNC_TARGET_LABELS,
} from '@/lib/types'
import { formatDate } from '@/lib/utils'
import {
  CheckCircle2, XCircle, RefreshCw, Download, FlaskConical, History, AlertTriangle, PlayCircle, Search,
} from 'lucide-react'

const CARD: React.CSSProperties = { border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }

interface ProblemRow {
  order_id: string; target: SyncTarget; state: SyncState; message: string | null; updated_at: string
  orders: { order_number: string; shopify_order_name: string | null } | null
}
interface LogRow {
  id: string; order_number: string | null; target: string; action: string
  ok: boolean; dry_run: boolean; message: string | null; created_at: string
}

// Date inputs are in the viewer's local time (Cairo); send exact instants.
const dayStart = (d: string) => new Date(`${d}T00:00:00`).toISOString()
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999`).toISOString()
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function Chip({ state }: { state: SyncState }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${SYNC_STATE_COLORS[state]}`}>
      {SYNC_STATE_LABELS[state]}
    </span>
  )
}

function Status({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-500 mt-0.5" />}
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {detail && <p className="text-xs text-gray-500" dir="auto">{detail}</p>}
      </div>
    </div>
  )
}

export default function SyncPage() {
  const supabase = useMemo(() => createClient(), [])
  const [overview, setOverview] = useState<SyncOverview | null>(null)
  const [problems, setProblems] = useState<ProblemRow[]>([])
  const [logs, setLogs] = useState<LogRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState('')

  const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30)
  const [csvFrom, setCsvFrom] = useState(isoDay(thirtyAgo))
  const [csvTo, setCsvTo] = useState(isoDay(new Date()))
  const [csvNote, setCsvNote] = useState('')

  const [bfFrom, setBfFrom] = useState(isoDay(thirtyAgo))
  const [bfTo, setBfTo] = useState(isoDay(new Date()))
  const [bfRows, setBfRows] = useState<BackfillRow[] | null>(null)
  const [bfWarning, setBfWarning] = useState<string | null>(null)
  const [bfDryRun, setBfDryRun] = useState(true)

  const load = useCallback(async () => {
    const res = await getSyncOverview()
    if (res.data) setOverview(res.data)
    const [{ data: p }, { data: l }] = await Promise.all([
      supabase.from('order_sync')
        .select('order_id, target, state, message, updated_at, orders(order_number, shopify_order_name)')
        .in('state', ['error', 'pending', 'running', 'dry_run', 'test'])
        .order('updated_at', { ascending: false }).limit(200),
      supabase.from('integration_logs').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    setProblems((p ?? []) as unknown as ProblemRow[])
    setLogs((l ?? []) as LogRow[])
  }, [supabase])

  useEffect(() => { load() }, [load])

  const toggleDryRun = async () => {
    if (!overview) return
    const next = !overview.dryRun
    if (!next && !confirm('إيقاف وضع التجربة؟ من دلوقتي تغيير الحالة هيحدّث Shopify ويبعت لـ Meta فعلياً.')) return
    setBusy('dry')
    const res = await setDryRun(next)
    if (res.error) alert(res.error)
    await load()
    setBusy(null)
  }

  const retry = async (orderId: string, target: SyncTarget) => {
    setBusy(`${orderId}:${target}`)
    const res = await retrySync(orderId, target)
    if (res.error) alert(res.error)
    await load()
    setBusy(null)
  }

  const runAll = async (states: string[], label: string) => {
    setBusy('all')
    const first = await runUnfinishedBatch(states)
    if (first.error) { alert(first.error); setBusy(null); return }
    // Rows that fail again move to the back of the queue, so stop after one pass.
    const total = first.total ?? 0
    let done = first.processed ?? 0
    setProgress(`${label}: ${done} / ${total}`)
    while (done < total) {
      const res = await runUnfinishedBatch(states)
      if (res.error || !res.processed) break
      done += res.processed
      setProgress(`${label}: ${Math.min(done, total)} / ${total}`)
    }
    setProgress('')
    await load()
    setBusy(null)
  }

  const exportCsv = async () => {
    setBusy('csv'); setCsvNote('')
    const res = await exportRefusedPhones(dayStart(csvFrom), dayEnd(csvTo))
    setBusy(null)
    if (res.error || !res.csv) { alert(res.error); return }
    const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `refused_phones_${csvFrom}_${csvTo}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    setCsvNote(`${res.unique} رقم من ${res.orders} طلب مرتجع${res.invalid ? ` · ${res.invalid} رقم غير صالح اتشال` : ''}`)
  }

  const preview = async () => {
    setBusy('bf'); setBfRows(null); setBfWarning(null)
    const res = await backfillPreview(dayStart(bfFrom), dayEnd(bfTo))
    setBusy(null)
    if (res.error) { alert(res.error); return }
    setBfRows(res.rows ?? [])
    setBfWarning(res.warning ?? null)
    setBfDryRun(!!res.dryRun)
  }

  const runBackfill = async () => {
    if (!bfRows) return
    const todo = bfRows.filter(r => (r.link === 'linked' || r.link === 'matched') && r.syncState !== 'done')
    if (!todo.length) return
    const what = bfDryRun ? 'تجربة (مفيش حاجة هتتبعت)' : 'تحديث Shopify فعلياً'
    if (!confirm(`تشغيل ${todo.length} طلب؟ — ${what}`)) return
    setBusy('bfrun')
    for (let i = 0; i < todo.length; i += 10) {
      setProgress(`Backfill: ${i} / ${todo.length}`)
      const res = await backfillRun(todo.slice(i, i + 10).map(r => ({
        orderId: r.orderId, shopifyGid: r.shopifyGid, shopifyName: r.shopifyName, customerGid: r.customerGid,
      })))
      if (res.error) { alert(res.error); break }
    }
    setProgress('')
    setBusy(null)
    await preview()
    await load()
  }

  if (!overview) {
    return <div className="flex items-center justify-center h-64"><p className="text-gray-400 text-sm">جاري التحميل...</p></div>
  }
  const c = overview.config
  const errorCount = overview.counts.error ?? 0
  const dryCount = overview.counts.dry_run ?? 0
  const testCount = overview.counts.test ?? 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">مزامنة Shopify و Meta</h1>
        <p className="text-sm text-gray-500 mt-0.5">تغيير حالة الطلب في اللوحة بيحدّث Shopify ويبلّغ Meta بالطلبات اللي اتسلّمت فعلاً.</p>
      </div>

      {!overview.migrated && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
          جداول المزامنة مش موجودة. شغّل <span className="font-mono">supabase/migrations/add_shopify_meta_sync.sql</span> في Supabase SQL Editor.
        </div>
      )}

      {overview.dryRun && (
        <div className="bg-violet-50 text-violet-800 text-sm px-4 py-3 rounded-lg border border-violet-200 flex items-center gap-2">
          <FlaskConical className="w-4 h-4 flex-shrink-0" />
          وضع التجربة مفعّل: المزامنة بتسجّل اللي كانت هتبعته بس، من غير ما تكلم Shopify أو Meta.
        </div>
      )}

      {/* Config + dry run */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-5 space-y-3" style={CARD}>
          <Status ok={c.shopify} label="Shopify"
            detail={c.shopify
              ? `${c.shopifyDomain} · ${c.shopifyAuth === 'static_token' ? 'Admin token' : 'Client credentials'} · API ${c.shopifyApiVersion}`
              : 'ناقص SHOPIFY_STORE_DOMAIN و token'} />
          <Status ok={c.meta} label="Meta Conversions API"
            detail={c.meta ? `Graph ${c.metaGraphVersion}${c.metaTestMode ? ' · Test event code مفعّل' : ''}` : 'ناقص META_DATASET_ID و META_CAPI_TOKEN'} />
          {c.metaTestMode && (
            <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
              الأحداث بتروح لـ Test Events بس. شيل META_TEST_EVENT_CODE لما تخلص الاختبار.
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl p-5" style={CARD}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">وضع التجربة (Dry run)</p>
              <p className="text-xs text-gray-500 mt-0.5">بيوري اللي هيتبعت من غير إرسال.</p>
            </div>
            <button
              onClick={toggleDryRun}
              disabled={busy === 'dry' || !overview.migrated}
              className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${overview.dryRun ? 'bg-violet-600' : 'bg-gray-300'}`}
              aria-label="Dry run"
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${overview.dryRun ? 'right-0.5' : 'right-[22px]'}`} />
            </button>
          </div>
          {!overview.dryRun && (dryCount > 0 || testCount > 0) && (
            <button
              onClick={() => runAll(['dry_run', 'test'], 'إرسال فعلي')}
              disabled={!!busy}
              className="mt-4 w-full flex items-center justify-center gap-2 bg-pink-700 hover:bg-pink-800 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg"
            >
              <PlayCircle className="w-4 h-4" />
              ابعت فعلياً {dryCount + testCount} طلب اتعمل لهم تجربة/اختبار قبل كده
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl p-5" style={CARD}>
          <p className="text-sm font-semibold text-gray-800 mb-3">ملخص</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SYNC_STATE_LABELS) as SyncState[]).filter(s => overview.counts[s]).map(s => (
              <span key={s} className={`text-xs px-2 py-1 rounded-lg border ${SYNC_STATE_COLORS[s]}`}>
                {SYNC_STATE_LABELS[s]}: <b>{overview.counts[s]}</b>
              </span>
            ))}
            {!Object.keys(overview.counts).length && <p className="text-xs text-gray-400">مفيش مزامنة لسه.</p>}
          </div>
        </div>
      </div>

      {/* Problems */}
      <div className="bg-white rounded-xl p-5" style={CARD}>
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-pink-500" />
            تحتاج متابعة
          </h2>
          {errorCount > 0 && (
            <button
              onClick={() => runAll(['error', 'pending'], 'إعادة المحاولة')}
              disabled={!!busy}
              className="flex items-center gap-1.5 text-xs font-semibold text-pink-700 hover:text-pink-800 disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy === 'all' ? 'animate-spin' : ''}`} />
              إعادة محاولة الكل ({errorCount})
            </button>
          )}
        </div>
        {progress && <p className="text-xs text-gray-500 mb-3">{progress}</p>}
        {problems.length === 0 ? (
          <p className="text-xs text-gray-400 italic">كل حاجة تمام.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-right font-medium pb-2 pl-3">الطلب</th>
                  <th className="text-right font-medium pb-2 pl-3">المزامنة</th>
                  <th className="text-right font-medium pb-2 pl-3">الحالة</th>
                  <th className="text-right font-medium pb-2 pl-3">التفاصيل</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {problems.map(p => (
                  <tr key={`${p.order_id}:${p.target}`} className="align-top">
                    <td className="py-2 pl-3 whitespace-nowrap">
                      <span className="font-mono text-xs font-semibold text-pink-700">{p.orders?.order_number}</span>
                      {p.orders?.shopify_order_name && (
                        <span className="block font-mono text-[11px] text-gray-400" dir="ltr">{p.orders.shopify_order_name}</span>
                      )}
                    </td>
                    <td className="py-2 pl-3 text-xs text-gray-700 whitespace-nowrap">{SYNC_TARGET_LABELS[p.target]}</td>
                    <td className="py-2 pl-3"><Chip state={p.state} /></td>
                    <td className="py-2 pl-3 text-[11px] text-gray-600 leading-relaxed max-w-md" dir="auto">{p.message}</td>
                    <td className="py-2">
                      {p.state !== 'running' && (
                        <button
                          onClick={() => retry(p.order_id, p.target)}
                          disabled={!!busy}
                          title="إعادة المحاولة"
                          className="p-1.5 text-gray-400 hover:text-pink-700 hover:bg-pink-50 rounded disabled:opacity-40"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${busy === `${p.order_id}:${p.target}` ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Refused CSV */}
      <div className="bg-white rounded-xl p-5" style={CARD}>
        <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <Download className="w-4 h-4 text-pink-500" />
          أرقام العملاء اللي رفضوا الاستلام
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          CSV فيه عمود واحد بالأرقام (201XXXXXXXXX) للطلبات المرتجعة في الفترة. ارفعه على Meta كـ Customer List واستبعده من الإعلانات.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">من:</span>
          <input type="date" value={csvFrom} onChange={e => setCsvFrom(e.target.value)}
            className="text-xs rounded-md px-2 py-1.5 bg-gray-100 text-gray-700 border-0 outline-none focus:ring-1 focus:ring-pink-400" />
          <span className="text-xs text-gray-400">إلى:</span>
          <input type="date" value={csvTo} onChange={e => setCsvTo(e.target.value)}
            className="text-xs rounded-md px-2 py-1.5 bg-gray-100 text-gray-700 border-0 outline-none focus:ring-1 focus:ring-pink-400" />
          <button
            onClick={exportCsv}
            disabled={busy === 'csv' || !csvFrom || !csvTo}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            تحميل CSV
          </button>
          {csvNote && <span className="text-xs text-gray-500">{csvNote}</span>}
        </div>
      </div>

      {/* Backfill */}
      <div className="bg-white rounded-xl p-5" style={CARD}>
        <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <History className="w-4 h-4 text-pink-500" />
          تحديث الطلبات القديمة (Backfill)
        </h2>
        {!c.backfillEnabled ? (
          <p className="text-xs text-gray-500">مقفول. فعّله بـ <span className="font-mono">SYNC_BACKFILL_ENABLED=true</span> لما تحتاجه، واقفله تاني بعد ما تخلص.</p>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-4">
              Shopify بس (Meta مش بتقبل أحداث أقدم من 7 أيام). طلبات SH القديمة بتتربط بطلبها على Shopify بالموبايل + الإجمالي + التاريخ. راجع المعاينة قبل التشغيل.
            </p>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs text-gray-400">من:</span>
              <input type="date" value={bfFrom} onChange={e => setBfFrom(e.target.value)}
                className="text-xs rounded-md px-2 py-1.5 bg-gray-100 text-gray-700 border-0 outline-none focus:ring-1 focus:ring-pink-400" />
              <span className="text-xs text-gray-400">إلى:</span>
              <input type="date" value={bfTo} onChange={e => setBfTo(e.target.value)}
                className="text-xs rounded-md px-2 py-1.5 bg-gray-100 text-gray-700 border-0 outline-none focus:ring-1 focus:ring-pink-400" />
              <button onClick={preview} disabled={!!busy}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-semibold">
                <Search className="w-3.5 h-3.5" />
                {busy === 'bf' ? 'جاري المعاينة...' : 'معاينة'}
              </button>
            </div>
            {bfWarning && <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 mb-3">{bfWarning}</p>}
            {bfRows && (() => {
              const counts = { linked: 0, matched: 0, ambiguous: 0, none: 0 }
              bfRows.forEach(r => counts[r.link]++)
              const todo = bfRows.filter(r => (r.link === 'linked' || r.link === 'matched') && r.syncState !== 'done')
              return (
                <>
                  <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
                    <span className="text-gray-600">مربوط: <b>{counts.linked}</b></span>
                    <span className="text-emerald-700">اتلاقى له تطابق: <b>{counts.matched}</b></span>
                    <span className="text-amber-700">أكتر من تطابق: <b>{counts.ambiguous}</b></span>
                    <span className="text-gray-400">من غير تطابق: <b>{counts.none}</b></span>
                    <button onClick={runBackfill} disabled={!!busy || !todo.length}
                      className="mr-auto flex items-center gap-2 bg-pink-700 hover:bg-pink-800 disabled:opacity-40 text-white px-4 py-2 rounded-lg font-semibold">
                      <PlayCircle className="w-3.5 h-3.5" />
                      تشغيل {todo.length} طلب {bfDryRun ? '(تجربة)' : ''}
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-gray-500 border-b border-gray-100">
                          <th className="text-right font-medium py-2 pl-3">الطلب</th>
                          <th className="text-right font-medium py-2 pl-3">التاريخ</th>
                          <th className="text-right font-medium py-2 pl-3">الحالة</th>
                          <th className="text-right font-medium py-2 pl-3">Shopify</th>
                          <th className="text-right font-medium py-2 pl-3">الإجراء</th>
                          <th className="text-right font-medium py-2">المزامنة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {bfRows.map(r => (
                          <tr key={r.orderId}>
                            <td className="py-1.5 pl-3 font-mono text-pink-700">{r.orderNumber}</td>
                            <td className="py-1.5 pl-3 text-gray-500 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                            <td className="py-1.5 pl-3 text-gray-600">{r.status}</td>
                            <td className="py-1.5 pl-3 font-mono" dir="ltr">
                              {r.shopifyName ?? (r.link === 'ambiguous' ? <span className="text-amber-600">ambiguous</span> : <span className="text-gray-300">—</span>)}
                              {r.link === 'matched' && <span className="text-emerald-600 mr-1">• new</span>}
                            </td>
                            <td className="py-1.5 pl-3 text-gray-600">{r.link === 'linked' || r.link === 'matched' ? r.action : '—'}</td>
                            <td className="py-1.5">{r.syncState ? <Chip state={r.syncState as SyncState} /> : <span className="text-gray-300">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            })()}
          </>
        )}
      </div>

      {/* Logs */}
      <div className="bg-white rounded-xl p-5" style={CARD}>
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <History className="w-4 h-4 text-pink-500" />
          سجل الاتصالات (آخر 100)
        </h2>
        {logs.length === 0 ? <p className="text-xs text-gray-400 italic">مفيش اتصالات لسه.</p> : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-gray-50">
                {logs.map(l => (
                  <tr key={l.id} className="align-top">
                    <td className="py-1.5 pl-3 text-gray-400 whitespace-nowrap">{new Date(l.created_at).toLocaleString('ar-EG')}</td>
                    <td className="py-1.5 pl-3 font-mono text-pink-700 whitespace-nowrap">{l.order_number}</td>
                    <td className="py-1.5 pl-3 whitespace-nowrap">
                      {l.dry_run ? <span className="text-violet-600">تجربة</span> : l.ok ? <span className="text-emerald-600">✓</span> : <span className="text-red-500">✗</span>}
                    </td>
                    <td className="py-1.5 pl-3 font-mono text-gray-500 whitespace-nowrap" dir="ltr">{l.action}</td>
                    <td className="py-1.5 text-gray-600 leading-relaxed" dir="auto">{l.message}</td>
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
