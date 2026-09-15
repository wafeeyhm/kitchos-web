'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberTerminal, setRememberTerminal] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check if session already exists
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/pos');
      }
    });
  }, [supabase, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) throw error;

      if (data.session) {
        // Assign default staff member in localStorage if none is cached
        const { data: defaultStaff } = await supabase
          .from('staff_members')
          .select('id, name, role')
          .limit(1)
          .maybeSingle();

        if (defaultStaff) {
          localStorage.setItem('kitchos_active_staff', JSON.stringify(defaultStaff));
        }

        router.replace('/pos');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Quick-fill for development / local demo testing
  const handleQuickBypassDev = async () => {
    setLoading(true);
    try {
      const { data: staff } = await supabase
        .from('staff_members')
        .select('id, name, role')
        .limit(1)
        .maybeSingle();

      if (staff) {
        localStorage.setItem('kitchos_active_staff', JSON.stringify(staff));
      }
      router.replace('/pos');
    } catch (e: any) {
      router.replace('/pos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-neutral-950 flex flex-col justify-center items-center p-4 font-sans text-neutral-100 select-none">
      <div className="w-full max-w-md bg-neutral-900/80 border border-neutral-800 rounded-3xl p-8 shadow-2xl backdrop-blur-sm space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-emerald-500 items-center justify-center font-black text-neutral-950 text-xl shadow-lg shadow-emerald-950/50">
            K
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">KitchOS Terminal</h1>
          <p className="text-xs text-neutral-400">
            Sign in with your Organization Account to authorize this device
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label className="block text-neutral-300 font-medium mb-1.5">Account Email</label>
            <input
              type="email"
              required
              autoFocus
              placeholder="owner@restaurant.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-neutral-300 font-medium">Password</label>
            </div>
            <input
              type="password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-neutral-400 hover:text-neutral-200">
              <input
                type="checkbox"
                checked={rememberTerminal}
                onChange={(e) => setRememberTerminal(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-950 text-emerald-500 cursor-pointer"
              />
              <span>Keep register signed in</span>
            </label>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/50 border border-rose-900/80 rounded-xl text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-neutral-950 transition cursor-pointer shadow-lg shadow-emerald-950/40 disabled:opacity-40"
          >
            {loading ? 'Authenticating Station...' : 'Sign In to Terminal'}
          </button>
        </form>

        {/* Onboarding Link & Demo Bypass */}
        <div className="pt-4 border-t border-neutral-800/80 flex flex-col gap-2 text-center">
          <Link
            href="/onboarding"
            className="inline-block py-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
          >
            ✨ New store owner? Start Setup & Onboarding →
          </Link>

          <button
            type="button"
            onClick={handleQuickBypassDev}
            className="text-[11px] text-neutral-500 hover:text-neutral-400 transition cursor-pointer"
          >
            ⚡ Local Demo / Quick Terminal Bypass
          </button>
        </div>
      </div>

      <footer className="mt-8 text-center text-[10px] text-neutral-600 font-mono">
        KitchOS v3.1 Enterprise POS • Multi-Tenant Session Engine
      </footer>
    </div>
  );
}