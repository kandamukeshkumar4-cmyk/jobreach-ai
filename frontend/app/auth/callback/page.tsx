'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'

function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard'
  }
  return value
}

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function finishOAuth() {
      if (!supabase) {
        router.replace('/login')
        return
      }

      const providerError =
        searchParams.get('error_description') ?? searchParams.get('error')
      if (providerError) {
        setError(providerError)
        return
      }

      const next = safeNext(searchParams.get('next'))
      const code = searchParams.get('code')

      let exchangeError: string | null = null
      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code)
        // A code can only be exchanged once. If it already transited another
        // page (Site URL fallback), this fails — but a session may now exist,
        // so don't bail yet; fall through to the getSession check below.
        if (err) exchangeError = err.message
      }

      const { data, error: sessionError } = await supabase.auth.getSession()
      if (cancelled) return

      if (data.session) {
        router.replace(next)
        return
      }

      setError(
        exchangeError ??
          sessionError?.message ??
          'Google sign-in did not create a session.'
      )
    }

    finishOAuth()

    return () => {
      cancelled = true
    }
  }, [router, searchParams])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--red)]/40 bg-[var(--surface)] p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--red)]" />
            <div>
              <h1 className="font-display text-lg font-semibold text-[var(--text)]">
                Google sign-in failed
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted2)]">
                {error}
              </p>
              <button
                type="button"
                onClick={() => router.replace('/login')}
                className="mt-5 rounded-[var(--radius-pill)] bg-prismatic px-4 py-2 text-sm font-semibold text-[var(--bg)]"
              >
                Back to sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
      <div className="flex flex-col items-center gap-3 text-sm text-[var(--muted2)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-prismatic shadow-[var(--glow-blue)]">
          <Spinner size={18} className="text-[var(--bg)]" />
        </div>
        Finishing Google sign-in...
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackContent />
    </Suspense>
  )
}
