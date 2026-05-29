'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createOrder, getNextOrderNumber } from '@/app/actions/orders'
import { PAYMENT_METHODS, formatProductItems } from '@/lib/types'
import { Plus, Trash2, ArrowRight, ShoppingBag } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const REGIONS = [
  { prefix: 'J', label: 'القاهرة والجيزة' },
  { prefix: 'C', label: 'محافظات مجاورة' },
  { prefix: 'F', label: 'محافظات بعيدة' },
] as const

type RegionPrefix = 'J' | 'C' | 'F'

const productSchema = z.object({
  name: z.string().min(1, 'اسم المنتج مطلوب'),
  color: z.string().min(1, 'اللون مطلوب'),
  size: z.string().min(1, 'المقاس مطلوب'),
  price: z.coerce.number().min(1, 'السعر مطلوب'),
})

const SOURCES = [
  { value: 'اورجانيك', label: 'اورجانيك' },
  { value: 'ممول', label: 'ممول' },
] as const

const schema = z.object({
  region: z.enum(['J', 'C', 'F'], { required_error: 'اختر المنطقة' }),
  source: z.enum(['اورجانيك', 'ممول'], { required_error: 'اختر نوع الأوردر' }),
  customer_name: z.string().min(1, 'الاسم مطلوب'),
  mobile: z.string().min(10, 'رقم الموبايل غير صحيح'),
  address: z.string().min(10, 'العنوان مطلوب'),
  products: z.array(productSchema).min(1, 'أضف منتجاً واحداً على الأقل'),
  shipping_cost: z.coerce.number().min(0),
  amount_paid: z.coerce.number().min(0),
  payment_method: z.string().min(1),
  notes: z.string().default('-'),
})

type FormData = z.infer<typeof schema>

export default function NewOrderPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      shipping_cost: 75,
      amount_paid: 0,
      payment_method: 'الدفع عند الاستلام',
      notes: '-',
      products: [{ name: '', color: '', size: '', price: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'products' })

  const selectedRegion = watch('region') as RegionPrefix | undefined
  const selectedSource = watch('source')
  const productList = watch('products')
  const productsTotal = productList.reduce((sum, p) => sum + (Number(p.price) || 0), 0)
  const shippingCost = Number(watch('shipping_cost')) || 0
  const amountPaid = Number(watch('amount_paid')) || 0
  const total = productsTotal + shippingCost
  const remaining = total - amountPaid

  const onSubmit = async (data: FormData) => {
    setSubmitting(true)
    setServerError('')

    const orderNumber = await getNextOrderNumber(data.region)

    const result = await createOrder({
      order_number: orderNumber,
      customer_name: data.customer_name,
      mobile: data.mobile,
      address: data.address,
      products: formatProductItems(data.products),
      products_total: productsTotal,
      shipping_cost: shippingCost,
      amount_paid: amountPaid,
      items_count: data.products.length,
      notes: data.notes || '-',
      payment_method: data.payment_method,
      source: data.source,
    })

    if (result.error) {
      setServerError(result.error)
      setSubmitting(false)
      return
    }

    router.push('/dashboard/employee')
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/employee" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">إضافة طلب جديد</h1>
          <p className="text-sm text-gray-500">أدخل بيانات الطلب من رسائل الإنستجرام</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Order info */}
        <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-pink-500" />
            بيانات الأوردر
          </h2>

          {/* Region selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              المنطقة <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {REGIONS.map(({ prefix, label }) => (
                <button
                  key={prefix}
                  type="button"
                  onClick={() => setValue('region', prefix, { shouldValidate: true })}
                  className={cn(
                    'flex flex-col items-center py-4 px-2 rounded-xl border-2 transition-all',
                    selectedRegion === prefix
                      ? 'border-pink-600 bg-pink-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  )}
                >
                  <span className={cn(
                    'text-2xl font-black mb-1 font-mono',
                    selectedRegion === prefix ? 'text-pink-700' : 'text-gray-400'
                  )}>
                    {prefix}
                  </span>
                  <span className={cn(
                    'text-xs text-center leading-tight',
                    selectedRegion === prefix ? 'text-pink-700 font-semibold' : 'text-gray-500'
                  )}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
            {errors.region && <p className="error-text mt-1">{errors.region.message}</p>}
          </div>

          {/* Source selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              نوع الأوردر <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {SOURCES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('source', value, { shouldValidate: true })}
                  className={cn(
                    'py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all',
                    selectedSource === value
                      ? value === 'اورجانيك'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-500'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {errors.source && <p className="error-text mt-1">{errors.source.message}</p>}
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              طريقة الدفع <span className="text-red-500">*</span>
            </label>
            <select {...register('payment_method')} className="input-field">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Customer info */}
        <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 className="font-semibold text-gray-800 mb-4">بيانات العميل</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  الاسم <span className="text-red-500">*</span>
                </label>
                <input {...register('customer_name')} className="input-field" placeholder="اسم العميل" />
                {errors.customer_name && <p className="error-text">{errors.customer_name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  رقم الموبايل <span className="text-red-500">*</span>
                </label>
                <input {...register('mobile')} className="input-field" placeholder="01xxxxxxxxx" dir="ltr" />
                {errors.mobile && <p className="error-text">{errors.mobile.message}</p>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                العنوان <span className="text-red-500">*</span>
              </label>
              <textarea {...register('address')} rows={3} className="input-field resize-none" placeholder="العنوان بالكامل..." />
              {errors.address && <p className="error-text">{errors.address.message}</p>}
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">المنتجات</h2>
            <button
              type="button"
              onClick={() => append({ name: '', color: '', size: '', price: 0 })}
              className="flex items-center gap-1.5 text-pink-700 hover:text-pink-800 text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              إضافة منتج
            </button>
          </div>

          {errors.products && typeof errors.products.message === 'string' && (
            <p className="error-text mb-3">{errors.products.message}</p>
          )}

          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="bg-gray-50 rounded-lg p-4 relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-600">منتج {index + 1}</span>
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(index)} className="text-red-400 hover:text-red-600 transition-colors p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <input {...register(`products.${index}.name`)} className="input-field" placeholder="اسم المنتج (مثال: شميز بوبلين)" />
                    {errors.products?.[index]?.name && <p className="error-text">{errors.products[index]?.name?.message}</p>}
                  </div>
                  <div>
                    <input {...register(`products.${index}.color`)} className="input-field" placeholder="اللون" />
                    {errors.products?.[index]?.color && <p className="error-text">{errors.products[index]?.color?.message}</p>}
                  </div>
                  <div>
                    <input {...register(`products.${index}.size`)} className="input-field" placeholder="المقاس (مثال: M, L, XL)" />
                    {errors.products?.[index]?.size && <p className="error-text">{errors.products[index]?.size?.message}</p>}
                  </div>
                  <div className="col-span-2">
                    <div className="relative">
                      <input type="number" {...register(`products.${index}.price`)} className="input-field pl-14" placeholder="السعر" min={0} dir="ltr" />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">ج.م</span>
                    </div>
                    {errors.products?.[index]?.price && <p className="error-text">{errors.products[index]?.price?.message}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Financial */}
        <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 className="font-semibold text-gray-800 mb-4">التفاصيل المالية</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">تكلفة الشحن</label>
              <div className="relative">
                <input type="number" {...register('shipping_cost')} className="input-field pl-14" min={0} dir="ltr" />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">ج.م</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">المبلغ المدفوع</label>
              <div className="relative">
                <input type="number" {...register('amount_paid')} className="input-field pl-14" min={0} dir="ltr" />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">ج.م</span>
              </div>
            </div>
          </div>
          <div className="bg-pink-50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>إجمالي المنتجات</span>
              <span className="font-medium">{productsTotal.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>الشحن</span>
              <span className="font-medium">{shippingCost.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>المدفوع</span>
              <span className="font-medium text-green-600">- {amountPaid.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 border-t border-pink-200 pt-2">
              <span>الإجمالي الكلي</span>
              <span>{total.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>الباقي</span>
              <span className={remaining > 0 ? 'text-orange-600' : 'text-green-600'}>
                {remaining.toLocaleString('ar-EG')} ج.م
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 className="font-semibold text-gray-800 mb-4">ملاحظات</h2>
          <textarea {...register('notes')} rows={2} className="input-field resize-none" placeholder="أي ملاحظات إضافية..." />
        </div>

        {serverError && (
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg" style={{ border: '1px solid rgba(220,38,38,0.2)' }}>
            {serverError}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-pink-700 hover:bg-pink-800 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {submitting ? 'جاري الحفظ...' : 'حفظ الطلب'}
          </button>
          <Link href="/dashboard/employee" className="btn-secondary px-6 py-3 text-center">
            إلغاء
          </Link>
        </div>
      </form>
    </div>
  )
}
