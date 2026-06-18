import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { PAYMENT_METHODS, formatProductItems } from '@/lib/types'

interface ProductLine {
  name: string; color: string; size: string; price: string
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  )
}

export default function NewOrderScreen() {
  const [customerName, setCustomerName] = useState('')
  const [mobile, setMobile] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0])
  const [shippingCost, setShippingCost] = useState('0')
  const [amountPaid, setAmountPaid] = useState('0')
  const [products, setProducts] = useState<ProductLine[]>([{ name: '', color: '', size: '', price: '' }])
  const [loading, setLoading] = useState(false)
  const [orderNumber, setOrderNumber] = useState('')

  useEffect(() => {
    const fetchNextNumber = async () => {
      const { data } = await supabase.from('orders').select('order_number').ilike('order_number', 'ORD%')
      let max = 0
      for (const row of data ?? []) {
        const n = parseInt(row.order_number.replace(/^[A-Za-z]+/, ''), 10)
        if (!isNaN(n) && n > max) max = n
      }
      setOrderNumber(`ORD${max + 1}`)
    }
    fetchNextNumber()
  }, [])

  const addProduct = () => setProducts(p => [...p, { name: '', color: '', size: '', price: '' }])
  const removeProduct = (i: number) => setProducts(p => p.filter((_, idx) => idx !== i))
  const updateProduct = (i: number, field: keyof ProductLine, val: string) => {
    setProducts(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item))
  }

  const productsTotal = products.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0)
  const shipping = parseFloat(shippingCost) || 0
  const paid = parseFloat(amountPaid) || 0
  const total = productsTotal + shipping
  const remaining = total - paid

  const handleSubmit = async () => {
    if (!customerName.trim()) { Alert.alert('خطأ', 'يرجى إدخال اسم العميل'); return }
    if (!mobile.trim()) { Alert.alert('خطأ', 'يرجى إدخال رقم الموبايل'); return }
    if (!address.trim()) { Alert.alert('خطأ', 'يرجى إدخال العنوان'); return }
    if (products.some(p => !p.name.trim())) { Alert.alert('خطأ', 'يرجى إدخال اسم جميع المنتجات'); return }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { Alert.alert('خطأ', 'غير مصرح'); setLoading(false); return }

    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    const userName = profile?.full_name ?? ''

    const payload = {
      order_number: orderNumber,
      customer_name: customerName.trim(),
      mobile: mobile.trim(),
      address: address.trim(),
      products: formatProductItems(products.map(p => ({
        name: p.name, color: p.color, size: p.size, price: parseFloat(p.price) || 0,
      }))),
      products_total: productsTotal,
      shipping_cost: shipping,
      total,
      amount_paid: paid,
      remaining,
      items_count: products.length,
      notes: notes.trim(),
      payment_method: paymentMethod,
      source: 'موبايل',
      order_type: 'تسليم',
      returned_products: null,
      returned_products_total: 0,
      status: 'new',
      created_by: user.id,
      created_by_name: userName,
    }

    const { data: inserted, error } = await supabase.from('orders').insert(payload).select('id, order_number').single()

    if (error) {
      Alert.alert('خطأ', error.message)
      setLoading(false)
      return
    }

    await supabase.from('order_status_logs').insert({
      order_id: inserted.id, order_number: inserted.order_number,
      from_status: null, to_status: 'new',
      changed_by: user.id, changed_by_name: userName,
    })

    Alert.alert('تم', `تم إضافة الطلب ${inserted.order_number} بنجاح`, [
      { text: 'حسناً', onPress: () => router.replace('/(tabs)/orders') },
    ])
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.pageTitle}>إضافة طلب جديد</Text>
        <Text style={s.orderNum}>#{orderNumber}</Text>

        <View style={s.card}>
          <Text style={s.sectionTitle}>بيانات العميل</Text>
          <Field label="الاسم *">
            <TextInput style={s.input} value={customerName} onChangeText={setCustomerName} placeholder="اسم العميل" placeholderTextColor="#aaa" textAlign="right" />
          </Field>
          <Field label="الموبايل *">
            <TextInput style={s.input} value={mobile} onChangeText={setMobile} placeholder="01xxxxxxxxx" keyboardType="phone-pad" textAlign="right" placeholderTextColor="#aaa" />
          </Field>
          <Field label="العنوان *">
            <TextInput style={s.input} value={address} onChangeText={setAddress} placeholder="العنوان كاملاً" placeholderTextColor="#aaa" textAlign="right" multiline />
          </Field>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>المنتجات</Text>
          {products.map((p, i) => (
            <View key={i} style={s.productBlock}>
              <View style={s.productHeader}>
                <Text style={s.productNum}>منتج {i + 1}</Text>
                {products.length > 1 && (
                  <TouchableOpacity onPress={() => removeProduct(i)}>
                    <Text style={s.removeBtn}>حذف</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput style={s.input} value={p.name} onChangeText={v => updateProduct(i, 'name', v)} placeholder="اسم المنتج *" placeholderTextColor="#aaa" textAlign="right" />
              <View style={s.twoCol}>
                <TextInput style={[s.input, { flex: 1 }]} value={p.color} onChangeText={v => updateProduct(i, 'color', v)} placeholder="اللون" placeholderTextColor="#aaa" textAlign="right" />
                <TextInput style={[s.input, { flex: 1 }]} value={p.size} onChangeText={v => updateProduct(i, 'size', v)} placeholder="المقاس" placeholderTextColor="#aaa" textAlign="right" />
              </View>
              <TextInput style={s.input} value={p.price} onChangeText={v => updateProduct(i, 'price', v)} placeholder="السعر" keyboardType="numeric" placeholderTextColor="#aaa" textAlign="right" />
            </View>
          ))}
          <TouchableOpacity style={s.addProductBtn} onPress={addProduct}>
            <Text style={s.addProductText}>+ إضافة منتج</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>المالية</Text>
          <Field label="تكلفة الشحن">
            <TextInput style={s.input} value={shippingCost} onChangeText={setShippingCost} keyboardType="numeric" placeholderTextColor="#aaa" textAlign="right" />
          </Field>
          <Field label="المبلغ المدفوع">
            <TextInput style={s.input} value={amountPaid} onChangeText={setAmountPaid} keyboardType="numeric" placeholderTextColor="#aaa" textAlign="right" />
          </Field>
          <View style={s.summaryBox}>
            <View style={s.summaryRow}><Text style={s.summaryLabel}>الإجمالي</Text><Text style={s.summaryValue}>{total.toLocaleString('ar-EG')} ج.م</Text></View>
            <View style={s.summaryRow}><Text style={s.summaryLabel}>الباقي</Text><Text style={[s.summaryValue, remaining > 0 && { color: '#dc2626' }]}>{remaining.toLocaleString('ar-EG')} ج.م</Text></View>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>طريقة الدفع</Text>
          <View style={s.paymentOptions}>
            {PAYMENT_METHODS.map(m => (
              <TouchableOpacity
                key={m}
                style={[s.paymentOption, paymentMethod === m && s.paymentOptionActive]}
                onPress={() => setPaymentMethod(m)}
              >
                <Text style={[s.paymentText, paymentMethod === m && s.paymentTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.card}>
          <Field label="ملاحظات">
            <TextInput style={[s.input, { minHeight: 70 }]} value={notes} onChangeText={setNotes} multiline textAlign="right" placeholderTextColor="#aaa" placeholder="ملاحظات إضافية..." />
          </Field>
        </View>

        <TouchableOpacity style={[s.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>إضافة الطلب</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f4f2' },
  content: { padding: 16, paddingBottom: 60 },
  pageTitle: { fontFamily: 'Cairo_700Bold', fontSize: 22, color: '#111', marginBottom: 2, paddingTop: 40 },
  orderNum: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: '#be185d', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' },
  sectionTitle: { fontFamily: 'Cairo_700Bold', fontSize: 14, color: '#444', marginBottom: 12 },
  field: { marginBottom: 10 },
  label: { fontFamily: 'Cairo_600SemiBold', fontSize: 12, color: '#555', textAlign: 'right', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Cairo_400Regular', fontSize: 13, color: '#111' },
  twoCol: { flexDirection: 'row', gap: 8 },
  productBlock: { marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  productHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  productNum: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: '#555' },
  removeBtn: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: '#dc2626' },
  addProductBtn: { alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#be185d', borderStyle: 'dashed', marginTop: 4 },
  addProductText: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: '#be185d' },
  summaryBox: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, marginTop: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: '#666' },
  summaryValue: { fontFamily: 'Cairo_700Bold', fontSize: 14, color: '#111' },
  paymentOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paymentOption: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  paymentOptionActive: { backgroundColor: '#fdf2f8', borderColor: '#be185d' },
  paymentText: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: '#555' },
  paymentTextActive: { color: '#be185d', fontFamily: 'Cairo_600SemiBold' },
  submitBtn: { backgroundColor: '#be185d', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontFamily: 'Cairo_700Bold', fontSize: 16, color: '#fff' },
})
