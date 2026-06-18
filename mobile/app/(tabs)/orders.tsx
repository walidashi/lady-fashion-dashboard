import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { Order, OrderStatus, STATUS_LABELS, Profile } from '@/lib/types'
import OrderCard from '@/components/OrderCard'

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'الكل' },
  { key: 'new', label: 'جديد' },
  { key: 'preparing', label: 'جاري التجهيز' },
  { key: 'ready', label: 'جاهز' },
  { key: 'shipped', label: 'مشحون' },
  { key: 'delivered', label: 'تم التسليم' },
  { key: 'cancelled', label: 'ملغي' },
]

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single()
    setProfile(data as Profile)
    return data as Profile
  }, [])

  const fetchOrders = useCallback(async (pro?: Profile | null) => {
    const p = pro ?? profile
    if (!p) return

    let query = supabase.from('orders').select('*').order('created_at', { ascending: false })
    if (p.role === 'employee') {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) query = query.eq('created_by', user.id)
    }

    const { data } = await query
    setOrders((data ?? []) as Order[])
  }, [profile])

  useEffect(() => {
    const init = async () => {
      const p = await fetchProfile()
      await fetchOrders(p)
      setLoading(false)
    }
    init()
  }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchOrders()
    setRefreshing(false)
  }

  const filtered = orders.filter(o => {
    const q = search.trim().toLowerCase()
    const matchSearch = !q || o.order_number.toLowerCase().includes(q) || o.customer_name.includes(q)
    const matchStatus = !statusFilter || o.status === statusFilter
    return matchSearch && matchStatus
  })

  if (loading) {
    return <View style={s.center}><ActivityIndicator color="#be185d" size="large" /></View>
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>الطلبات</Text>
        <Text style={s.count}>{orders.length} طلب</Text>
      </View>

      <View style={s.searchBox}>
        <TextInput
          style={s.searchInput}
          placeholder="بحث برقم الأوردر أو الاسم..."
          placeholderTextColor="#aaa"
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
      </View>

      <FlatList
        horizontal
        data={STATUS_FILTERS}
        keyExtractor={i => i.key}
        contentContainerStyle={s.filterRow}
        showsHorizontalScrollIndicator={false}
        style={s.filterList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.chip, statusFilter === item.key && s.chipActive]}
            onPress={() => setStatusFilter(item.key)}
          >
            <Text style={[s.chipText, statusFilter === item.key && s.chipTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />

      <FlatList
        data={filtered}
        keyExtractor={o => o.id}
        renderItem={({ item }) => <OrderCard order={item} />}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#be185d" />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>لا توجد طلبات</Text>
          </View>
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f4f2' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f4f2' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title: { fontFamily: 'Cairo_700Bold', fontSize: 22, color: '#111' },
  count: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: '#888' },
  searchBox: { marginHorizontal: 16, marginBottom: 8 },
  searchInput: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontFamily: 'Cairo_400Regular', fontSize: 13, color: '#111',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  },
  filterList: { maxHeight: 44, marginBottom: 8 },
  filterRow: { paddingHorizontal: 16, gap: 6, alignItems: 'center' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
  },
  chipActive: { backgroundColor: '#be185d', borderColor: '#be185d' },
  chipText: { fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: '#555' },
  chipTextActive: { color: '#fff' },
  list: { paddingTop: 4, paddingBottom: 100 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: '#aaa' },
})
