import { SupabaseClient } from '@supabase/supabase-js'
import { Order } from './types'

/**
 * Fetches every order, paging past PostgREST's 1000-row response cap.
 * Supabase returns at most 1000 rows per request, so a plain select()
 * silently truncates once the table grows past that.
 */
export async function fetchAllOrders(supabase: SupabaseClient): Promise<Order[]> {
  const PAGE = 1000
  let all: Order[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)

    if (error || !data || data.length === 0) break
    all = [...all, ...(data as Order[])]
    if (data.length < PAGE) break
    from += PAGE
  }

  return all
}
