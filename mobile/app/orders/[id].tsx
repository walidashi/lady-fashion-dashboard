import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TextInput, Modal,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Order, OrderStatusLog, ShippingCompany, Profile, parseProductItems, STATUS_LABELS } from '@/lib/types'
import StatusBadge from '@/components/StatusBadge'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  )
}

function LogTimeline({ logs }: { logs: OrderStatusLog[] }) {
  if (logs.length === 0) return null
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>سجل التغييرات</Text>
      {logs.map((log, i) => (
        <View key={log.id} style={s.logItem}>
          <View style={[s.logDot, i === 0 && s.logDotActive]} />
          <View style={s.logContent}>
            <View style={s.logRow}>
              {log.from_status ? (
                <>
                  <StatusBadge status={log.from_status} size="sm" />
                  <Text style={s.logArrow}>←</Text>
                </>
              ) : (
                <Text style={s.logCreate}>إنشاء</Text>
              )}
              <StatusBadge status={log.to_status} size="sm" />
            </View>
            <Text style={s.logMeta}>
              {log.changed_by_name}
              {log.note ? ` · ${log.note}` : ''}
              {' · '}
              {new Date(log.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [logs, setLogs] = useState<OrderStatusLog[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [companies, setCompanies] = useState<ShippingCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [shipModal, setShipModal] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [acceptModal, setAcceptModal] = useState(false)

  const load = useCallback(async () => {
    const [{ data: orderData }, { data: logsData }, { data: companiesData }, { data: { user } }] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).single(),
      supabase.from('order_status_logs').select('*').eq('order_id', id).order('created_at', { ascending: false }),
      supabase.from('shipping_companies').select('*').order('name'),
      supabase.auth.getUser(),
    ])
    setOrder(orderData as Order)
    setLogs((logsData ?? []) as OrderStatusLog[])
    setCompanies((companiesData ?? []) as ShippingCompany[])
    if (user) {
      const { data: p } = await supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single()
      setProfile(p as Profile)
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const runAction = async (fn: () => Promise<{ error?: string }>, onSuccess?: () => void) => {
    setActionLoading(true)
    const result = await fn()
    if (result.error) {
      Alert.alert('خطأ', result.error)
    } else {
      onSuccess?.()
      await load()
    }
    setActionLoading(false)
  }

  const acceptOrder = () => {
    if (!deliveryDate) { Alert.alert('خطأ', 'يرجى اختيار تاريخ التسليم'); return }
    runAction(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { error: 'غير مصرح' }
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      const meta = order!
      const { error } = await supabase.from('orders').update({ status: 'preparing', estimated_delivery: deliveryDate }).eq('id', id)
      if (!error) {
        await supabase.from('order_status_logs').insert({ order_id: id, order_number: meta.order_number, from_status: meta.status, to_status: 'preparing', changed_by: user.id, changed_by_name: p?.full_name ?? '' })
      }
      return { error: error?.message }
    }, () => { setAcceptModal(false); setDeliveryDate('') })
  }

  const updateStatus = (toStatus: string) => {
    runAction(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { error: 'غير مصرح' }
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      const { error } = await supabase.from('orders').update({ status: toStatus }).eq('id', id)
      if (!error) {
        await supabase.from('order_status_logs').insert({ order_id: id, order_number: order!.order_number, from_status: order!.status, to_status: toStatus, changed_by: user.id, changed_by_name: p?.full_name ?? '' })
      }
      return { error: error?.message }
    })
  }

  const shipOrder = () => {
    if (!selectedCompany) { Alert.alert('خطأ', 'يرجى اختيار شركة الشحن'); return }
    const company = companies.find(c => c.id === selectedCompany)
    runAction(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { error: 'غير مصرح' }
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      const { error } = await supabase.from('orders').update({ status: 'shipped', shipping_company_id: selectedCompany, shipping_company_name: company?.name ?? '' }).eq('id', id)
      if (!error) {
        await supabase.from('order_status_logs').insert({ order_id: id, order_number: order!.order_number, from_status: order!.status, to_status: 'shipped', changed_by: user.id, changed_by_name: p?.full_name ?? '', note: company?.name })
      }
      return { error: error?.message }
    }, () => { setShipModal(false); setSelectedCompany('') })
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#be185d" size="large" /></View>
  if (!order) return <View style={s.center}><Text style={s.emptyText}>الأوردر غير موجود</Text></View>

  const isAdmin = profile?.role === 'admin'
  const products = parseProductItems(order.products)

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.topCard}>
        <View style={s.topRow}>
          <Text style={s.orderNum}>#{order.order_number}</Text>
          <StatusBadge status={order.status} />
        </View>
        <Text style={s.customerName}>{order.customer_name}</Text>
        <Text style={s.address}>{order.address}</Text>
        {order.estimated_delivery && (
          <Text style={s.deliveryDate}>
            موعد التسليم: {new Date(order.estimated_delivery).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        )}
      </View>

      {/* Admin actions */}
      {isAdmin && (
        <View style={s.actionsCard}>
          <Text style={s.sectionTitle}>الإجراءات</Text>
          <View style={s.actionButtons}>
            {order.status === 'new' && (
              <TouchableOpacity style={s.actionBtn} onPress={() => setAcceptModal(true)}>
                <Text style={s.actionBtnText}>قبول الطلب</Text>
              </TouchableOpacity>
            )}
            {order.status === 'preparing' && (
              <TouchableOpacity style={s.actionBtn} onPress={() => updateStatus('ready')}>
                <Text style={s.actionBtnText}>تجهيز الطلب ✓</Text>
              </TouchableOpacity>
            )}
            {order.status === 'ready' && (
              <TouchableOpacity style={s.actionBtn} onPress={() => setShipModal(true)}>
                <Text style={s.actionBtnText}>شحن الطلب</Text>
              </TouchableOpacity>
            )}
            {order.status === 'shipped' && (
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#16a34a' }]} onPress={() => updateStatus('delivered')}>
                <Text style={s.actionBtnText}>تأكيد التسليم</Text>
              </TouchableOpacity>
            )}
            {!['delivered', 'cancelled'].includes(order.status) && (
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#dc2626' }]} onPress={() => {
                Alert.alert('إلغاء الطلب', 'هل أنت متأكد من إلغاء هذا الطلب؟', [
                  { text: 'لا', style: 'cancel' },
                  { text: 'نعم، إلغاء', style: 'destructive', onPress: () => updateStatus('cancelled') },
                ])
              }}>
                <Text style={s.actionBtnText}>إلغاء</Text>
              </TouchableOpacity>
            )}
          </View>
          {actionLoading && <ActivityIndicator color="#be185d" style={{ marginTop: 8 }} />}
        </View>
      )}

      {/* Financials */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>المالية</Text>
        <Row label="إجمالي المنتجات" value={`${order.products_total.toLocaleString('ar-EG')} ج.م`} />
        <Row label="الشحن" value={`${order.shipping_cost.toLocaleString('ar-EG')} ج.م`} />
        <Row label="الإجمالي" value={`${order.total.toLocaleString('ar-EG')} ج.م`} />
        <Row label="المدفوع" value={`${order.amount_paid.toLocaleString('ar-EG')} ج.م`} />
        <Row label="الباقي" value={`${order.remaining.toLocaleString('ar-EG')} ج.م`} />
        <Row label="طريقة الدفع" value={order.payment_method} />
      </View>

      {/* Products */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>المنتجات ({order.items_count} قطعة)</Text>
        {products.map((p, i) => (
          <View key={i} style={s.productItem}>
            <Text style={s.productName}>{p.name}</Text>
            <Text style={s.productDetails}>{p.color} · {p.size} · {p.price.toLocaleString('ar-EG')} ج.م</Text>
          </View>
        ))}
      </View>

      {/* Info */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>معلومات</Text>
        <Row label="موبايل" value={order.mobile} />
        {order.notes ? <Row label="ملاحظات" value={order.notes} /> : null}
        {order.shipping_company_name ? <Row label="شركة الشحن" value={order.shipping_company_name} /> : null}
        <Row label="بواسطة" value={order.created_by_name} />
        <Row label="التاريخ" value={new Date(order.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })} />
      </View>

      <LogTimeline logs={logs} />

      {/* Accept modal */}
      <Modal visible={acceptModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>قبول الطلب</Text>
            <Text style={s.modalLabel}>تاريخ التسليم المتوقع</Text>
            <TextInput
              style={s.modalInput}
              value={deliveryDate}
              onChangeText={setDeliveryDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#aaa"
              textAlign="right"
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.actionBtn, { flex: 1 }]} onPress={acceptOrder}>
                <Text style={s.actionBtnText}>قبول</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { flex: 1, backgroundColor: '#888' }]} onPress={() => setAcceptModal(false)}>
                <Text style={s.actionBtnText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ship modal */}
      <Modal visible={shipModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>شحن الطلب</Text>
            <Text style={s.modalLabel}>اختر شركة الشحن</Text>
            {companies.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[s.companyOption, selectedCompany === c.id && s.companyOptionActive]}
                onPress={() => setSelectedCompany(c.id)}
              >
                <Text style={[s.companyName, selectedCompany === c.id && s.companyNameActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.actionBtn, { flex: 1 }]} onPress={shipOrder}>
                <Text style={s.actionBtnText}>شحن</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { flex: 1, backgroundColor: '#888' }]} onPress={() => setShipModal(false)}>
                <Text style={s.actionBtnText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f4f2' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontFamily: 'Cairo_400Regular', color: '#888' },
  topCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderNum: { fontFamily: 'Cairo_700Bold', fontSize: 18, color: '#be185d' },
  customerName: { fontFamily: 'Cairo_700Bold', fontSize: 16, color: '#111', marginBottom: 2 },
  address: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: '#666', marginBottom: 2 },
  deliveryDate: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: '#be185d', marginTop: 4 },
  actionsCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' },
  actionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  actionBtn: {
    backgroundColor: '#be185d', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
    alignItems: 'center',
  },
  actionBtnText: { fontFamily: 'Cairo_700Bold', fontSize: 13, color: '#fff' },
  section: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' },
  sectionTitle: { fontFamily: 'Cairo_700Bold', fontSize: 14, color: '#444', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  rowLabel: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: '#888' },
  rowValue: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: '#111', flex: 1, textAlign: 'right', marginRight: 8 },
  productItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  productName: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: '#111' },
  productDetails: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: '#888', marginTop: 2 },
  logItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  logDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ddd', marginTop: 6, marginLeft: 10 },
  logDotActive: { backgroundColor: '#be185d' },
  logContent: { flex: 1 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' },
  logArrow: { fontFamily: 'Cairo_400Regular', color: '#aaa', fontSize: 14 },
  logCreate: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: '#aaa', fontStyle: 'italic' },
  logMeta: { fontFamily: 'Cairo_400Regular', fontSize: 11, color: '#aaa' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontFamily: 'Cairo_700Bold', fontSize: 18, color: '#111', textAlign: 'center', marginBottom: 16 },
  modalLabel: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: '#555', marginBottom: 8, textAlign: 'right' },
  modalInput: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 10, padding: 12, fontFamily: 'Cairo_400Regular', fontSize: 14, color: '#111', marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  companyOption: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8 },
  companyOptionActive: { backgroundColor: '#fdf2f8', borderColor: '#be185d' },
  companyName: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: '#555', textAlign: 'right' },
  companyNameActive: { color: '#be185d' },
})
