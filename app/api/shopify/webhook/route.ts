import { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { getNextOrderNumber } from '@/app/actions/orders'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Shopify payload types ────────────────────────────────────────────────────

interface ShopifyLineItem {
  title: string
  variant_title: string | null
  quantity: number
  price: string
}

interface ShopifyOrder {
  name: string
  customer?: { first_name?: string; last_name?: string; phone?: string }
  phone?: string
  shipping_address?: {
    name?: string
    phone?: string
    address1?: string
    address2?: string | null
    city?: string
    province?: string
  }
  line_items: ShopifyLineItem[]
  subtotal_price: string
  shipping_lines: { price: string }[]
  total_price: string
  note?: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function verifyShopifyHmac(rawBody: Buffer, shopifyHmac: string | null): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  if (!secret || !shopifyHmac) return false
  const computed = createHmac('sha256', secret).update(rawBody).digest('base64')
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(shopifyHmac))
  } catch {
    return false
  }
}

function buildProducts(lineItems: ShopifyLineItem[]): { text: string; total: number; count: number } {
  let total = 0
  let count = 0
  const blocks: string[] = []

  for (const item of lineItems) {
    const price = parseFloat(item.price) || 0
    const qty = item.quantity || 1
    total += price * qty
    count += qty

    // Parse color / size from variant_title (e.g. "Blue / Large")
    const parts = (item.variant_title ?? '').split(' / ')
    const color = parts[0]?.trim() || '-'
    const size  = parts[1]?.trim() || '-'

    for (let i = 0; i < qty; i++) {
      blocks.push(
        `${item.title}\nاللون ${color}\nالمقاس ${size}\nالسعر ${price}`
      )
    }
  }

  return { text: blocks.join('\n\n'), total, count }
}

function buildAddress(addr?: ShopifyOrder['shipping_address']): string {
  if (!addr) return '-'
  return [addr.address1, addr.address2, addr.city, addr.province]
    .filter(Boolean)
    .join('، ')
}

async function sendNotificationEmail(params: {
  orderNumber: string; customerName: string; address: string
  total: number; products: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.NOTIFICATION_EMAIL
  if (!apiKey || !to) return
  const resend = new Resend(apiKey)
  const totalFmt = params.total.toLocaleString('ar-EG')
  await resend.emails.send({
    from: 'Lady Fashion <onboarding@resend.dev>',
    to,
    subject: `طلب Shopify جديد #${params.orderNumber} — ${params.customerName} — ${totalFmt} ج.م`,
    html: `
      <div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#f5f4f2;padding:24px;border-radius:12px">
        <h2 style="color:#be185d;margin:0 0 16px">طلب Shopify #${params.orderNumber}</h2>
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden">
          <tr style="border-bottom:1px solid #f0f0f0">
            <td style="padding:10px 14px;color:#888;font-size:13px">العميل</td>
            <td style="padding:10px 14px;font-weight:600;font-size:13px">${params.customerName}</td>
          </tr>
          <tr style="border-bottom:1px solid #f0f0f0">
            <td style="padding:10px 14px;color:#888;font-size:13px">العنوان</td>
            <td style="padding:10px 14px;font-size:13px">${params.address}</td>
          </tr>
          <tr style="border-bottom:1px solid #f0f0f0">
            <td style="padding:10px 14px;color:#888;font-size:13px">المنتجات</td>
            <td style="padding:10px 14px;font-size:13px;white-space:pre-wrap">${params.products}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;color:#888;font-size:13px">الإجمالي</td>
            <td style="padding:10px 14px;font-weight:700;font-size:15px;color:#be185d">${totalFmt} ج.م</td>
          </tr>
        </table>
      </div>
    `,
  }).catch(() => {})
}

async function notifyAdmins(title: string, body: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return
  const admin = adminClient()
  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin')
  await Promise.all(
    (admins ?? []).map(a =>
      fetch(`${url}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ user_id: a.id, title, body }),
      }).catch(() => {})
    )
  )
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Read raw body for HMAC verification
  const rawBody = Buffer.from(await req.arrayBuffer())
  const shopifyHmac = req.headers.get('x-shopify-hmac-sha256')
  const topic = req.headers.get('x-shopify-topic')

  // 2. Verify signature
  if (!verifyShopifyHmac(rawBody, shopifyHmac)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Only handle orders/create
  if (topic !== 'orders/create') {
    return Response.json({ ok: true })
  }

  // 4. Parse order
  let shopifyOrder: ShopifyOrder
  try {
    shopifyOrder = JSON.parse(rawBody.toString('utf-8'))
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 5. Map fields
  const addr        = shopifyOrder.shipping_address
  const customerName =
    shopifyOrder.customer
      ? `${shopifyOrder.customer.first_name ?? ''} ${shopifyOrder.customer.last_name ?? ''}`.trim()
      : (addr?.name ?? 'عميل Shopify')
  const mobile      = shopifyOrder.phone ?? shopifyOrder.customer?.phone ?? addr?.phone ?? '-'
  const address     = buildAddress(addr)
  const { text: products, total: productsTotal, count: itemsCount } = buildProducts(shopifyOrder.line_items)
  const shippingCost = parseFloat(shopifyOrder.shipping_lines?.[0]?.price ?? '0') || 0
  const total        = parseFloat(shopifyOrder.total_price) || (productsTotal + shippingCost)
  const notes        = shopifyOrder.note || '-'

  // 6. Generate order number
  const orderNumber = await getNextOrderNumber('SH')

  // 7. Insert into Supabase
  const admin = adminClient()
  const { data: inserted, error } = await admin.from('orders').insert({
    order_number:          orderNumber,
    customer_name:         customerName,
    mobile,
    address,
    products,
    products_total:        productsTotal,
    shipping_cost:         shippingCost,
    total,
    amount_paid:           0,
    remaining:             total,
    items_count:           itemsCount,
    notes,
    payment_method:        'الدفع عند الاستلام',
    status:                'new',
    order_type:            'تسليم',
    returned_products:     null,
    returned_products_total: 0,
    migrated:              false,
    is_returned:           false,
    source:                'ممول',
    created_by:            null,
    created_by_name:       'Shopify',
  }).select('id, order_number').single()

  if (error) {
    console.error('Shopify webhook insert error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  // 8. Log status
  await admin.from('order_status_logs').insert({
    order_id:        inserted.id,
    order_number:    inserted.order_number,
    from_status:     null,
    to_status:       'new',
    changed_by:      null,
    changed_by_name: 'Shopify',
    note:            null,
  })

  // 9. Notify admins (email + push)
  const totalFmt = total.toLocaleString('ar-EG')
  await Promise.all([
    notifyAdmins(
      `طلب Shopify جديد #${orderNumber}`,
      `${customerName} · ${totalFmt} ج.م`
    ),
    sendNotificationEmail({ orderNumber, customerName, address, total, products }),
  ])

  return Response.json({ ok: true, order_number: orderNumber })
}
