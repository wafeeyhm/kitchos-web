'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

interface ManagerPinModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onAuthorized: (manager: { id: string; name: string }) => void;
}

export default function ManagerPinModal({
  isOpen,
  title = 'Manager Authorization Required',
  description = 'Enter a 4-digit Manager PIN to approve this protected action.',
  onClose,
  onAuthorized,
}: ManagerPinModalProps) {
  const supabase = createClient();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
    }
  }, [isOpen]);

  const verifyPin = useCallback(async (pinToTest: string) => {
    setVerifying(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('verify_manager_pin', {
        p_pin: pinToTest,
      });

      if (rpcErr) throw rpcErr;

      if (data && data.valid) {
        onAuthorized({ id: data.manager_id, name: data.manager_name });
      } else {
        setError('Incorrect PIN. Authorization denied.');
        setPin('');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
      setPin('');
    } finally {
      setVerifying(false);
    }
  }, [supabase, onAuthorized]);

  // Handle number click
  const handleKeypadPress = (val: string) => {
    if (verifying || pin.length >= 4) return;
    const newPin = pin + val;
    setPin(newPin);
    if (newPin.length === 4) {
      verifyPin(newPin);
    }
  };

  const handleBackspace = () => {
    if (verifying) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  // Listen to physical keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeypadPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, verifying]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-xs w-full p-6 shadow-2xl space-y-5 text-center">
        <div>
          <div className="w-10 h-10 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-lg mb-2">
            🔒
          </div>
          <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
          <p className="text-xs text-neutral-400 mt-1">{description}</p>
        </div>

        {/* 4 Dots Indicator */}
        <div className="flex justify-center items-center gap-3 py-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-3.5 w-3.5 rounded-full transition-all duration-150 ${
                pin.length > i
                  ? 'bg-emerald-400 scale-110 shadow-sm shadow-emerald-500/50'
                  : 'bg-neutral-800 border border-neutral-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-rose-400 font-medium bg-rose-950/40 border border-rose-900/60 py-1.5 px-2 rounded-xl">
            {error}
          </p>
        )}

        {/* Numeric Keypad Grid */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={verifying}
              onClick={() => handleKeypadPress(digit)}
              className="h-14 rounded-2xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 active:scale-95 font-mono text-xl font-bold text-white transition cursor-pointer"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={onClose}
            className="h-14 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white text-xs font-semibold transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={verifying}
            onClick={() => handleKeypadPress('0')}
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

        <p className="text-[10px] text-neutral-500">Default Manager PIN: 9999</p>
      </div>
    </div>
  );
}