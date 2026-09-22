import { SupabaseClient } from '@supabase/supabase-js'
import { Customer } from './types'

export type CustomerRank = 'excellent' | 'good' | 'bad' | 'new'

export const RANK_META: Record<CustomerRank, { label: string; badge: string; dot: string }> = {
  excellent: { label: 'ممتاز', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  good:      { label: 'جيد',   badge: 'bg-sky-100 text-sky-800 border-sky-200',             dot: 'bg-sky-500' },
  bad:       { label: 'سيء',   badge: 'bg-red-100 text-red-800 border-red-200',             dot: 'bg-red-500' },
  new:       { label: 'جديد',  badge: 'bg-gray-100 text-gray-700 border-gray-200',          dot: 'bg-gray-400' },
}

/** Orders that reached a final outcome — the same denominator the reports use. */
export function resolvedCount(c: Pick<Customer, 'delivered_count' | 'returned_count' | 'cancelled_count'>) {
  return c.delivered_count + c.returned_count + c.cancelled_count
}

export function successRate(c: Pick<Customer, 'delivered_count' | 'returned_count' | 'cancelled_count'>): number | null {
  const resolved = resolvedCount(c)
  return resolved ? Math.round((c.delivered_count / resolved) * 100) : null
}

/**
 * جديد    — no resolved orders yet (first order, or everything still in progress)
 * ممتاز   — ≥ 90% received and at least 2 delivered orders
 * جيد     — ≥ 60% received
 * سيء     — below 60% received
 */
export function customerRank(c: Pick<Customer, 'delivered_count' | 'returned_count' | 'cancelled_count'>): CustomerRank {
  const rate = successRate(c)
  if (rate == null) return 'new'
  if (rate >= 90 && c.delivered_count >= 2) return 'excellent'
  if (rate >= 60) return 'good'
  return 'bad'
}

/** Mirrors public.normalize_phone() in the database — keep the two in step. */
export function normalizePhone(raw: string): string | null {
  let d = raw
    .replace(/[٠-٩]/g, ch => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, ch => String(ch.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '')
  if (d.startsWith('0020')) d = d.slice(4)
  else if (d.startsWith('20') && d.length === 12) d = d.slice(2)
  if (d.length === 10 && d.startsWith('1')) d = '0' + d
  return d.length >= 10 ? d : null
}

export async function fetchAllCustomers(supabase: SupabaseClient): Promise<{ data: Customer[]; error: string | null }> {
  const PAGE = 1000
  let all: Customer[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('last_order_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) return { data: all, error: error.message }
    if (!data || data.length === 0) break
    all = [...all, ...(data as Customer[])]
    if (data.length < PAGE) break
    from += PAGE
  }
  return { data: all, error: null }
}
