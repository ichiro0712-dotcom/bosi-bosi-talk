"use client";

import { useEffect } from 'react';
import { supabase } from '../../utils/supabase/client';

function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
  return outputArray;
}

export default function PushSubscriber() {
  useEffect(() => {
    const profile = localStorage.getItem('boshi_profile');
    if (!profile) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') return;

    // Service Worker登録 + Push Subscription更新（毎回最新を登録）
    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      try {
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string)
        });
        const subJSON = subscription.toJSON();
        if (subJSON.endpoint && subJSON.keys) {
          await supabase.from('subscriptions').upsert({
            endpoint: subJSON.endpoint,
            p256dh: subJSON.keys.p256dh,
            auth: subJSON.keys.auth,
            user_id: profile
          }, { onConflict: 'endpoint' });
        }
      } catch (e) {
        console.warn('Push subscription update failed', e);
      }
    });
  }, []);

  return null;
}
