import { useState, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet, TextInput, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native'

interface Variant {
  color: string; size: string; qty: number; warehouse_qty: number; haram_qty: number
}
interface Product {
  id: string; code: string; name: string; selling_price: number; variants: Variant[]
}

const ENDPOINT = 'https://lady-fashion-app-production.up.railway.app/api/public/inventory'
const API_KEY = process.env.EXPO_PUBLIC_INVENTORY_API_KEY ?? ''

function qtyColor(qty: number) {
  if (qty === 0) return '#fee2e2'
  if (qty <= 3) return '#fef3c7'
  return '#dcfce7'
}
function qtyTextColor(qty: number) {
  if (qty === 0) return '#dc2626'
  if (qty <= 3) return '#d97706'
  return '#16a34a'
}

export default function InventoryScreen() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')

  const fetchInventory = async () => {
    try {
      const res = await fetch(ENDPOINT, { headers: { 'X-API-Key': API_KEY } })
      const data = await res.json()
      setProducts(Array.isArray(data) ? data : (data.products ?? []))
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => { fetchInventory() }, [])
  const onRefresh = async () => { setRefreshing(true); await fetchInventory(); setRefreshing(false) }

  const filtered = products.filter(p =>
    !search.trim() || p.name.includes(search) || p.code.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <View style={s.center}><ActivityIndicator color="#be185d" size="large" /></View>

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>المخزون</Text>
        <Text style={s.count}>{products.length} منتج</Text>
      </View>
      <View style={s.searchBox}>
        <TextInput style={s.searchInput} placeholder="بحث..." placeholderTextColor="#aaa" value={search} onChangeText={setSearch} textAlign="right" />
      </View>
      <ScrollView contentContainerStyle={s.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#be185d" />}>
        {filtered.map(product => {
          const colors = [...new Set(product.variants.map(v => v.color))]
          return (
            <View key={product.id} style={s.card}>
              <View style={s.cardHeader}>
                <View>
                  <Text style={s.productName}>{product.name}</Text>
                  <Text style={s.productCode}>{product.code}</Text>
                </View>
                <Text style={s.price}>{product.selling_price.toLocaleString('ar-EG')} ج.م</Text>
              </View>
              {colors.map(color => {
                const variants = product.variants.filter(v => v.color === color)
                return (
                  <View key={color} style={s.colorRow}>
                    <Text style={s.colorLabel}>{color}</Text>
                    <View style={s.chips}>
                      {variants.map(v => (
                        <View key={`${v.color}-${v.size}`} style={[s.chip, { backgroundColor: qtyColor(v.qty) }]}>
                          <Text style={[s.chipText, { color: qtyTextColor(v.qty) }]}>
                            {v.size} · {v.qty}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )
              })}
            </View>
          )
        })}
        {filtered.length === 0 && (
          <View style={s.empty}><Text style={s.emptyText}>لا توجد نتائج</Text></View>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f4f2' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title: { fontFamily: 'Cairo_700Bold', fontSize: 22, color: '#111' },
  count: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: '#888' },
  searchBox: { marginHorizontal: 16, marginBottom: 8 },
  searchInput: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: 'Cairo_400Regular', fontSize: 13, color: '#111', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  list: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  productName: { fontFamily: 'Cairo_700Bold', fontSize: 14, color: '#111' },
  productCode: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: '#888' },
  price: { fontFamily: 'Cairo_700Bold', fontSize: 14, color: '#be185d' },
  colorRow: { marginBottom: 8 },
  colorLabel: { fontFamily: 'Cairo_600SemiBold', fontSize: 11, color: '#666', textAlign: 'right', marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontFamily: 'Cairo_600SemiBold', fontSize: 11 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: '#aaa' },
})
