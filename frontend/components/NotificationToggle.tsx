'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bell, BellOff, Loader2 } from 'lucide-react';

interface Props {
  enrollment: string;
}

export const NotificationToggle: React.FC<Props> = ({ enrollment }) => {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Base64URL decoding helper for VAPID public key subscription
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    ) {
      setIsSupported(true);
      checkSubscription();
    } else {
      setIsLoading(false);
    }
  }, []);

  const checkSubscription = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsEnabled(!!sub);
    } catch (err) {
      console.error('Failed to check subscription:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const subscribe = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/notifications/vapid-public-key`);
      const vapidPublicKey = res.data.publicKey;

      // Request browser permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Notification permission denied. Please allow notifications in your browser settings.');
        setIsLoading(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });

      // Register with the backend API
      await axios.post(
        `${API_URL}/api/notifications/subscribe`,
        { enrollment, subscription: sub },
        { withCredentials: true }
      );

      setIsEnabled(true);
    } catch (err) {
      console.error('Subscription failed:', err);
      alert('Failed to enable notifications. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Unregister from backend API first
        await axios.post(
          `${API_URL}/api/notifications/unsubscribe`,
          { enrollment, subscription: sub },
          { withCredentials: true }
        );
        // Unsubscribe from browser push manager
        await sub.unsubscribe();
      }
      setIsEnabled(false);
    } catch (err) {
      console.error('Unsubscription failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) return null;

  return (
    <button
      onClick={isEnabled ? unsubscribe : subscribe}
      disabled={isLoading}
      type="button"
      className={`relative overflow-hidden flex items-center gap-2 border px-4 py-2.5 rounded-[14px] text-xs font-bold transition-all active:scale-95 shadow-md disabled:opacity-75 ${
        isEnabled
          ? 'bg-indigo-500/10 border-indigo-500/35 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-400/50'
          : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:border-slate-600 hover:text-white'
      }`}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isEnabled ? (
        <>
          <Bell className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          <span>Alerts Enabled</span>
        </>
      ) : (
        <>
          <BellOff className="w-3.5 h-3.5 text-slate-400" />
          <span>Enable Alerts</span>
        </>
      )}
    </button>
  );
};
export default NotificationToggle;
