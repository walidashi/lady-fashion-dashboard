'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { InventoryProduct } from '@/lib/inventory'
import { Search, RefreshCw, Package, AlertTriangle } from 'lucide-react'

interface Props {
  products: InventoryProduct[]
  error: string | null
}

function stockColor(qty: number) {
  if (qty === 0) return 'bg-red-100 text-red-700 border-red-200'
  if (qty <= 5)  return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-emerald-100 text-emerald-700 border-emerald-200'
}

function ProductCard({ product }: { product: InventoryProduct }) {
  // group variants by color
  const byColor = useMemo(() => {
    const map = new Map<string, typeof product.variants>()
    for (const v of product.variants) {
      const existing = map.get(v.color) ?? []
      map.set(v.color, [...existing, v])
    }
    return map
  }, [product.variants])

  return (
    <div
      className="bg-white rounded-xl p-4"
      style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
    >
      {/* Product header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 leading-snug">{product.name}</p>
          {product.code && (
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{product.code}</p>
          )}
        </div>
        <div className="flex-shrink-0 text-left">
          <p className="text-sm font-bold text-pink-700">{product.sale_price.toLocaleString('ar-EG')} ج.م</p>
          <p className={`text-xs font-semibold mt-0.5 text-left ${stockColor(product.total_qty).split(' ')[1]}`}>
            {product.total_qty} قطعة
          </p>
        </div>
      </div>

      {/* Variants grouped by color */}
      {product.variants.length === 0 ? (
        <p className="text-xs text-gray-400 italic">لا توجد أحجام</p>
      ) : (
        <div className="space-y-2">
          {Array.from(byColor.entries()).map(([color, variants]) => {
            const colorTotal = variants.reduce((s, v) => s + v.total_qty, 0)
            return (
              <div key={color}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-medium text-gray-600">{color}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${stockColor(colorTotal)}`}>
                    {colorTotal}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {variants
                    .slice()
                    .sort((a, b) => {
                      const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL']
                      return order.indexOf(a.size) - order.indexOf(b.size)
                    })
                    .map(v => (
                      <div
                        key={v.id}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${stockColor(v.total_qty)}`}
                        title={`مخزن: ${v.warehouse_qty} | حرام: ${v.haram_qty}`}
                      >
                        <span className="opacity-70">{v.size}</span>
                        <span className="font-bold">{v.total_qty}</span>
                      </div>
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function InventoryView({ products, error }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q))
    )
  }, [products, query])

  const totalProducts = products.length
  const totalUnits = products.reduce((s, p) => s + p.total_qty, 0)
  const outOfStock = products.filter(p => p.total_qty === 0).length

  const handleRefresh = async () => {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 1000)
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">المخزون</h1>
          <p className="text-sm text-gray-500 mt-0.5">بيانات مباشرة من نظام Lady Fashion</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl mb-5"
          style={{ border: '1px solid rgba(220,38,38,0.2)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stats strip */}
      {!error && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl px-4 py-3 text-center"
            style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
            <p className="text-2xl font-bold text-gray-900">{totalProducts}</p>
            <p className="text-xs text-gray-500 mt-0.5">منتج</p>
          </div>
          <div className="bg-white rounded-xl px-4 py-3 text-center"
            style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
            <p className="text-2xl font-bold text-emerald-600">{totalUnits.toLocaleString('ar-EG')}</p>
            <p className="text-xs text-gray-500 mt-0.5">قطعة إجمالي</p>
          </div>
          <div className="bg-white rounded-xl px-4 py-3 text-center"
            style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
            <p className={`text-2xl font-bold ${outOfStock > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {outOfStock}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">نفد المخزون</p>
          </div>
        </div>
      )}

      {/* Search */}
      {!error && (
        <div className="relative mb-5">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="بحث باسم المنتج أو الكود..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="input-field pr-9"
          />
        </div>
      )}

      {/* Legend */}
      {!error && (
        <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-200 border border-emerald-300" />
            متوفر (6+)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-200 border border-amber-300" />
            منخفض (1–5)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-200 border border-red-300" />
            نفد
          </span>
          <span className="mr-auto text-gray-400 italic text-[11px]">
            مرر على الحجم لرؤية تفاصيل الفروع
          </span>
        </div>
      )}

      {/* Product grid */}
      {!error && filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Package className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">{query ? 'لا توجد نتائج للبحث' : 'لا توجد منتجات'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
