import { useEffect, useState } from 'react'
import { Tabs } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Profile } from '@/lib/types'

// Simple SVG-free icons using Text (avoids native dependency complexity)
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <></>  // handled by tabBarLabel
  )
}

export default function TabsLayout() {
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single()
          .then(({ data }) => setProfile(data as Profile))
      }
    })
  }, [])

  const isAdmin = profile?.role === 'admin'

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#be185d',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: 'rgba(0,0,0,0.08)',
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontFamily: 'Cairo_600SemiBold', fontSize: 11 },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="orders"
        options={{ title: 'الطلبات', tabBarIcon: ({ color }) => <TabText color={color}>📦</TabText> }}
      />
      <Tabs.Screen
        name="new-order"
        options={{ title: 'إضافة طلب', tabBarIcon: ({ color }) => <TabText color={color}>➕</TabText> }}
      />
      <Tabs.Screen
        name="inventory"
        options={{ title: 'المخزون', tabBarIcon: ({ color }) => <TabText color={color}>🗃️</TabText> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'الحساب', tabBarIcon: ({ color }) => <TabText color={color}>👤</TabText> }}
      />
    </Tabs>
  )
}

function TabText({ children, color }: { children: string; color: string }) {
  const { Text } = require('react-native')
  return <Text style={{ fontSize: 18, color }}>{children}</Text>
}
