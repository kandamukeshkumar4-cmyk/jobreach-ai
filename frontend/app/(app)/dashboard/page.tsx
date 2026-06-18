'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Rocket,
  Target,
  ListChecks,
  FileText,
  ArrowRight,
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

// Applications considered "in progress" (i.e. not closed out).
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
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.5px] text-[var(--muted)]">
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
    </Card>
  );
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
  'Waking up AI agent…',
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
          {/* Pulsing orb */}
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
              This takes up to 30 seconds on first load
            </p>
          </div>
          <button
            onClick={onRetry}
            className="ml-auto text-xs text-[var(--muted)] underline-offset-2 hover:text-[var(--cyan)] hover:underline"
          >
            Skip
          </button>
        </div>

        {/* Progress bar */}
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

  // Stat derivations — all defensive against missing/partial data.
  const totalMissions = missions.length;

  const totalMatches = missions.reduce(
    (acc, m) => acc + safeNumber(m.total_matches),
    0,
  );

  const applicationsInProgress = inProgressCount(trackerStatsQuery.data);

  // Resumes generated: count tracker rows that carry a generated resume PDF.
  // If the tracker list failed to load, fall back to an em dash.
  const resumesGenerated = trackerListQuery.isError
    ? '—'
    : String(
        (trackerListQuery.data ?? []).filter(
          (a) => Boolean(a.resume_pdf_url),
        ).length,
      );

  const recentMissions = [...missions]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 5);

  // The page is anchored by the missions list. If that core call is in flight
  // with no cached data, show a full loading state; if it hard-fails, show the
  // retry banner. Secondary stats degrade gracefully on their own.
  const isInitialLoading = missionsQuery.isLoading;
  const isCoreError = missionsQuery.isError;

  const handleRetry = () => {
    missionsQuery.refetch();
    trackerStatsQuery.refetch();
    trackerListQuery.refetch();
  };

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <section>
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
            />
            <StatCard
              label="Active matches"
              value={String(totalMatches)}
              icon={Target}
              accent="var(--violet)"
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
            />
            <StatCard
              label="Resumes generated"
              value={trackerListQuery.isLoading ? '…' : resumesGenerated}
              icon={FileText}
              accent="var(--amber)"
            />
          </div>
        )}
      </section>

      {/* Recent missions */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-[-0.8px] text-[var(--text)]">
            Recent Missions
          </h2>
          {totalMissions > 0 && (
            <Link
              href="/missions"
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--muted2)] transition-colors hover:text-[var(--cyan)]"
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
              Loading missions…
            </div>
          ) : isCoreError ? (
            <div className="p-6">
              <WarmingUpBanner onRetry={handleRetry} />
            </div>
          ) : recentMissions.length === 0 ? (
            <EmptyState
              title="No missions yet"
              description="Launch your first mission to start scanning and scoring jobs against your profile."
              action={
                <Link href="/missions/new">
                  <Button variant="primary">
                    <Rocket className="h-4 w-4" />
                    New Mission
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
                        {mission.title || 'Untitled mission'}
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
