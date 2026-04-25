import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const cleaned = String(base64String).trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '')
  const padding = '='.repeat((4 - (cleaned.length % 4)) % 4)
  const base64 = (cleaned + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    return reg
  } catch (err) {
    console.warn('[Push] SW registration failed:', err)
    return null
  }
}

export async function subscribeToPush(userId, userType = 'student') {
  if (!userId) return null
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null
  }
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Push] VITE_VAPID_PUBLIC_KEY not set — push disabled')
    return null
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const reg = await registerServiceWorker()
  if (!reg) return null

  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    } catch (err) {
      console.warn('[Push] Subscribe failed:', err)
      return null
    }
  }

  const { endpoint, keys } = subscription.toJSON()

  await supabase.from('push_subscriptions').upsert(
    { user_id: userId, user_type: userType, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: 'user_id,endpoint' }
  )

  return subscription
}

export async function unsubscribeFromPush(userId) {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  if (!reg) return
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    const { endpoint } = sub.toJSON()
    await sub.unsubscribe()
    await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
  }
}
