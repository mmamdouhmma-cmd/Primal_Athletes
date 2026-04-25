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

  const { error: upsertErr } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, user_type: userType, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: 'endpoint' }
  )
  if (upsertErr) console.warn('[Push] Upsert subscription failed:', upsertErr)

  return subscription
}

// Trigger the send-push Edge Function. Inserts the in-app notification row
// AND fires Web Push to all of the recipient's subscribed devices.
export async function sendNotification({ recipientId, recipientType, notificationType, title, message, url = '/', branchId }) {
  if (!recipientId || !title) return
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    console.warn('[Push] Supabase env not set — notification skipped')
    return
  }
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ recipientId, recipientType, notificationType, title, message, url, branchId }),
    })
  } catch (err) {
    console.warn('[Push] Failed to send notification:', err)
  }
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
