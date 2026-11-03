// Minimal Shopify Admin GraphQL client for the sync. Server-only.
import { SHOPIFY_API_VERSION, shopifyEnv } from './config'

export class ShopifyError extends Error {
  constructor(message: string, public readonly kind: 'config' | 'http' | 'graphql' | 'user' = 'graphql') {
    super(message)
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────
// Either a static admin token (legacy admin-created custom app) or a Dev
// Dashboard app's client credentials, exchanged for a ~24h token and cached
// in memory per server instance.

let cachedToken: { value: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  const env = shopifyEnv()
  if (!env.domain) throw new ShopifyError('SHOPIFY_STORE_DOMAIN is not set', 'config')
  if (env.staticToken) return env.staticToken
  if (!env.clientId || !env.clientSecret) {
    throw new ShopifyError('Set SHOPIFY_ADMIN_TOKEN, or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET', 'config')
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value

  const res = await fetch(`https://${env.domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: env.clientId,
      client_secret: env.clientSecret,
    }),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new ShopifyError(`Shopify token exchange failed (HTTP ${res.status}). Check the client ID/secret and that the app is installed on the store.`, 'http')
  }
  const body = await res.json() as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new ShopifyError('Shopify token exchange returned no token', 'http')
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 86_400) * 1000,
  }
  return cachedToken.value
}

// ── Transport ────────────────────────────────────────────────────────────────

async function gql<T>(query: string, variables: Record<string, unknown> = {}, retried = false): Promise<T> {
  const env = shopifyEnv()
  const token = await getToken()
  const res = await fetch(`https://${env.domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  })

  if (res.status === 401 && !env.staticToken && !retried) {
    cachedToken = null // token expired early; exchange again once
    return gql<T>(query, variables, true)
  }
  if (res.status === 429 && !retried) {
    await new Promise(r => setTimeout(r, 2000))
    return gql<T>(query, variables, true)
  }
  if (!res.ok) throw new ShopifyError(`Shopify HTTP ${res.status}`, 'http')

  const body = await res.json() as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] }
  if (body.errors?.length) {
    if (!retried && body.errors.some(e => e.extensions?.code === 'THROTTLED')) {
      await new Promise(r => setTimeout(r, 2000))
      return gql<T>(query, variables, true)
    }
    throw new ShopifyError(body.errors.map(e => e.message).join('; '), 'graphql')
  }
  if (!body.data) throw new ShopifyError('Shopify returned no data', 'graphql')
  return body.data
}

function throwUserErrors(errors: { message: string }[] | undefined, what: string) {
  if (errors?.length) throw new ShopifyError(`${what}: ${errors.map(e => e.message).join('; ')}`, 'user')
}

// ── Queries ──────────────────────────────────────────────────────────────────

export interface ShopifyOrderRef { gid: string; name: string; customerGid: string | null }

/** Looks up an order by its number, e.g. "1234" or "#1234". */
export async function findOrderByName(rawName: string): Promise<ShopifyOrderRef | null> {
  const name = '#' + rawName.trim().replace(/^#/, '')
  type R = { orders: { nodes: { id: string; name: string; customer?: { id: string } | null }[] } }
  const q = (withCustomer: boolean) => `query($q: String!) {
    orders(first: 5, query: $q) { nodes { id name ${withCustomer ? 'customer { id }' : ''} } }
  }`
  let data: R
  try {
    data = await gql<R>(q(true), { q: `name:"${name}"` })
  } catch (e) {
    // Reading the customer needs read_customers; it's optional, so retry without it.
    if (e instanceof ShopifyError && /access|scope|denied/i.test(e.message)) {
      data = await gql<R>(q(false), { q: `name:"${name}"` })
    } else throw e
  }
  const hit = data.orders.nodes.find(n => n.name === name)
  return hit ? { gid: hit.id, name: hit.name, customerGid: hit.customer?.id ?? null } : null
}

export interface ShopifyOrderState {
  gid: string
  name: string
  cancelledAt: string | null
  displayFulfillmentStatus: string
  displayFinancialStatus: string | null
  canMarkAsPaid: boolean
  tags: string[]
  fulfillmentOrders: { id: string; status: string }[]
}

export async function getOrderState(gid: string): Promise<ShopifyOrderState> {
  type R = { order: null | {
    id: string; name: string; cancelledAt: string | null
    displayFulfillmentStatus: string; displayFinancialStatus: string | null
    canMarkAsPaid: boolean; tags: string[]
    fulfillmentOrders: { nodes: { id: string; status: string }[] }
  } }
  const data = await gql<R>(`query($id: ID!) {
    order(id: $id) {
      id name cancelledAt displayFulfillmentStatus displayFinancialStatus canMarkAsPaid tags
      fulfillmentOrders(first: 20) { nodes { id status } }
    }
  }`, { id: gid })
  if (!data.order) throw new ShopifyError(`Shopify order ${gid} not found`, 'user')
  const o = data.order
  return {
    gid: o.id, name: o.name, cancelledAt: o.cancelledAt,
    displayFulfillmentStatus: o.displayFulfillmentStatus,
    displayFinancialStatus: o.displayFinancialStatus,
    canMarkAsPaid: o.canMarkAsPaid, tags: o.tags,
    fulfillmentOrders: o.fulfillmentOrders.nodes,
  }
}

export interface ShopifyMatchCandidate {
  gid: string; name: string; createdAt: string; total: number
  phones: string[]; customerGid: string | null
}

/** Orders created in a window, with the phone fields used for backfill matching. */
export async function listOrdersForMatching(fromIso: string, toIso: string): Promise<ShopifyMatchCandidate[]> {
  type Node = {
    id: string; name: string; createdAt: string
    totalPriceSet: { shopMoney: { amount: string } }
    phone: string | null
    shippingAddress: { phone: string | null } | null
    billingAddress: { phone: string | null } | null
    customer: { id: string } | null
  }
  type R = { orders: { nodes: Node[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }
  const out: ShopifyMatchCandidate[] = []
  let after: string | null = null
  for (let page = 0; page < 50; page++) {
    const data: R = await gql<R>(`query($q: String!, $after: String) {
      orders(first: 100, after: $after, query: $q, sortKey: CREATED_AT) {
        nodes {
          id name createdAt totalPriceSet { shopMoney { amount } }
          phone shippingAddress { phone } billingAddress { phone } customer { id }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`, { q: `created_at:>='${fromIso}' created_at:<='${toIso}'`, after })
    for (const n of data.orders.nodes) {
      out.push({
        gid: n.id, name: n.name, createdAt: n.createdAt,
        total: parseFloat(n.totalPriceSet.shopMoney.amount) || 0,
        phones: [n.phone, n.shippingAddress?.phone, n.billingAddress?.phone].filter((p): p is string => !!p),
        customerGid: n.customer?.id ?? null,
      })
    }
    if (!data.orders.pageInfo.hasNextPage) break
    after = data.orders.pageInfo.endCursor
  }
  return out
}

/**
 * Email and city for Meta matching. Best-effort: these are protected customer
 * fields, so if the app can't read them this returns nulls instead of failing.
 */
export async function getOrderContact(gid: string): Promise<{ email: string | null; city: string | null }> {
  type R = { order: null | {
    email: string | null
    shippingAddress: { city: string | null } | null
    billingAddress: { city: string | null } | null
  } }
  try {
    const data = await gql<R>(`query($id: ID!) {
      order(id: $id) { email shippingAddress { city } billingAddress { city } }
    }`, { id: gid })
    const o = data.order
    return {
      email: o?.email ?? null,
      city: o?.shippingAddress?.city ?? o?.billingAddress?.city ?? null,
    }
  } catch {
    return { email: null, city: null }
  }
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function fulfillFulfillmentOrder(fulfillmentOrderId: string): Promise<void> {
  type R = { fulfillmentCreate: { fulfillment: { id: string } | null; userErrors: { message: string }[] } }
  const data = await gql<R>(`mutation($f: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $f) { fulfillment { id } userErrors { field message } }
  }`, { f: { lineItemsByFulfillmentOrder: [{ fulfillmentOrderId }], notifyCustomer: false } })
  throwUserErrors(data.fulfillmentCreate.userErrors, 'fulfillmentCreate')
}

export async function markOrderAsPaid(gid: string): Promise<void> {
  type R = { orderMarkAsPaid: { userErrors: { message: string }[] } }
  const data = await gql<R>(`mutation($input: OrderMarkAsPaidInput!) {
    orderMarkAsPaid(input: $input) { userErrors { field message } }
  }`, { input: { id: gid } })
  throwUserErrors(data.orderMarkAsPaid.userErrors, 'orderMarkAsPaid')
}

export type CancelReason = 'DECLINED' | 'CUSTOMER'

/** Starts an async cancellation. Returns the Shopify job id to poll. */
export async function cancelOrder(gid: string, reason: CancelReason, staffNote: string): Promise<string | null> {
  type R = { orderCancel: { job: { id: string; done: boolean } | null; orderCancelUserErrors: { message: string }[] } }
  const data = await gql<R>(`mutation($id: ID!, $reason: OrderCancelReason!, $note: String) {
    orderCancel(
      orderId: $id, reason: $reason, restock: true, notifyCustomer: false,
      refundMethod: { originalPaymentMethodsRefund: false }, staffNote: $note
    ) {
      job { id done }
      orderCancelUserErrors { field message code }
    }
  }`, { id: gid, reason, note: staffNote.slice(0, 255) })
  throwUserErrors(data.orderCancel.orderCancelUserErrors, 'orderCancel')
  return data.orderCancel.job?.id ?? null
}

export async function isJobDone(jobId: string): Promise<boolean> {
  type R = { node: { done?: boolean } | null }
  const data = await gql<R>(`query($id: ID!) { node(id: $id) { ... on Job { done } } }`, { id: jobId })
  return !!data.node?.done
}

export async function addTags(gid: string, tags: string[]): Promise<void> {
  type R = { tagsAdd: { userErrors: { message: string }[] } }
  const data = await gql<R>(`mutation($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
  }`, { id: gid, tags })
  throwUserErrors(data.tagsAdd.userErrors, 'tagsAdd')
}
