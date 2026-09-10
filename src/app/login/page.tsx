'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function LoginPage() {
  const [mounted, setMounted] = useState(false)
  const [authMode, setAuthMode] = useState<'password' | 'otp'>('password')
  
  // Password flow state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  // OTP flow state
  const [otpSent, setOtpSent] = useState(false)
  const [otpToken, setOtpToken] = useState('')
  
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
  }, [])

  const redirectByRole = async (userId: string) => {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    if (profile?.role === 'cashier') {
      router.push('/pos')
    } else {
      router.push('/')
    }
    router.refresh()
  }

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErrorMsg(error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      await redirectByRole(data.user.id)
    }
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
    })

    if (error) {
      setErrorMsg(error.message)
    } else {
      setOtpSent(true)
      setSuccessMsg(`An 8-digit code has been sent to ${email}`)
    }
    setLoading(false)
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otpToken.trim(),
      type: 'email',
    })

    if (error) {
      setErrorMsg(error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      await redirectByRole(data.user.id)
    }
  }

  const switchTab = (mode: 'password' | 'otp') => {
    setAuthMode(mode)
    setErrorMsg('')
    setSuccessMsg('')
    setOtpSent(false)
    setOtpToken('')
  }

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 font-sans text-zinc-500">
        Loading...
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 font-sans text-white" suppressHydrationWarning>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">KitchOS</h1>
          <p className="mt-1 text-xs text-zinc-400">Select your preferred sign-in method</p>
        </div>

        {/* Mode Switcher */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-zinc-950 p-1 border border-zinc-800">
          <button
            type="button"
            onClick={() => switchTab('password')}
            className={`cursor-pointer rounded-lg py-2 text-xs font-semibold transition ${
              authMode === 'password'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => switchTab('otp')}
            className={`cursor-pointer rounded-lg py-2 text-xs font-semibold transition ${
              authMode === 'otp'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Passwordless
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
            {successMsg}
          </div>
        )}

        {/* Tab 1: Password */}
        {authMode === 'password' && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Staff Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cashier@kitchos.com"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full cursor-pointer rounded-xl bg-emerald-500 py-3 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50 mt-2"
            >
              {loading ? 'Authenticating...' : 'Sign In with Password'}
            </button>
          </form>
        )}

        {/* Tab 2: Passwordless OTP Verification */}
        {authMode === 'otp' && (
          <>
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Account Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@example.com"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full cursor-pointer rounded-xl bg-emerald-500 py-3 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50 mt-2"
                >
                  {loading ? 'Sending code...' : 'Send OTP Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Enter 8-Digit Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    pattern="[0-9]{8}"
                    inputMode="numeric"
                    autoFocus
                    value={otpToken}
                    onChange={(e) => setOtpToken(e.target.value)}
                    placeholder="12345678"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-center font-mono text-lg tracking-widest text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || otpToken.trim().length !== 8}
                  className="w-full cursor-pointer rounded-xl bg-emerald-500 py-3 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50 mt-2"
                >
                  {loading ? 'Verifying...' : 'Verify & Log In'}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false)
                      setOtpToken('')
                      setErrorMsg('')
                      setSuccessMsg('')
                    }}
                    className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition underline"
                  >
                    Change email or resend code
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}