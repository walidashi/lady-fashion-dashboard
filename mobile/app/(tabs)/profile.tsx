import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/lib/types'
import { unregisterPushToken } from '@/lib/notifications'

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single()
          .then(({ data }) => { setProfile(data as Profile); setLoading(false) })
      } else {
        setLoading(false)
      }
    })
  }, [])

  const handleLogout = async () => {
    Alert.alert('تسجيل الخروج', 'هل أنت متأكد؟', [
      { text: 'لا', style: 'cancel' },
      {
        text: 'نعم', style: 'destructive', onPress: async () => {
          if (profile?.id) await unregisterPushToken(profile.id).catch(() => {})
          await supabase.auth.signOut()
          router.replace('/login')
        },
      },
    ])
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#be185d" /></View>

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>الحساب</Text>
      </View>

      <View style={s.card}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{profile?.full_name?.[0] ?? '؟'}</Text>
        </View>
        <Text style={s.name}>{profile?.full_name ?? '—'}</Text>
        <Text style={s.role}>{profile?.role === 'admin' ? 'مدير النظام' : 'موظف'}</Text>
      </View>

      <View style={s.infoCard}>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>الدور</Text>
          <Text style={s.infoValue}>{profile?.role === 'admin' ? 'أدمن' : 'موظف'}</Text>
        </View>
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Text style={s.logoutText}>تسجيل الخروج</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f4f2' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title: { fontFamily: 'Cairo_700Bold', fontSize: 22, color: '#111' },
  card: { margin: 16, backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#be185d', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontFamily: 'Cairo_700Bold', fontSize: 28, color: '#fff' },
  name: { fontFamily: 'Cairo_700Bold', fontSize: 18, color: '#111', marginBottom: 4 },
  role: { fontFamily: 'Cairo_400Regular', fontSize: 13, color: '#888' },
  infoCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  infoLabel: { fontFamily: 'Cairo_400Regular', fontSize: 14, color: '#888' },
  infoValue: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: '#111' },
  logoutBtn: { margin: 16, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#fee2e2' },
  logoutText: { fontFamily: 'Cairo_700Bold', fontSize: 15, color: '#dc2626' },
})
