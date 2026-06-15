'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createOrder, getNextOrderNumber } from '@/app/actions/orders'
import { PAYMENT_METHODS, formatProductItems, OrderType } from '@/lib/types'
import { InventoryProduct } from '@/lib/inventory'
import { Plus, Trash2, ArrowRight, ShoppingBag, PenLine, Boxes } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const REGIONS = [
  { prefix: 'J', label: 'القاهرة والجيزة' },
  { prefix: 'C', label: 'محافظات مجاورة' },
  { prefix: 'F', label: 'محافظات بعيدة' },
] as const

type RegionPrefix = 'J' | 'C' | 'F'

const ORDER_TYPES: { value: OrderType; label: string; activeClass: string }[] = [
  { value: 'تسليم',   label: 'تسليم',   activeClass: 'border-pink-600 bg-pink-50 text-pink-700' },
  { value: 'استرجاع', label: 'استرجاع', activeClass: 'border-red-500 bg-red-50 text-red-700' },
  { value: 'استبدال', label: 'استبدال', activeClass: 'border-amber-500 bg-amber-50 text-amber-700' },
]

const SOURCES = [
  { value: 'اورجانيك', label: 'اورجانيك' },
  { value: 'ممول', label: 'ممول' },
] as const

const productSchema = z.object({
  name: z.string().min(1, 'اسم المنتج مطلوب'),
  color: z.string().min(1, 'اللون مطلوب'),
  size: z.string().min(1, 'المقاس مطلوب'),
  price: z.coerce.number().min(1, 'السعر مطلوب'),
})

const schema = z.object({
  order_type: z.enum(['تسليم', 'استرجاع', 'استبدال']).default('تسليم'),
  region: z.enum(['J', 'C', 'F'], { required_error: 'اختر المنطقة' }),
  source: z.enum(['اورجانيك', 'ممول'], { required_error: 'اختر نوع الأوردر' }),
  customer_name: z.string().min(1, 'الاسم مطلوب'),
  mobile: z.string().min(10, 'رقم الموبايل غير صحيح'),
  address: z.string().min(10, 'العنوان مطلوب'),
  products: z.array(productSchema).min(1, 'أضف منتجاً واحداً على الأقل'),
  returned_products: z.array(productSchema).optional().default([]),
  shipping_cost: z.coerce.number().min(0),
  amount_paid: z.coerce.number().min(0),
  payment_method: z.string().min(1),
  notes: z.string().default('-'),
}).superRefine((data, ctx) => {
  if (data.order_type === 'استبدال' && (!data.returned_products || data.returned_products.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'أضف منتجاً مرتجعاً على الأقل', path: ['returned_products'] })
  }
})

type FormData = z.infer<typeof schema>

function computeFinancials(
  orderType: OrderType,
  productsTotal: number,
  shippingCost: number,
  returnedTotal: number,
  amountPaid: number
) {
  const total =
    orderType === 'تسليم'   ? productsTotal + shippingCost :
    orderType === 'استرجاع' ? -productsTotal + shippingCost :
    (productsTotal + shippingCost) - returnedTotal
  return { total, remaining: total - amountPaid }
}

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL']

interface ProductEntryProps {
  index: number
  fieldId: string
  isLast: boolean
  register: ReturnType<typeof useForm<FormData>>['register']
  errors: ReturnType<typeof useForm<FormData>>['formState']['errors']
  setValue: ReturnType<typeof useForm<FormData>>['setValue']
  onRemove: () => void
  inventoryProducts: InventoryProduct[]
}

function ProductEntry({ index, fieldId, isLast, register, errors, setValue, onRemove, inventoryProducts }: ProductEntryProps) {
  const hasInventory = inventoryProducts.length > 0
  const [mode, setMode] = useState<'inventory' | 'manual'>(hasInventory ? 'inventory' : 'manual')
  const [selectedProdId, setSelectedProdId] = useState<number | null>(null)
  const [selectedColor, setSelectedColor] = useState<string>('')

  const selectedProduct = inventoryProducts.find(p => p.id === selectedProdId) ?? null
  const availableColors = selectedProduct
    ? [...new Set(selectedProduct.variants.map(v => v.color))]
    : []
  const availableSizes = (selectedProduct && selectedColor)
    ? selectedProduct.variants
        .filter(v => v.color === selectedColor)
        .map(v => v.size)
        .sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))
    : []

  function selectProduct(id: number | null) {
    const p = inventoryProducts.find(pr => pr.id === id) ?? null
    setSelectedProdId(id)
    setSelectedColor('')
    setValue(`products.${index}.name`, p?.name ?? '')
    setValue(`products.${index}.price`, p?.sale_price ?? 0)
    setValue(`products.${index}.color`, '')
    setValue(`products.${index}.size`, '')
  }

  function selectColor(color: string) {
    setSelectedColor(color)
    setValue(`products.${index}.color`, color)
    setValue(`products.${index}.size`, '')
  }

  function selectSize(size: string) {
    setValue(`products.${index}.size`, size)
  }

  function switchToManual() {
    setMode('manual')
  }

  function switchToInventory() {
    setMode('inventory')
    setSelectedProdId(null)
    setSelectedColor('')
    setValue(`products.${index}.name`, '')
    setValue(`products.${index}.price`, 0)
    setValue(`products.${index}.color`, '')
    setValue(`products.${index}.size`, '')
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4 relative">
      {/* Row header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-600">منتج {index + 1}</span>
        <div className="flex items-center gap-2">
          {mode === 'inventory' && hasInventory ? (
            <button
              type="button"
              onClick={switchToManual}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              <PenLine className="w-3 h-3" />
              كتابة يدوي
            </button>
          ) : hasInventory ? (
            <button
              type="button"
              onClick={switchToInventory}
              className="flex items-center gap-1 text-[11px] text-pink-500 hover:text-pink-700 transition-colors"
            >
              <Boxes className="w-3 h-3" />
              اختيار من المخزون
            </button>
          ) : null}
          {!isLast && (
            <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 transition-colors p-1">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {mode === 'inventory' ? (
        <div className="space-y-3">
          {/* Product picker */}
          <div>
            <select
              className="input-field"
              value={selectedProdId ?? ''}
              onChange={e => selectProduct(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">اختر المنتج...</option>
              {inventoryProducts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.code ? ` — ${p.code}` : ''}
                </option>
              ))}
            </select>
            {errors.products?.[index]?.name && (
              <p className="error-text">{errors.products[index]?.name?.message}</p>
            )}
          </div>

          {selectedProduct && (
            <>
              {/* Color + Size */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <select
                    className="input-field"
                    value={selectedColor}
                    onChange={e => selectColor(e.target.value)}
                  >
                    <option value="">اختر اللون...</option>
                    {availableColors.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {errors.products?.[index]?.color && (
                    <p className="error-text">{errors.products[index]?.color?.message}</p>
                  )}
                </div>
                <div>
                  <select
                    className="input-field"
                    disabled={!selectedColor}
                    defaultValue=""
                    onChange={e => selectSize(e.target.value)}
                  >
                    <option value="">اختر المقاس...</option>
                    {availableSizes.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {errors.products?.[index]?.size && (
                    <p className="error-text">{errors.products[index]?.size?.message}</p>
                  )}
                </div>
              </div>

              {/* Price (auto-filled, read-only) */}
              <div className="relative">
                <input
                  type="number"
                  {...register(`products.${index}.price`)}
                  className="input-field pl-14 bg-gray-100 cursor-default"
                  readOnly
                  dir="ltr"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">ج.م</span>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">سعر البيع</span>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Manual mode */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-2">
            <input
              {...register(`products.${index}.name`)}
              className="input-field"
              placeholder="اسم المنتج"
            />
            {errors.products?.[index]?.name && (
              <p className="error-text">{errors.products[index]?.name?.message}</p>
            )}
          </div>
          <div>
            <input
              {...register(`products.${index}.color`)}
              className="input-field"
              placeholder="اللون"
            />
            {errors.products?.[index]?.color && (
              <p className="error-text">{errors.products[index]?.color?.message}</p>
            )}
          </div>
          <div>
            <input
              {...register(`products.${index}.size`)}
              className="input-field"
              placeholder="المقاس (M, L, XL)"
            />
            {errors.products?.[index]?.size && (
              <p className="error-text">{errors.products[index]?.size?.message}</p>
            )}
          </div>
          <div className="col-span-2">
            <div className="relative">
              <input
                type="number"
                {...register(`products.${index}.price`)}
                className="input-field pl-14"
                placeholder="السعر"
                min={0}
                dir="ltr"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">ج.م</span>
            </div>
            {errors.products?.[index]?.price && (
              <p className="error-text">{errors.products[index]?.price?.message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface Props {
  inventoryProducts: InventoryProduct[]
}

export default function NewOrderForm({ inventoryProducts }: Props) {
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
      order_type: 'تسليم',
      shipping_cost: 75,
      amount_paid: 0,
      payment_method: 'الدفع عند الاستلام',
      notes: '-',
      products: [{ name: '', color: '', size: '', price: 0 }],
      returned_products: [],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'products' })
  const { fields: returnedFields, append: appendReturned, remove: removeReturned } =
    useFieldArray({ control, name: 'returned_products' })

  const orderType      = watch('order_type') as OrderType
  const selectedRegion = watch('region') as RegionPrefix | undefined
  const selectedSource = watch('source')
  const productList    = watch('products')
  const returnedList   = watch('returned_products') ?? []
  const productsTotal  = productList.reduce((sum, p) => sum + (Number(p.price) || 0), 0)
  const returnedTotal  = returnedList.reduce((sum, p) => sum + (Number(p.price) || 0), 0)
  const shippingCost   = Number(watch('shipping_cost')) || 0
  const amountPaid     = Number(watch('amount_paid')) || 0
  const { total, remaining } = computeFinancials(orderType, productsTotal, shippingCost, returnedTotal, amountPaid)

  const onSubmit = async (data: FormData) => {
    setSubmitting(true)
    setServerError('')

    const orderNumber = await getNextOrderNumber(data.region)

    const result = await createOrder({
      order_number:            orderNumber,
      customer_name:           data.customer_name,
      mobile:                  data.mobile,
      address:                 data.address,
      products:                formatProductItems(data.products),
      products_total:          productsTotal,
      shipping_cost:           shippingCost,
      total,
      amount_paid:             amountPaid,
      remaining,
      items_count:             data.products.length,
      notes:                   data.notes || '-',
      payment_method:          data.payment_method,
      source:                  data.source,
      order_type:              data.order_type,
      returned_products:       data.order_type === 'استبدال' && data.returned_products?.length
                                 ? formatProductItems(data.returned_products)
                                 : null,
      returned_products_total: data.order_type === 'استبدال' ? returnedTotal : 0,
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

          {/* Order type */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              نوع العملية <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {ORDER_TYPES.map(({ value, label, activeClass }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('order_type', value, { shouldValidate: true })}
                  className={cn(
                    'py-3 rounded-xl border-2 text-sm font-bold transition-all',
                    orderType === value ? activeClass : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Region */}
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

          {/* Source */}
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم <span className="text-red-500">*</span></label>
                <input {...register('customer_name')} className="input-field" placeholder="اسم العميل" />
                {errors.customer_name && <p className="error-text">{errors.customer_name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">رقم الموبايل <span className="text-red-500">*</span></label>
                <input {...register('mobile')} className="input-field" placeholder="01xxxxxxxxx" dir="ltr" />
                {errors.mobile && <p className="error-text">{errors.mobile.message}</p>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">العنوان <span className="text-red-500">*</span></label>
              <textarea {...register('address')} rows={3} className="input-field resize-none" placeholder="العنوان بالكامل..." />
              {errors.address && <p className="error-text">{errors.address.message}</p>}
            </div>
          </div>
        </div>

        {/* Outgoing products */}
        <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">
              {orderType === 'استبدال' ? 'المنتجات الصادرة' : 'المنتجات'}
            </h2>
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
              <ProductEntry
                key={field.id}
                fieldId={field.id}
                index={index}
                isLast={fields.length === 1}
                register={register}
                errors={errors}
                setValue={setValue}
                onRemove={() => remove(index)}
                inventoryProducts={inventoryProducts}
              />
            ))}
          </div>
        </div>

        {/* Returned products (exchange only) */}
        {orderType === 'استبدال' && (
          <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(220,38,38,0.2)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-red-700 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
                المنتجات المرتجعة
              </h2>
              <button
                type="button"
                onClick={() => appendReturned({ name: '', color: '', size: '', price: 0 })}
                className="flex items-center gap-1.5 text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                إضافة منتج مرتجع
              </button>
            </div>
            {errors.returned_products && typeof errors.returned_products.message === 'string' && (
              <p className="error-text mb-3">{errors.returned_products.message}</p>
            )}
            {returnedFields.length === 0 && (
              <button
                type="button"
                onClick={() => appendReturned({ name: '', color: '', size: '', price: 0 })}
                className="w-full py-4 border-2 border-dashed border-red-200 rounded-lg text-red-400 text-sm hover:border-red-300 transition-colors"
              >
                + أضف منتجاً مرتجعاً
              </button>
            )}
            <div className="space-y-4">
              {returnedFields.map((field, index) => (
                <div key={field.id} className="bg-red-50 rounded-lg p-4 relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-red-600">مرتجع {index + 1}</span>
                    <button type="button" onClick={() => removeReturned(index)} className="text-red-400 hover:text-red-600 transition-colors p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <input {...register(`returned_products.${index}.name`)} className="input-field" placeholder="اسم المنتج" />
                      {errors.returned_products?.[index]?.name && <p className="error-text">{errors.returned_products[index]?.name?.message}</p>}
                    </div>
                    <div>
                      <input {...register(`returned_products.${index}.color`)} className="input-field" placeholder="اللون" />
                    </div>
                    <div>
                      <input {...register(`returned_products.${index}.size`)} className="input-field" placeholder="المقاس" />
                    </div>
                    <div className="col-span-2">
                      <div className="relative">
                        <input type="number" {...register(`returned_products.${index}.price`)} className="input-field pl-14" placeholder="السعر" min={0} dir="ltr" />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">ج.م</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {orderType === 'استرجاع' ? 'المبلغ المسترد بالفعل' : 'المبلغ المدفوع'}
              </label>
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
            {orderType === 'استبدال' && (
              <div className="flex justify-between text-gray-600">
                <span>إجمالي المرتجع</span>
                <span className="font-medium text-red-600">- {returnedTotal.toLocaleString('ar-EG')} ج.م</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>الشحن</span>
              <span className="font-medium">{shippingCost.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>{orderType === 'استرجاع' ? 'تم استرداده' : 'المدفوع'}</span>
              <span className="font-medium text-green-600">- {amountPaid.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 border-t border-pink-200 pt-2">
              <span>الإجمالي</span>
              <span className={total < 0 ? 'text-red-600' : ''}>{total.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>{orderType === 'استرجاع' ? 'المتبقي للعميل' : 'الباقي'}</span>
              <span className={remaining < 0 ? 'text-red-600' : remaining > 0 ? 'text-orange-600' : 'text-green-600'}>
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
