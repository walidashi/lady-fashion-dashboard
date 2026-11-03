// Server-only configuration for the Shopify + Meta sync.
// Secrets are read from environment variables and never returned to the
// browser; getSyncConfigStatus() exposes only booleans.

export const SHOPIFY_API_VERSION = '2026-10'
export const META_GRAPH_VERSION = 'v26.0'

/** Meta rejects events older than 7 days. Keep an hour of margin. */
export const META_MAX_EVENT_AGE_SECONDS = 7 * 24 * 3600 - 3600

export function shopifyEnv() {
  return {
    domain: process.env.SHOPIFY_STORE_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    staticToken: process.env.SHOPIFY_ADMIN_TOKEN?.trim(),
    clientId: process.env.SHOPIFY_CLIENT_ID?.trim(),
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET?.trim(),
  }
}

export function metaEnv() {
  return {
    datasetId: process.env.META_DATASET_ID?.trim(),
    token: process.env.META_CAPI_TOKEN?.trim(),
    testEventCode: process.env.META_TEST_EVENT_CODE?.trim() || undefined,
  }
}

export function shopifyConfigured() {
  const e = shopifyEnv()
  return !!e.domain && (!!e.staticToken || (!!e.clientId && !!e.clientSecret))
}

export function metaConfigured() {
  const e = metaEnv()
  return !!e.datasetId && !!e.token
}

export function backfillEnabled() {
  return process.env.SYNC_BACKFILL_ENABLED === 'true'
}

export interface SyncConfigStatus {
  shopify: boolean
  shopifyAuth: 'static_token' | 'client_credentials' | 'missing'
  shopifyDomain: string | null
  meta: boolean
  metaTestMode: boolean
  backfillEnabled: boolean
  shopifyApiVersion: string
  metaGraphVersion: string
}

export function getSyncConfigStatus(): SyncConfigStatus {
  const s = shopifyEnv()
  return {
    shopify: shopifyConfigured(),
    shopifyAuth: s.staticToken ? 'static_token' : s.clientId && s.clientSecret ? 'client_credentials' : 'missing',
    shopifyDomain: s.domain ?? null,
    meta: metaConfigured(),
    metaTestMode: !!metaEnv().testEventCode,
    backfillEnabled: backfillEnabled(),
    shopifyApiVersion: SHOPIFY_API_VERSION,
    metaGraphVersion: META_GRAPH_VERSION,
  }
}
