import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { Order } from '@/lib/types'
import StatusBadge from './StatusBadge'

interface Props {
  order: Order
}

export default function OrderCard({ order }: Props) {
  const date = new Date(order.created_at)
  const dateStr = date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })

  return (
    <TouchableOpacity style={s.card} onPress={() => router.push(`/orders/${order.id}`)}>
      <View style={s.row}>
        <Text style={s.orderNum}>#{order.order_number}</Text>
        <StatusBadge status={order.status} size="sm" />
      </View>
      <Text style={s.name}>{order.customer_name}</Text>
      <Text style={s.address} numberOfLines={1}>{order.address}</Text>
      <View style={s.footer}>
        <Text style={s.total}>{order.total.toLocaleString('ar-EG')} ج.م</Text>
        <Text style={s.date}>{dateStr}</Text>
      </View>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  orderNum: { fontFamily: 'Cairo_700Bold', fontSize: 14, color: '#be185d' },
  name: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: '#111', marginBottom: 2 },
  address: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: '#888', marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { fontFamily: 'Cairo_700Bold', fontSize: 14, color: '#111' },
  date: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: '#aaa' },
})
