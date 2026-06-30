'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { SmoothInput } from '@/components/ui/smooth-input'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const configured = supabase !== null

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!supabase || loading) return

    setLoading(true)
    setError(null)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError(signInError.message)
        return
      }
      // Wait for the session to be persisted before navigating, otherwise the
      // (app) layout's profile.me() fires with no Bearer token → 401 → the user
      // is bounced out of the app on first login (the hydration race).
      await supabase.auth.getSession()
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (!supabase || googleLoading) return
    setGoogleLoading(true)
    setError(null)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (oauthError) {
      setError(oauthError.message)
      setGoogleLoading(false)
    }
  }

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-7">
      <div className="mb-6">
        <p className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-[var(--cyan)]">
          Account
        </p>
        <h1 className="font-display text-xl font-bold tracking-[-0.8px] text-[var(--text)]">Welcome back</h1>
        <p className="mt-1 text-sm text-[var(--muted2)] tracking-[-0.2px]">
          Sign in to your JobReach account.
        </p>
      </div>

      {!configured && (
        <div className="mb-5 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--border-bright)] bg-[var(--card)] px-3.5 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" />
          <p className="text-xs leading-relaxed text-[var(--muted2)] tracking-[-0.2px]">
            Auth not configured yet — you can still{' '}
            <Link href="/dashboard" className="font-medium text-[var(--cyan)] underline-offset-2 hover:underline">
              explore the app
            </Link>
            .
          </p>
        </div>
      )}

      {configured && (
        <>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="mb-4 flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-pill)] border border-[var(--border-bright)] bg-[var(--card)] px-4 py-2.5 text-sm font-medium text-[var(--text)] tracking-[-0.2px] transition-colors hover:border-white/25 hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {googleLoading ? <Spinner size={15} /> : <GoogleIcon />}
            Continue with Google
          </button>

          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-xs text-[var(--muted)] tracking-[-0.2px]">or</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-medium text-[var(--muted2)] tracking-[-0.2px]">
            Email
          </label>
          <SmoothInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={!configured || loading}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="px-3.5 py-2.5 tracking-[-0.2px]"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-medium text-[var(--muted2)] tracking-[-0.2px]">
            Password
          </label>
          <SmoothInput
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={!configured || loading}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="px-3.5 py-2.5 tracking-[-0.2px]"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--red)]/40 bg-[var(--red)]/10 px-3.5 py-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--red)]" />
            <p className="text-xs leading-relaxed text-[var(--red)] tracking-[-0.2px]">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={!configured || loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Spinner size={15} className="text-[#050506]" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--muted2)] tracking-[-0.2px]">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium text-[var(--cyan)] underline-offset-2 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  )
}
