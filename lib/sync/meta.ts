// Meta Conversions API sender for the DeliveredPurchase event. Server-only.
import { META_GRAPH_VERSION, META_MAX_EVENT_AGE_SECONDS, metaEnv } from './config'
import { gidToId, normalizeEgPhone, sha256 } from './phone'

export class MetaError extends Error {}

export interface DeliveredEventInput {
  shopifyOrderGid: string
  shopifyOrderName: string        // "#1234"
  shopifyCustomerGid: string | null
  phone: string | null            // as stored in the dashboard
  amountCollected: number
  deliveredAt: Date
}

export type BuildResult =
  | { ok: true; event: Record<string, unknown>; summary: string }
  | { ok: false; skip: true; reason: string }
  | { ok: false; skip: false; reason: string }

/** Builds the event, or explains why it can't or shouldn't be sent. */
export function buildDeliveredEvent(input: DeliveredEventInput, now = new Date()): BuildResult {
  const orderId = gidToId(input.shopifyOrderGid)
  if (!orderId) return { ok: false, skip: false, reason: 'Order is not linked to a Shopify order' }

  const eventTime = Math.floor(input.deliveredAt.getTime() / 1000)
  const age = Math.floor(now.getTime() / 1000) - eventTime
  if (age > META_MAX_EVENT_AGE_SECONDS) {
    const days = Math.floor(age / 86_400)
    return { ok: false, skip: true, reason: `Delivered ${days} days ago; Meta only accepts events up to 7 days old` }
  }

  const phone = normalizeEgPhone(input.phone)
  const customerId = gidToId(input.shopifyCustomerGid)
  if (!phone && !customerId) {
    return { ok: false, skip: false, reason: 'No valid Egyptian mobile and no Shopify customer ID, so Meta has nothing to match on' }
  }

  const userData: Record<string, string[]> = { country: [sha256('eg')] }
  if (phone) userData.ph = [sha256(phone)]
  if (customerId) userData.external_id = [sha256(customerId)]

  const event = {
    event_name: 'DeliveredPurchase',
    event_time: Math.min(eventTime, Math.floor(now.getTime() / 1000)),
    event_id: `dlv_${orderId}`,
    action_source: 'system_generated',
    user_data: userData,
    custom_data: {
      value: Math.round(input.amountCollected * 100) / 100,
      currency: 'EGP',
      order_id: input.shopifyOrderName,
    },
  }

  const summary = [
    `event_id=dlv_${orderId}`,
    `value=${event.custom_data.value} EGP`,
    `order_id=${input.shopifyOrderName}`,
    `identifiers=${Object.keys(userData).join('+')}`,
  ].join(' ')

  return { ok: true, event, summary }
}

/** Sends one event. Returns whether it went to Test Events. */
export async function sendEvent(event: Record<string, unknown>): Promise<{ test: boolean; fbtraceId?: string }> {
  const env = metaEnv()
  if (!env.datasetId || !env.token) throw new MetaError('META_DATASET_ID and META_CAPI_TOKEN must be set')

  const body: Record<string, unknown> = { data: [event], access_token: env.token }
  if (env.testEventCode) body.test_event_code = env.testEventCode

  const res = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${env.datasetId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), // token in the body, not the URL, so it never lands in access logs
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({})) as {
    events_received?: number; fbtrace_id?: string
    error?: { message?: string; error_user_msg?: string; code?: number }
  }
  if (!res.ok || json.error) {
    const msg = json.error?.error_user_msg || json.error?.message || `HTTP ${res.status}`
    throw new MetaError(`Meta: ${msg}`)
  }
  if (json.events_received !== 1) throw new MetaError(`Meta accepted ${json.events_received ?? 0} events, expected 1`)
  return { test: !!env.testEventCode, fbtraceId: json.fbtrace_id }
}
