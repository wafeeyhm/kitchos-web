'use client';

import { useState, useEffect } from 'react';

export default function NetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic lightweight heartbeat ping (checks Supabase connectivity)
    const interval = setInterval(async () => {
      if (!navigator.onLine) {
        setIsOnline(false);
        setLatency(null);
        return;
      }

      const start = performance.now();
      try {
        const res = await fetch('/api/health', { method: 'HEAD', cache: 'no-store' }).catch(
          () => null
        );
        const elapsed = Math.round(performance.now() - start);

        if (res && (res.ok || res.status === 404)) {
          // If response came back, we're definitely connected to the host
          setIsOnline(true);
          setLatency(elapsed);
        } else {
          setIsOnline(navigator.onLine);
        }
      } catch (err) {
        setIsOnline(navigator.onLine);
      }
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-rose-600 text-white font-bold text-xs py-2 px-4 text-center shadow-lg flex items-center justify-center gap-2 animate-bounce">
          <span>⚠️</span>
          <span>Network connection lost. Check store Wi-Fi. Realtime syncing paused.</span>
        </div>
      )}

      {/* Pill Badge */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-semibold transition ${
          !isOnline
            ? 'bg-rose-950/80 border-rose-800 text-rose-400'
            : 'bg-neutral-900 border-neutral-800 text-neutral-400'
        }`}
        title={isOnline ? `Network Online • ${latency ? `${latency}ms` : 'Active'}` : 'Offline'}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            !isOnline ? 'bg-rose-500 animate-ping' : 'bg-emerald-400 animate-pulse'
          }`}
        />
        <span>{isOnline ? (latency ? `${latency}ms` : 'Online') : 'Offline'}</span>
      </div>
    </>
  );
}