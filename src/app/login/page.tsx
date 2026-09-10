'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  // Step 1: Send the OTP email
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
    })

    if (error) {
      setError(error.message)
    } else {
      setStep('otp') 
      setMessage('A secure login code has been sent to your email.')
    }
    setLoading(false)
  }

  // Step 2: Verify the OTP code
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email', 
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 font-sans text-white">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">KitchOS</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {step === 'email' ? 'Sign in to access your operations' : 'Enter your verification code'}
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@yourshop.com"
                required
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-white focus:outline-none focus:ring-1 focus:ring-white transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-zinc-200 disabled:opacity-50"
            >
              {loading ? 'Sending code...' : 'Send Login Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label htmlFor="otp" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Verification Code
              </label>
              <input
                id="otp"
                type="text"
                maxLength={8}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="12345678"
                required
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-center text-2xl tracking-widest text-white placeholder-zinc-600 focus:border-white focus:outline-none focus:ring-1 focus:ring-white transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <button
              type="button"
              onClick={() => setStep('email')}
              className="mt-2 w-full text-sm text-zinc-400 hover:text-white"
            >
              Use a different email
            </button>
          </form>
        )}

        {message && (
          <div className="mt-4 rounded-lg border border-emerald-900/50 bg-emerald-950/40 p-3 text-center text-sm text-emerald-400">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-rose-900/50 bg-rose-950/40 p-3 text-center text-sm text-rose-400">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}