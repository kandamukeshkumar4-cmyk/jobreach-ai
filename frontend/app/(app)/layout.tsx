'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Rocket, Target, ListChecks, FileText, MessageSquareQuote, User, LogOut, Plus } from 'lucide-react'
import { useAppStore } from './store'
import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { User as SupabaseUser } from '@supabase/supabase-js'

const PROFILE_ID_KEY = 'jobreach.activeProfileId'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/missions', label: 'Missions', icon: Rocket },
  { href: '/matches', label: 'Matches', icon: Target },
  { href: '/tracker', label: 'Tracker', icon: ListChecks },
  { href: '/resumes', label: 'Resumes', icon: FileText },
  { href: '/answers', label: 'Answers', icon: MessageSquareQuote },
  { href: '/profile', label: 'Profile', icon: User },
]

function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const runningMissions = useAppStore((s) => s.runningMissions)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        setUser(data.session?.user ?? null)
        setSessionLoading(false)
      })
    } else {
      setSessionLoading(false)
    }

    const { data: listener } = supabase?.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    }) ?? { data: null }

    return () => {
      listener?.subscription.unsubscribe()
    }
  }, [])

  const email = user?.email ?? ''
  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (email ? email.split('@')[0] : '')

  const initials = displayName
    ? displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w: string) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : ''

  async function handleSignOut() {
    await supabase?.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="fixed left-0 top-0 z-50 h-screen w-[240px] border-r border-[var(--border)] bg-[var(--surface)] flex flex-col">
      <div className="px-6 pt-8 pb-6 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[7px] bg-prismatic flex items-center justify-center shadow-[var(--glow-blue)]">
            <span className="text-[var(--bg)] text-xs font-bold">JR</span>
          </div>
          <span className="font-display font-semibold text-2xl tracking-[-1.5px] text-[var(--text)]">JobReach</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`relative flex items-center gap-3 px-4 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${isActive
                    ? 'bg-white/[0.06] text-[var(--cyan)] shadow-[inset_2px_0_0_var(--cyan),0_0_18px_rgba(94,198,255,0.08)] before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-[var(--cyan)]'
                    : 'text-[var(--muted2)] hover:text-[var(--text)] hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                  {item.label === 'Missions' && runningMissions > 0 && (
                    <span className="ml-auto px-2 py-0.5 text-[10px] font-[family-name:var(--font-mono)] bg-prismatic text-[var(--bg)] rounded-[var(--radius-pill)]">
                      {runningMissions}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-[var(--border)] mt-auto">
        <div className="flex items-center gap-3 px-3 py-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)]">
          <div className="w-8 h-8 rounded-full bg-prismatic flex items-center justify-center text-xs font-[family-name:var(--font-mono)] text-[var(--bg)] ring-1 ring-[var(--border-bright)]">
            {initials || <span className="w-3 h-3 rounded-full bg-[var(--muted)] opacity-40" />}
          </div>
          <div className="text-sm min-w-0">
            {sessionLoading ? (
              <div className="h-4 w-20 rounded bg-[var(--border)] animate-pulse" />
            ) : (
              <>
                <div className="font-medium text-[var(--text)] truncate">{displayName || '—'}</div>
                <div className="text-[var(--muted)] text-xs truncate">{email}</div>
              </>
            )}
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-4 flex w-full items-center justify-center gap-2 px-4 py-2 text-[var(--muted)] hover:text-[var(--red)] hover:bg-[var(--card)] rounded-[var(--radius-md)] text-sm font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  )
}

function Topbar() {
  const pathname = usePathname()
  const getTitle = (path: string | null) => {
    if (!path) return 'Console'
    if (path.includes('dashboard')) return 'Dashboard'
    if (path.includes('missions')) return 'Missions'
    if (path.includes('matches')) return 'Matches'
    if (path.includes('tracker')) return 'Tracker'
    if (path.includes('resumes')) return 'Resumes'
    if (path.includes('answers')) return 'Answers'
    if (path.includes('profile')) return 'Profile'
    return 'JobReach AI'
  }

  return (
    <div className="fixed left-[240px] right-0 top-0 z-40 h-16 border-b border-[var(--border)] bg-[var(--surface)] flex items-center px-8">
      <h1 className="font-display text-2xl font-semibold tracking-[-1px] text-[var(--text)]">
        {getTitle(pathname)}
      </h1>
      <div className="ml-auto">
        <Link
          href="/missions/new"
          className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-prismatic px-4 py-2.5 text-sm font-semibold tracking-[-0.2px] text-[var(--bg)] shadow-[var(--glow-blue)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          New Mission
        </Link>
      </div>
    </div>
  )
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const setActiveProfile = useAppStore((s) => s.setActiveProfile)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function resolveProfile() {
      // Auth gating is owned by the server-side proxy.ts (cookie session) now, so
      // a logged-out user never reaches this layout. We deliberately do NOT
      // re-check getSession() and redirect here: a second client-side guard
      // racing the server guard on a different read is the classic double-guard
      // bounce. This layout only resolves the active profile / onboarding.

      // Fast path: localStorage hit → trust it, no network call
      try {
        const cached = localStorage.getItem(PROFILE_ID_KEY)
        if (cached) {
          setActiveProfile(cached)
          setReady(true)
          return
        }
      } catch {
        // localStorage unavailable — fall through to cloud check
      }

      // Cloud check: ask the backend if this user already has a profile
      // Works on any device, any browser, after clearing cache
      try {
        const { api } = await import('@/lib/api')
        const profile = await api.profile.me()
        if (profile?.id) {
          try { localStorage.setItem(PROFILE_ID_KEY, profile.id) } catch {}
          setActiveProfile(profile.id)
          setReady(true)
          return
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : ''
        // 404 = logged in but no profile → onboard.
        if (msg.startsWith('404')) {
          router.replace('/onboarding')
          return
        }
        // 401 / network error (e.g. session not hydrated yet, or a cold-start
        // blip) must NOT shove the user to onboarding — that's what bounced
        // freshly-logged-in users out. Show the app; pages handle their own auth.
        setReady(true)
        return
      }

      // Reached only when me() resolved without a profile → send to onboarding.
      router.replace('/onboarding')
    }

    resolveProfile()
  }, [router, setActiveProfile])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-prismatic shadow-[var(--glow-blue)]">
            <span className="text-sm font-bold text-[var(--bg)]">JR</span>
          </div>
          <div className="h-1 w-32 overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-prismatic" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg)] min-h-screen">
      <Sidebar />
      <Topbar />
      <main className="ml-[240px] pt-16 min-h-screen p-8">
        {children}
      </main>
    </div>
  )
}
