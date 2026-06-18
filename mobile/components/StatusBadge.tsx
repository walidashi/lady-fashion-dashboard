import { View, Text, StyleSheet } from 'react-native'
import { OrderStatus, STATUS_LABELS, STATUS_COLORS } from '@/lib/types'

interface Props {
  status: OrderStatus | string
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, size = 'md' }: Props) {
  const colors = STATUS_COLORS[status as OrderStatus] ?? { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' }
  const label = STATUS_LABELS[status as OrderStatus] ?? status

  return (
    <View style={[
      s.badge,
      { backgroundColor: colors.bg, borderColor: colors.border },
      size === 'sm' && s.sm,
    ]}>
      <Text style={[s.text, { color: colors.text }, size === 'sm' && s.textSm]}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  badge: {
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  sm: { paddingHorizontal: 7, paddingVertical: 1 },
  text: { fontFamily: 'Cairo_600SemiBold', fontSize: 12 },
  textSm: { fontSize: 10 },
})
