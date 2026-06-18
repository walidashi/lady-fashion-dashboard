import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { registerPushToken } from '@/lib/notifications'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('خطأ', 'يرجى إدخال البريد الإلكتروني وكلمة المرور')
      return
    }
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      Alert.alert('خطأ في تسجيل الدخول', error.message)
      setLoading(false)
      return
    }
    if (data.user) {
      await registerPushToken(data.user.id).catch(() => {})
    }
    router.replace('/(tabs)/orders')
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.card}>
        <Text style={s.brand}>Lady Fashion</Text>
        <Text style={s.subtitle}>نظام إدارة الطلبات</Text>

        <View style={s.form}>
          <Text style={s.label}>البريد الإلكتروني</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="example@email.com"
            placeholderTextColor="#999"
            textAlign="right"
          />

          <Text style={s.label}>كلمة المرور</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#999"
            textAlign="right"
          />

          <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnText}>تسجيل الدخول</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f4f2', justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 28,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  brand: { fontFamily: 'Cairo_700Bold', fontSize: 26, color: '#be185d', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 28 },
  form: { gap: 8 },
  label: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: '#444', textAlign: 'right' },
  input: {
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 10, padding: 12,
    fontFamily: 'Cairo_400Regular', fontSize: 14, color: '#111', backgroundColor: '#fafafa',
    marginBottom: 8,
  },
  btn: {
    backgroundColor: '#be185d', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: 'Cairo_700Bold', fontSize: 16, color: '#fff' },
})
