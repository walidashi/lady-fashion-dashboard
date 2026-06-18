import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { supabase } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function registerPushToken(userId: string): Promise<void> {
  if (!Device.isDevice) return

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Lady Fashion',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data
  await supabase.from('push_tokens').upsert(
    { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,token' }
  )
}

export async function unregisterPushToken(userId: string): Promise<void> {
  if (!Device.isDevice) return
  const token = (await Notifications.getExpoPushTokenAsync().catch(() => null))?.data
  if (token) {
    await supabase.from('push_tokens').delete().eq('user_id', userId).eq('token', token)
  }
}
