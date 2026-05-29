'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, FileUp, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { bulkImportOrders, ImportOrderRow } from '@/app/actions/orders'
import { STATUS_LABELS, OrderStatus } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

const STATUS_REVERSE: Record<string, OrderStatus> = Object.fromEntries(
  Object.entries(STATUS_LABELS).map(([k, v]) => [v, k as OrderStatus])
)

function formatMobile(raw: unknown): string {
  const s = String(raw ?? '').replace(/\.0$/, '').trim()
  if (!s || s === 'null' || s === 'undefined') return ''
  return s.startsWith('0') ? s : '0' + s
}

function parseSheet(data: unknown[][]): ImportOrderRow[] {
  return data
    .slice(1) // skip header row
    .filter(row => row[13] && String(row[13]).trim()) // must have order_number
    .map(row => ({
      status:         STATUS_REVERSE[String(row[0] ?? '')] ?? 'new',
      payment_method: String(row[1] ?? 'الدفع عند الاستلام'),
      notes:          String(row[2] ?? '-') || '-',
      items_count:    Number(row[3]) || 1,
      remaining:      Number(row[4]) || 0,
      amount_paid:    Number(row[5]) || 0,
      total:          Number(row[6]) || 0,
      shipping_cost:  Number(row[7]) || 0,
      products_total: Number(row[8]) || 0,
      products:       String(row[9] ?? ''),
      address:        String(row[10] ?? ''),
      mobile:         formatMobile(row[11]),
      customer_name:  String(row[12] ?? ''),
      order_number:   String(row[13] ?? '').trim(),
    }))
}

export default function ImportPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ImportOrderRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; error?: string; count?: number } | null>(null)

  const handleFile = (file: File) => {
    setFileName(file.name)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
      setRows(parseSheet(data as unknown[][]))
    }
    reader.readAsBinaryString(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.xlsx') || file?.name.endsWith('.xls')) handleFile(file)
  }

  const handleImport = async () => {
    if (rows.length === 0) return
    setImporting(true)
    const res = await bulkImportOrders(rows)
    setResult(res)
    setImporting(false)
    if (res.success) {
      setTimeout(() => router.push('/dashboard/admin'), 1500)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/admin" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">استيراد طلبات من Excel</h1>
          <p className="text-sm text-gray-500 mt-0.5">يجب أن يكون الملف بنفس تنسيق تصدير Excel من التطبيق</p>
        </div>
      </div>

      {/* Upload zone */}
      <div
        className="bg-white rounded-xl p-8 text-center mb-5 cursor-pointer transition-colors"
        style={{ border: '2px dashed rgba(0,0,0,0.12)' }}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <FileUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        {fileName ? (
          <p className="text-gray-700 font-medium">{fileName}</p>
        ) : (
          <>
            <p className="text-gray-500 font-medium">اسحب ملف Excel هنا أو اضغط للاختيار</p>
            <p className="text-gray-400 text-sm mt-1">.xlsx أو .xls</p>
          </>
        )}
        {rows.length > 0 && (
          <p className="text-emerald-600 text-sm font-semibold mt-2">{rows.length} طلب جاهز للاستيراد</p>
        )}
      </div>

      {/* Result banner */}
      {result && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-5 text-sm font-medium ${
          result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`} style={{ border: `1px solid ${result.success ? 'rgba(5,150,105,0.2)' : 'rgba(220,38,38,0.2)'}` }}>
          {result.success
            ? <><CheckCircle className="w-4 h-4" /> تم استيراد {result.count} طلب بنجاح — جاري التحويل...</>
            : <><AlertCircle className="w-4 h-4" /> {result.error}</>
          }
        </div>
      )}

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl overflow-hidden mb-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-800">معاينة ({rows.length} طلب)</h2>
            <p className="text-xs text-gray-400">الطلبات الموجودة مسبقاً ستُتجاهل</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">#</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">رقم الأوردر</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">الاسم</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">الموبايل</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">الإجمالي</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">الباقي</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">الحالة</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">المنتجات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-pink-700">{row.order_number}</td>
                    <td className="px-4 py-2.5 text-gray-900 whitespace-nowrap">{row.customer_name}</td>
                    <td className="px-4 py-2.5 text-gray-600" dir="ltr">{row.mobile}</td>
                    <td className="px-4 py-2.5 text-gray-900 font-medium">{formatCurrency(row.total)}</td>
                    <td className="px-4 py-2.5">
                      <span className={Number(row.remaining) > 0 ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
                        {formatCurrency(row.remaining)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        {STATUS_LABELS[row.status as OrderStatus] ?? row.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[200px] truncate">
                      {row.products.split('\n')[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleImport}
          disabled={rows.length === 0 || importing || !!result?.success}
          className="flex items-center gap-2 bg-pink-700 hover:bg-pink-800 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          {importing
            ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري الاستيراد...</>
            : `استيراد ${rows.length > 0 ? rows.length + ' طلب' : ''}`
          }
        </button>
        <Link href="/dashboard/admin" className="btn-secondary px-6 py-3 text-center">
          إلغاء
        </Link>
      </div>
    </div>
  )
}
