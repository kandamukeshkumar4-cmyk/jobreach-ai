'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export function LandingAuthRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (!supabase) return

    const current = new URL(window.location.href)
    const code = current.searchParams.get('code')
    if (code) {
      router.replace(`/auth/callback${current.search}`)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/dashboard')
    })
  }, [router])

  return null
}
