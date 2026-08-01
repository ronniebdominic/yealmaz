// Ye-Almaz — Web Push subscription hook for staff (currently delivery agents)
// Adapted from yealmaz-clinic-app/src/hooks/usePushNotifications.js — same
// VAPID subscribe flow, minus the React Native Platform.OS branch since
// this is a plain Vite web app.
import { useEffect } from 'react';
import api from '../api';

/**
 * Converts a base64url VAPID public key to a Uint8Array
 * (required by PushManager.subscribe)
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/**
 * Call this hook after the user has logged in.
 * It requests notification permission, creates a push subscription,
 * and registers it with the backend — silently, no UI required.
 */
export function usePushNotifications(isLoggedIn) {
  useEffect(() => {
    if (!isLoggedIn) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    async function subscribe() {
      try {
        // 1. Get VAPID public key from backend
        const { data } = await api.get('/notifications/vapid-public-key');
        if (!data?.publicKey) return;

        // 2. Ask for notification permission (browser shows the prompt)
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.log('[Push] Permission denied by user.');
          return;
        }

        // 3. Get the active service worker registration
        const reg = await navigator.serviceWorker.ready;

        // 4. Check if already subscribed to this key (avoid duplicate)
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          // Already subscribed — re-register with backend in case it changed
          await api.post('/notifications/subscribe', {
            endpoint: existing.endpoint,
            keys: {
              p256dh: btoa(String.fromCharCode(...new Uint8Array(existing.getKey('p256dh')))),
              auth:   btoa(String.fromCharCode(...new Uint8Array(existing.getKey('auth')))),
            },
            userAgent: navigator.userAgent,
          });
          return;
        }

        // 5. Create a new subscription
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.publicKey),
        });

        const rawP256dh = subscription.getKey('p256dh');
        const rawAuth   = subscription.getKey('auth');

        // 6. POST to backend
        await api.post('/notifications/subscribe', {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(rawP256dh))),
            auth:   btoa(String.fromCharCode(...new Uint8Array(rawAuth))),
          },
          userAgent: navigator.userAgent,
        });

        console.log('[Push] Subscribed successfully.');
      } catch (err) {
        // Non-fatal — app works fine without push
        console.warn('[Push] Subscription failed:', err.message);
      }
    }

    subscribe();
  }, [isLoggedIn]);
}
