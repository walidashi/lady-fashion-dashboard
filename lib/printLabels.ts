import { Order } from './types'

function hubLabel(orderNumber: string): string {
  const prefix = orderNumber.replace(/\d+$/, '').toUpperCase()
  const map: Record<string, string> = {
    J: 'القاهرة والجيزة',
    C: 'محافظات مجاورة',
    F: 'محافظات بعيدة',
  }
  return map[prefix] ?? ''
}

async function logoBase64(): Promise<string> {
  try {
    const res = await fetch('/logo.webp')
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

export async function printLabels(orders: Order[]) {
  const logo = await logoBase64()

  const labelsHtml = orders
    .map((order) => {
      const hub = hubLabel(order.order_number)
      const cod = Number(order.remaining) || 0
      const date = new Date(order.created_at).toLocaleDateString('ar-EG')
      const productsText = order.products
        .replace(/\n\n+/g, ' | ')
        .replace(/\n/g, ' ')

      return `
<div class="bol">
<div class="label">
  <div class="header">
    <div class="header-logo">${logo ? `<img src="${logo}" alt="logo">` : ''}</div>
    <div class="header-type">تسليم</div>
    <div class="header-hub">${hub}</div>
  </div>
  <div class="cod-row">
    <span class="cod-amount">مبلغ التحصيل: ${cod.toLocaleString('ar-EG')} ج.م</span>
  </div>
  <div class="info-table">
    <div class="merchant-cell">
      <span class="lbl">التاجر:</span>
      <span class="val">ليدي فاشيون</span>
    </div>
    <div class="recipient-cell">
      <span class="lbl">تسليم إلى:</span>
      <span class="recipient-name">${order.customer_name}</span>
      <span class="recipient-phone">${order.mobile}</span>
    </div>
  </div>
  <div class="address-row">
    <span class="lbl">العنوان |</span> ${order.address}
  </div>
  <div class="shipment-row">
    <div class="badges">
      <span class="badge">فتح الشحنة : نعم</span>
      <span class="badge">${order.items_count} قطعة</span>
    </div>
    <div class="desc">
      <span class="lbl">وصف الشحنة |</span> ${productsText}
    </div>
  </div>
  <div class="footer">
    <div class="footer-table">
      <div class="tracking-cell">
        <span class="tracking-lbl">Tracking Number</span>
        <span class="tracking-val">${order.order_number}</span>
      </div>
      <div class="notes-cell">
        <span class="lbl">ملاحظات |</span> ${order.notes && order.notes !== '-' ? order.notes : '-'}
      </div>
    </div>
    <div class="created-bar">Created: ${date}</div>
  </div>
</div>
</div>`
    })
    .join('\n')

  const css = `
@page { size: 101.6mm 152.4mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Tahoma, sans-serif; direction: rtl; }
.bol { width: 101.6mm; height: 152.4mm; page-break-after: always; }
.label { position: relative; width: 100%; height: 152.4mm; border: 3px solid #000; overflow: hidden; }
.header { border-bottom: 2.5px solid #000; padding: 2mm 2.5mm; min-height: 16mm; overflow: hidden; }
.header-logo { float: left; line-height: 0; }
.header-logo img { height: 13mm; max-width: 32mm; object-fit: contain; }
.header-type { float: right; font-size: 18pt; font-weight: bold; line-height: 13mm; }
.header-hub { text-align: center; font-size: 8pt; font-weight: bold; line-height: 13mm; }
.cod-row { border-bottom: 2.5px solid #000; padding: 2.5mm 3mm; text-align: right; }
.cod-amount { font-size: 13pt; font-weight: bold; }
.info-table { display: table; width: 100%; border-bottom: 2.5px solid #000; min-height: 22mm; }
.merchant-cell { display: table-cell; width: 28mm; border-left: 2.5px solid #000; vertical-align: middle; text-align: center; padding: 2mm 1.5mm; }
.merchant-cell .lbl { font-size: 7.5pt; font-weight: bold; display: block; margin-bottom: 1mm; }
.merchant-cell .val { font-size: 8pt; display: block; }
.recipient-cell { display: table-cell; vertical-align: middle; padding: 2.5mm 3mm; text-align: right; }
.recipient-cell .lbl { font-size: 7.5pt; font-weight: bold; display: block; margin-bottom: 1mm; }
.recipient-name { font-size: 12pt; font-weight: bold; line-height: 1.25; }
.recipient-phone { font-size: 9.5pt; margin-top: 1mm; display: block; }
.address-row { border-bottom: 2.5px solid #000; padding: 2mm 3mm; text-align: right; font-size: 8pt; line-height: 1.45; }
.address-row .lbl { font-weight: bold; }
.shipment-row { padding: 2.5mm 3mm; text-align: right; padding-bottom: 30mm; }
.badges { margin-bottom: 2mm; text-align: right; }
.badge { display: inline-block; border: 2px solid #000; border-radius: 3mm; padding: 0.5mm 2.5mm; font-size: 7.5pt; margin-right: 1.5mm; }
.desc { font-size: 8pt; line-height: 1.4; }
.desc .lbl { font-weight: bold; }
.footer { position: absolute; bottom: 0; left: 0; right: 0; border-top: 2.5px solid #000; background: #fff; }
.footer-table { display: table; width: 100%; height: 20mm; }
.tracking-cell { display: table-cell; width: 42%; border-left: 2.5px solid #000; vertical-align: middle; padding: 2mm; direction: ltr; }
.tracking-lbl { font-size: 6pt; color: #555; display: block; margin-bottom: 1mm; }
.tracking-val { font-size: 10pt; font-weight: bold; word-break: break-all; }
.notes-cell { display: table-cell; vertical-align: middle; padding: 2mm 2.5mm; text-align: right; font-size: 8.5pt; }
.notes-cell .lbl { font-weight: bold; }
.created-bar { border-top: 2px solid #000; text-align: center; font-size: 7pt; color: #444; padding: 2mm; }
`

  const html = `<!DOCTYPE html>
<html lang="ar">
<head>
<meta charset="UTF-8">
<style>${css}</style>
</head>
<body>
${labelsHtml}
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}
