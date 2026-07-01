'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, Rocket, UserPlus } from 'lucide-react'
import { api } from '@/lib/api'
import type { MissionCreate, MissionOut } from '@/lib/types'
import { useAppStore } from '../../store'
import { LiquidGlassCard as Card } from '@/components/ui/liquid-glass'
import { Button } from '@/components/ui/button'
import { MetalButton } from '@/components/ui/metal-button'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/format'
import { SmoothInput } from '@/components/ui/smooth-input'
import {
  activeMissionBanner,
  missionCreateErrorMessage,
} from '@/lib/mission-guard'

// --- Source providers -------------------------------------------------------

interface SourceDef {
  id: string
  label: string
  hint: string
}

const SOURCES: SourceDef[] = [
  { id: 'exa', label: 'Exa', hint: 'AI web search' },
  { id: 'greenhouse', label: 'Greenhouse', hint: 'ATS boards' },
  { id: 'lever', label: 'Lever', hint: 'ATS boards' },
  { id: 'ashby', label: 'Ashby', hint: 'ATS boards' },
  { id: 'wellfound', label: 'Wellfound', hint: 'Startups' },
  { id: 'rss', label: 'RSS', hint: 'Job feeds' },
]

const CURRENCIES = ['USD', 'EUR', 'GBP'] as const

// The backend accepts these optional fields beyond the core MissionCreate shape.
interface MissionCreatePayload extends MissionCreate {
  sources: string[]
  location_filter?: string
  salary_min?: number
  salary_currency: string
}

// --- Reusable field primitives ---------------------------------------------

const FIELD_CLASS =
  'w-full px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 huly-input'

function Label({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.6px] text-[var(--muted2)]"
    >
      {children}
      {required && <span className="ml-1 text-[var(--cyan)]">*</span>}
    </label>
  )
}

// --- Page -------------------------------------------------------------------

export default function NewMissionPage() {
  const router = useRouter()
  const activeProfileId = useAppStore((s) => s.activeProfileId)
  const setActiveMission = useAppStore((s) => s.setActiveMission)
  const setActiveProfile = useAppStore((s) => s.setActiveProfile)

  useEffect(() => {
    if (activeProfileId) return
    try {
      const stored = window.localStorage.getItem('jobreach.activeProfileId')
      if (stored) setActiveProfile(stored)
    } catch {
      // localStorage unavailable
    }
  }, [activeProfileId, setActiveProfile])

  const [title, setTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sources, setSources] = useState<string[]>(() =>
    SOURCES.map((s) => s.id),
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [locationFilter, setLocationFilter] = useState('')
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryCurrency, setSalaryCurrency] = useState<string>('USD')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Synchronous re-entrancy guard — setSubmitting is async, so a fast double
  // click can pass the canSubmit check twice and create two missions.
  const inFlightRef = useRef(false)

  // Optionally resolve the active profile's name for display. There is no
  // list-profiles endpoint, so this is purely a best-effort label fetch.
  const profileQuery = useQuery({
    queryKey: ['profile', activeProfileId],
    queryFn: () => api.profile.get(activeProfileId as string),
    enabled: !!activeProfileId,
    retry: 1,
    staleTime: 60_000,
  })

  const hasProfile = !!activeProfileId

  const missionsQuery = useQuery({
    queryKey: ['missions', 'active-guard'],
    queryFn: () => api.missions.list(),
    enabled: hasProfile,
    retry: 1,
    refetchInterval: 5000,
  })

  const activeBanner = activeMissionBanner(missionsQuery.data)
  const hasActiveMission = !!activeBanner

  const canSubmit = useMemo(
    () =>
      hasProfile &&
      searchQuery.trim().length > 0 &&
      sources.length > 0 &&
      !hasActiveMission &&
      !submitting,
    [hasActiveMission, hasProfile, searchQuery, sources.length, submitting],
  )

  function toggleSource(id: string) {
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !activeProfileId || inFlightRef.current) return

    inFlightRef.current = true
    setSubmitting(true)
    setSubmitError(null)

    const trimmedQuery = searchQuery.trim()
    const trimmedTitle = title.trim()
    const trimmedLocation = locationFilter.trim()
    const parsedSalary =
      salaryMin.trim() === '' ? undefined : Number(salaryMin)

    const payload: MissionCreatePayload = {
      profile_id: activeProfileId,
      title: trimmedTitle || trimmedQuery,
      search_query: trimmedQuery,
      sources,
      salary_currency: salaryCurrency,
      ...(trimmedLocation ? { location_filter: trimmedLocation } : {}),
      ...(parsedSalary != null && !Number.isNaN(parsedSalary)
        ? { salary_min: parsedSalary }
        : {}),
    }

    try {
      const result: MissionOut = await api.missions.create(payload)
      setActiveMission(result.id)
      router.push(`/missions/${result.id}`)
    } catch (err) {
      setSubmitError(missionCreateErrorMessage(err))
      setSubmitting(false)
      inFlightRef.current = false
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--cyan)]">
          Launch
        </span>
        <h2 className="font-display mt-2 text-2xl font-bold tracking-[-1px] text-[var(--text)]">
          New Mission
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Define a search and launch an autonomous job hunt across your selected
          sources.
        </p>
      </header>

      {!hasProfile && <NoProfileNotice />}
      {activeBanner && (
        <ActiveMissionNotice
          missionId={activeBanner.mission.id}
          title={activeBanner.title}
          message={activeBanner.message}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Core fields */}
        <Card className="p-6">
          {hasProfile && <ProfileBadge query={profileQuery} />}

          <div className="space-y-5">
            <div>
              <Label htmlFor="search_query" required>
                Search query
              </Label>
              <SmoothInput
                id="search_query"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. Senior backend engineer, Python, remote"
                className="px-3 py-2.5 text-sm"
                disabled={!hasProfile || hasActiveMission || submitting}
                required
                autoFocus
              />
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                Describe the role in natural language. This drives discovery and
                scoring.
              </p>
            </div>

            <div>
              <Label htmlFor="title">Mission title</Label>
              <SmoothInput
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional — defaults to your search query"
                className="px-3 py-2.5 text-sm"
                disabled={!hasProfile || hasActiveMission || submitting}
              />
            </div>
          </div>
        </Card>

        {/* Sources */}
        <Card className="p-6">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="font-display text-sm font-bold tracking-[-0.3px] text-[var(--text)]">
              Sources
            </h3>
            <span className="font-mono text-xs text-[var(--muted)]">
              {sources.length}/{SOURCES.length} selected
            </span>
          </div>
          <p className="mb-4 text-xs text-[var(--muted)]">
            Where to scan for jobs. At least one source is required.
          </p>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {SOURCES.map((source) => {
              const checked = sources.includes(source.id)
              return (
                <button
                  key={source.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleSource(source.id)}
                  disabled={!hasProfile || hasActiveMission || submitting}
                  className={cn(
                    'flex items-start gap-2.5 rounded-[8px] border px-3 py-2.5 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
                    checked
                      ? 'border-[var(--cyan)] bg-[color-mix(in_srgb,var(--cyan)_10%,transparent)]'
                      : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-bright)]',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                      checked
                        ? 'border-[var(--cyan)] bg-[var(--cyan)]'
                        : 'border-[var(--border-bright)] bg-transparent',
                    )}
                  >
                    {checked && (
                      <svg
                        viewBox="0 0 12 12"
                        className="h-3 w-3 text-[var(--bg)]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2.5 6.5 5 9l4.5-5.5" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--text)]">
                      {source.label}
                    </span>
                    <span className="block text-xs text-[var(--muted)]">
                      {source.hint}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </Card>

        {/* Advanced (collapsible) */}
        <Card className="overflow-hidden p-0">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-[var(--card)]"
          >
            <span>
              <span className="font-display block text-sm font-bold tracking-[-0.3px] text-[var(--text)]">
                Advanced filters
              </span>
              <span className="block text-xs text-[var(--muted)]">
                Location and salary constraints
              </span>
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-[var(--muted2)] transition-transform duration-200',
                advancedOpen && 'rotate-180',
              )}
            />
          </button>

          {advancedOpen && (
            <div className="space-y-5 border-t border-[var(--border)] px-6 py-5">
              <div>
                <Label htmlFor="location_filter">Location filter</Label>
                <SmoothInput
                  id="location_filter"
                  type="text"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  placeholder="e.g. Remote, Berlin, United States"
                  className="px-3 py-2.5 text-sm"
                  disabled={!hasProfile || hasActiveMission || submitting}
                />
              </div>

              <div>
                <Label htmlFor="salary_min">Minimum salary</Label>
                <div className="flex gap-2">
                  <SmoothInput
                    id="salary_min"
                    type="number"
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                    placeholder="e.g. 120000"
                    className="px-3 py-2.5 text-sm flex-1"
                    wrapperClassName="flex-1"
                    disabled={!hasProfile || hasActiveMission || submitting}
                  />
                  <select
                    aria-label="Salary currency"
                    value={salaryCurrency}
                    onChange={(e) => setSalaryCurrency(e.target.value)}
                    className={cn(FIELD_CLASS, 'w-24 shrink-0')}
                    disabled={!hasProfile || hasActiveMission || submitting}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Error */}
        {submitError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-[8px] border border-[var(--red)] bg-[color-mix(in_srgb,var(--red)_8%,transparent)] px-4 py-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--red)]" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text)]">
                Could not launch mission
              </p>
              <p className="mt-0.5 break-words text-xs text-[var(--muted2)]">
                {submitError}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push('/missions')}
            disabled={submitting}
          >
            Cancel
          </Button>
          <MetalButton type="submit" disabled={!canSubmit} size="sm">
            {hasActiveMission ? (
              <>Mission running</>
            ) : submitting ? (
              <>
                <Spinner size={16} className="text-[#050506]" />
                Launching…
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                Launch Mission
              </>
            )}
          </MetalButton>
        </div>
      </form>
    </div>
  )
}

// --- Subcomponents ----------------------------------------------------------

function NoProfileNotice() {
  return (
    <Card className="mb-5 border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_7%,transparent)]">
      <EmptyState
        title="Create your profile first"
        description="A profile defines who you are and what you're looking for. Missions are scored against it, so you'll need one before launching a hunt."
        action={
          <Link
            href="/profile"
            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--cyan)] px-4 py-2 text-sm font-semibold tracking-[-0.2px] text-[var(--bg)] transition-[filter] duration-150 hover:brightness-110"
          >
            <UserPlus className="h-4 w-4" />
            Create profile
          </Link>
        }
      />
    </Card>
  )
}

function ActiveMissionNotice({
  missionId,
  title,
  message,
}: {
  missionId: string
  title: string
  message: string
}) {
  return (
    <div
      role="alert"
      className="mb-5 flex items-start justify-between gap-3 rounded-[8px] border border-[var(--amber)] bg-[color-mix(in_srgb,var(--amber)_8%,transparent)] px-4 py-3"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text)]">{title}</p>
          <p className="mt-0.5 text-xs text-[var(--muted2)]">{message}</p>
        </div>
      </div>
      <Link
        href={`/missions/${missionId}`}
        className="shrink-0 rounded-[var(--radius-pill)] border border-[var(--border-bright)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--card)]"
      >
        View mission
      </Link>
    </div>
  )
}

function ProfileBadge({
  query,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof api.profile.get>>>>
}) {
  const name = query.data?.full_name

  return (
    <div className="mb-5 flex items-center gap-2 border-b border-[var(--border)] pb-4">
      <span className="text-xs font-semibold uppercase tracking-[0.6px] text-[var(--muted)]">
        Profile
      </span>
      {query.isLoading ? (
        <span className="flex items-center gap-1.5 text-xs text-[var(--muted2)]">
          <Spinner size={12} />
          Loading…
        </span>
      ) : name ? (
        <span className="rounded-full border border-[var(--border-bright)] bg-[var(--card)] px-2.5 py-0.5 text-xs font-medium text-[var(--text)]">
          {name}
        </span>
      ) : (
        <span className="text-xs text-[var(--muted2)]">Active profile</span>
      )}
    </div>
  )
}
