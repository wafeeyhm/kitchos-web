'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export function useWakeLock(enabled: boolean = true) {
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const wakeLockRef = useRef<any>(null);

  const requestLock = useCallback(async () => {
    if (!('wakeLock' in navigator) || !enabled) return;

    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      setIsActive(true);

      wakeLockRef.current.addEventListener('release', () => {
        setIsActive(false);
      });
    } catch (err: any) {
      console.warn('Wake Lock request failed:', err.message);
      setIsActive(false);
    }
  }, [enabled]);

  const releaseLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        // ignored
      } finally {
        wakeLockRef.current = null;
        setIsActive(false);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'wakeLock' in navigator) {
      setIsSupported(true);
      if (enabled) {
        requestLock();
      }
    }

    // Re-acquire lock when window gains visibility again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        requestLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseLock();
    };
  }, [enabled, requestLock, releaseLock]);

  return { isSupported, isActive, requestLock, releaseLock };
}