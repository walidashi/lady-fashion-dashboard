import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { I18nManager } from 'react-native'
import { useFonts, Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold } from '@expo-google-fonts/cairo'
import { supabase } from '@/lib/supabase'

// Force RTL for Arabic UI
I18nManager.forceRTL(true)

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold })

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.replace('/login')
      } else if (event === 'SIGNED_IN') {
        router.replace('/(tabs)/orders')
      }
    })
  }, [])

  if (!fontsLoaded) return null

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="orders/[id]"
          options={{
            headerShown: true,
            headerTitle: 'تفاصيل الأوردر',
            headerTitleAlign: 'center',
            headerStyle: { backgroundColor: '#fff' },
            headerTitleStyle: { fontFamily: 'Cairo_700Bold', fontSize: 16 },
          }}
        />
      </Stack>
    </>
  )
}
