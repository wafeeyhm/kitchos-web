'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';

interface ManagerGuardProps {
  children: React.ReactNode;
  pageTitle: string;
  description?: string;
}

export default function ManagerGuard({
  children,
  pageTitle,
  description = 'This section contains sensitive business data. Enter Manager PIN to continue.',
}: ManagerGuardProps) {
  const supabase = createClient();

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Check if already authenticated this session
  useEffect(() => {
    const sessionAuth = sessionStorage.getItem('kitchos_manager_unlocked');
    if (sessionAuth === 'true') {
      setIsUnlocked(true);
    }
    setCheckingSession(false);
  }, []);

  const handleVerify = useCallback(
    async (pinToTest: string) => {
      setVerifying(true);
      setError(null);
      try {
        const { data, error: rpcErr } = await supabase.rpc('verify_manager_pin', {
          p_pin: pinToTest,
        });

        if (rpcErr) throw rpcErr;

        if (data && data.valid) {
          sessionStorage.setItem('kitchos_manager_unlocked', 'true');
          sessionStorage.setItem('kitchos_manager_name', data.manager_name || 'Manager');
          setIsUnlocked(true);
        } else {
          setError('Invalid PIN. Manager authorization required.');
          setPin('');
        }
      } catch (err: any) {
        setError(err.message || 'Verification failed.');
        setPin('');
      } finally {
        setVerifying(false);
      }
    },
    [supabase]
  );

  const handleKeyPress = (digit: string) => {
    if (verifying || pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) {
      handleVerify(newPin);
    }
  };

  const handleBackspace = () => {
    if (verifying) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  // Listen to physical keyboard
  useEffect(() => {
    if (isUnlocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isUnlocked, pin, verifying]);

  const handleLockAgain = () => {
    sessionStorage.removeItem('kitchos_manager_unlocked');
    sessionStorage.removeItem('kitchos_manager_name');
    setIsUnlocked(false);
    setPin('');
  };

  if (checkingSession) {
    return (
      <div className="flex h-screen bg-neutral-950 items-center justify-center text-neutral-500 text-xs">
        Verifying station credentials...
      </div>
    );
  }

  // If unlocked, render children with a quick "Relock" toolbar pill
  if (isUnlocked) {
    return (
      <div className="relative">
        <div className="fixed top-4 right-8 z-40 flex items-center gap-2">
          <span className="text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2.5 py-1 rounded-full font-bold">
            🛡️ Manager Mode Active
          </span>
          <button
            onClick={handleLockAgain}
            className="text-[10px] text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-2.5 py-1 rounded-full transition cursor-pointer"
            title="Lock manager mode"
          >
            🔒 Lock
          </button>
        </div>
        {children}
      </div>
    );
  }

  // Full Screen Manager Keypad Lock
  return (
    <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
      <div className="h-full flex-shrink-0">
        <Sidebar />
      </div>

      <main className="flex-1 flex flex-col items-center justify-center p-6 bg-neutral-950">
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl max-w-sm w-full p-8 shadow-2xl space-y-6 text-center backdrop-blur-sm">
          <div>
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xl mb-3">
              🔒
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">{pageTitle}</h2>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{description}</p>
          </div>

          {/* 4 PIN Dots */}
          <div className="flex justify-center items-center gap-3.5 py-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full transition-all duration-150 ${
                  pin.length > i
                    ? 'bg-emerald-400 scale-110 shadow-md shadow-emerald-500/50'
                    : 'bg-neutral-800 border border-neutral-700'
                }`}
              />
            ))}
          </div>

          {error && (
            <p className="text-xs text-rose-400 font-medium bg-rose-950/50 border border-rose-900/60 py-2 px-3 rounded-xl">
              {error}
            </p>
          )}

          {/* Numeric Touchpad */}
          <div className="grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={verifying}
                onClick={() => handleKeyPress(digit)}
                className="h-14 rounded-2xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 active:scale-95 font-mono text-xl font-bold text-white transition cursor-pointer"
              >
                {digit}
              </button>
            ))}

            <div />

            <button
              type="button"
              disabled={verifying}
              onClick={() => handleKeyPress('0')}
              className="h-14 rounded-2xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 active:scale-95 font-mono text-xl font-bold text-white transition cursor-pointer"
            >
              0
            </button>

            <button
              type="button"
              onClick={handleBackspace}
              className="h-14 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white text-base font-bold transition cursor-pointer flex items-center justify-center"
            >
              ⌫
            </button>
          </div>

          <p className="text-[11px] text-neutral-500 font-mono">
            Requires Manager or Admin PIN (Default: 9999)
          </p>
        </div>
      </main>
    </div>
  );
}