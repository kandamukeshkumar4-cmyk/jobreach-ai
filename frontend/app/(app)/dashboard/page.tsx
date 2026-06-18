'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Rocket,
  Target,
  ListChecks,
  FileText,
  ArrowRight,
  CheckCircle2,
  Circle,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { ApplicationOut, MissionOut, TrackerStats } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

const CLOSED_STATUSES = new Set(['rejected', 'discarded', 'skip']);

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function inProgressCount(stats: TrackerStats | undefined): number {
  if (!stats) return 0;
  const total = safeNumber(stats.total);
  const byStatus = stats.by_status ?? {};
  const closed = Object.entries(byStatus).reduce(
    (acc, [status, count]) =>
      CLOSED_STATUSES.has(status.toLowerCase()) ? acc + safeNumber(count) : acc,
    0,
  );
  return Math.max(0, total - closed);
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  href,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: string;
  href?: string;
}) {
  const inner = (
    <Card className="group p-5 transition-colors hover:border-[var(--border-bright)]">
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
          {label}
        </span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{
            color: accent,
            backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 font-mono text-3xl font-bold tracking-[-1px] text-[var(--text)]">
        {value}
      </div>
      {href && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-[var(--muted)] opacity-0 transition-opacity group-hover:opacity-100">
          View all
          <ArrowRight className="h-3 w-3" />
        </div>
      )}
    </Card>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function StatCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <span className="h-3 w-24 rounded bg-[var(--card)]" />
        <span className="h-8 w-8 rounded-lg bg-[var(--card)]" />
      </div>
      <div className="mt-4 h-9 w-16 rounded bg-[var(--card)]" />
    </Card>
  );
}

const WARMUP_SECONDS = 30;
const WARMUP_STEPS = [
  'Waking up the AI agent…',
  'Loading job search engine…',
  'Connecting to data sources…',
  'AI Agent is almost ready…',
  'Finalising startup…',
];

function WarmingUpBanner({ onRetry }: { onRetry: () => void }) {
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + 100 / (WARMUP_SECONDS * 10);
        if (next >= 100) {
          clearInterval(interval);
          onRetry();
          return 100;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [onRetry]);

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, WARMUP_STEPS.length - 1));
    }, (WARMUP_SECONDS * 1000) / WARMUP_STEPS.length);
    return () => clearInterval(stepInterval);
  }, []);

  return (
    <Card className="overflow-hidden p-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--cyan)] opacity-20" />
            <span className="relative flex h-5 w-5 rounded-full bg-[color-mix(in_srgb,var(--cyan)_20%,transparent)] ring-1 ring-[var(--cyan)]/40">
              <span className="m-auto h-2 w-2 rounded-full bg-[var(--cyan)]" />
            </span>
          </span>
          <div>
            <p className="text-sm font-semibold tracking-[-0.3px] text-[var(--text)]">
              {WARMUP_STEPS[stepIndex]}
            </p>
            <p className="text-xs text-[var(--muted)] tracking-[-0.1px]">
              Cold start — takes up to 30 seconds
            </p>
          </div>
          <button
            onClick={onRetry}
            className="ml-auto text-xs text-[var(--muted)] underline-offset-2 hover:text-[var(--cyan)] hover:underline"
          >
            Retry now
          </button>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] to-[var(--violet)] transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

interface GettingStartedStep {
  label: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
}

function GettingStartedCard({ steps }: { steps: GettingStartedStep[] }) {
  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  const nextStep = steps.find((s) => !s.done);

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold tracking-[-0.3px] text-[var(--text)]">
              Getting started
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {steps.filter((s) => s.done).length} of {steps.length} steps
              complete
            </p>
          </div>
          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <div
                key={i}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  s.done ? 'bg-[var(--cyan)]' : 'bg-[var(--border)]'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {steps.map((s, i) => (
          <li
            key={i}
            className={`flex items-center gap-4 px-6 py-4 ${
              s.done ? 'opacity-50' : ''
            }`}
          >
            {s.done ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--cyan)]" />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-[var(--border-bright)]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-[-0.2px] text-[var(--text)]">
                {s.label}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {s.description}
              </p>
            </div>
            {!s.done && (
              <Link href={s.href}>
                <Button variant="primary" className="shrink-0 text-xs px-4 py-2">
                  {s.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
          </li>
        ))}
      </ul>

      {nextStep && (
        <div className="border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--cyan)_4%,transparent)] px-6 py-3">
          <p className="text-xs text-[var(--muted)]">
            <span className="font-semibold text-[var(--cyan)]">Next up:</span>{' '}
            {nextStep.description}
          </p>
        </div>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const missionsQuery = useQuery<MissionOut[]>({
    queryKey: ['missions'],
    queryFn: () => api.missions.list(),
  });

  const trackerStatsQuery = useQuery<TrackerStats>({
    queryKey: ['tracker', 'stats'],
    queryFn: () => api.tracker.stats(),
  });

  const trackerListQuery = useQuery<ApplicationOut[]>({
    queryKey: ['tracker', 'list'],
    queryFn: () => api.tracker.list(),
  });

  const missions = missionsQuery.data ?? [];

  const totalMissions = missions.length;
  const totalMatches = missions.reduce(
    (acc, m) => acc + safeNumber(m.total_matches),
    0,
  );
  const applicationsInProgress = inProgressCount(trackerStatsQuery.data);
  const resumesGenerated = trackerListQuery.isError
    ? '—'
    : String(
        (trackerListQuery.data ?? []).filter((a) => Boolean(a.resume_pdf_url))
          .length,
      );

  const recentMissions = [...missions]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 5);

  const isInitialLoading = missionsQuery.isLoading;
  const isCoreError = missionsQuery.isError;

  const handleRetry = () => {
    missionsQuery.refetch();
    trackerStatsQuery.refetch();
    trackerListQuery.refetch();
  };

  // Getting started checklist
  const hasResumes =
    !trackerListQuery.isError &&
    (trackerListQuery.data ?? []).some((a) => Boolean(a.resume_pdf_url));

  const gettingStartedSteps: GettingStartedStep[] = [
    {
      label: 'Profile created',
      description: 'Your profile tells the AI who you are and what you want.',
      done: true, // they reached dashboard = profile exists
      href: '/profile',
      cta: 'Edit profile',
    },
    {
      label: 'Run your first job search',
      description:
        'Launch a mission and the AI will scan hundreds of job boards to find the best matches for you.',
      done: totalMissions > 0,
      href: '/missions/new',
      cta: 'Launch mission',
    },
    {
      label: 'Review your top matches',
      description:
        'Each match is scored A–F. Focus on your A and B grade jobs first.',
      done: totalMatches > 0,
      href: '/matches',
      cta: 'View matches',
    },
    {
      label: 'Tailor a resume for a job',
      description:
        'Click "Tailor Resume" on any match card to generate a custom DOCX resume in seconds.',
      done: hasResumes,
      href: '/matches',
      cta: 'Generate resume',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Getting started checklist — shows until all steps done */}
      {!isInitialLoading && !isCoreError && (
        <GettingStartedCard steps={gettingStartedSteps} />
      )}

      {/* Stat cards */}
      <section>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
          Overview
        </h2>
        {isInitialLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
        ) : isCoreError ? (
          <WarmingUpBanner onRetry={handleRetry} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Missions run"
              value={String(totalMissions)}
              icon={Rocket}
              accent="var(--cyan)"
              href="/missions"
            />
            <StatCard
              label="Total matches"
              value={String(totalMatches)}
              icon={Target}
              accent="var(--violet)"
              href="/matches"
            />
            <StatCard
              label="Applications in progress"
              value={
                trackerStatsQuery.isLoading
                  ? '…'
                  : trackerStatsQuery.isError
                    ? '—'
                    : String(applicationsInProgress)
              }
              icon={ListChecks}
              accent="var(--green)"
              href="/tracker"
            />
            <StatCard
              label="Resumes generated"
              value={trackerListQuery.isLoading ? '…' : resumesGenerated}
              icon={FileText}
              accent="var(--amber)"
              href="/resumes"
            />
          </div>
        )}
      </section>

      {/* Recent missions */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
            Recent Missions
          </h2>
          {totalMissions > 0 && (
            <Link
              href="/missions"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted2)] transition-colors hover:text-[var(--cyan)]"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        <Card className="overflow-hidden">
          {isInitialLoading ? (
            <div className="flex items-center justify-center gap-3 px-6 py-14 text-sm text-[var(--muted)]">
              <Spinner size={18} />
              Loading…
            </div>
          ) : isCoreError ? (
            <div className="p-6">
              <WarmingUpBanner onRetry={handleRetry} />
            </div>
          ) : recentMissions.length === 0 ? (
            <EmptyState
              title="No missions yet"
              description="Launch a mission and the AI will scan job boards and rank the best matches for your profile."
              action={
                <Link href="/missions/new">
                  <Button variant="primary">
                    <Rocket className="h-4 w-4" />
                    Launch your first mission
                  </Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {recentMissions.map((mission) => (
                <li key={mission.id}>
                  <Link
                    href={`/missions/${mission.id}`}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--card)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold tracking-[-0.2px] text-[var(--text)]">
                        {mission.title || mission.search_query || 'Untitled mission'}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--muted)]">
                        {relativeTime(mission.created_at)}
                      </div>
                    </div>

                    <StatusBadge status={mission.status} />

                    <div className="hidden w-28 text-right sm:block">
                      <span className="font-mono text-sm font-semibold text-[var(--text)]">
                        {safeNumber(mission.total_matches)}
                      </span>
                      <span className="ml-1 text-xs text-[var(--muted)]">
                        {safeNumber(mission.total_matches) === 1
                          ? 'match'
                          : 'matches'}
                      </span>
                    </div>

                    <ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted)] transition-colors group-hover:text-[var(--cyan)]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
