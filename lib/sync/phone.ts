import { createHash } from 'crypto'

/**
 * Normalizes an Egyptian phone number to digits with country code and no
 * plus or leading zeros: 01012345678 → 201012345678.
 * Accepts 01XXXXXXXXX, 1XXXXXXXXX, 201XXXXXXXXX, +20…, 0020…, and Arabic-Indic
 * digits. Returns null when the result isn't a valid Egyptian mobile.
 */
export function normalizeEgPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const western = raw
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
  let digits = western.replace(/\D/g, '')

  if (digits.startsWith('0020')) digits = digits.slice(2)
  if (digits.startsWith('20') && digits.length === 12) {
    // already 20 + 10-digit mobile
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = '2' + digits
  } else if (digits.startsWith('1') && digits.length === 10) {
    digits = '20' + digits
  }

  // Egyptian mobiles: 20 1[0125] + 8 digits
  return /^201[0125]\d{8}$/.test(digits) ? digits : null
}

/** For logs: 201012345678 → 2010•••••678. Never log a full number. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const d = phone.replace(/\D/g, '')
  if (d.length < 7) return '•••'
  return `${d.slice(0, 4)}•••••${d.slice(-3)}`
}

/** Lowercase hex SHA-256, as Meta requires for user_data fields. */
export function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

/** gid://shopify/Order/123 → "123" */
export function gidToId(gid: string | null | undefined): string | null {
  if (!gid) return null
  const m = gid.match(/\/(\d+)$/)
  return m ? m[1] : null
}
