'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, RotateCw } from 'lucide-react';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { MissionOut } from '@/lib/types';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

const COLUMN_TEMPLATE =
  'grid grid-cols-[minmax(0,2.2fr)_minmax(0,2.6fr)_104px_88px_92px] items-center gap-4';

export default function MissionsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['missions'],
    queryFn: () => api.missions.list(),
    // Keep the list fresh while missions may be running, without hammering.
    refetchInterval: (query) => {
      const missions = query.state.data;
      const hasRunning = missions?.some(
        (m) => m.status === 'running' || m.status === 'pending',
      );
      return hasRunning ? 5000 : false;
    },
  });

  const missions = data ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <Header count={missions.length} />

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : missions.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState
            title="No missions yet"
            description="Launch a mission to scan job boards, score matches against your profile, and build your application pipeline."
            action={
              <Link href="/missions/new">
                <Button variant="primary">
                  <Plus className="h-4 w-4" />
                  New Mission
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <MissionTable missions={missions} refreshing={isFetching} />
      )}
    </div>
  );
}

function Header({ count }: { count: number }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--cyan)]">
          History
        </span>
        <h2 className="font-display mt-2 text-2xl font-bold tracking-[-1px] text-[var(--text)]">
          Mission history
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {count === 0
            ? 'Every job search you run, tracked end to end.'
            : `${count} ${count === 1 ? 'mission' : 'missions'} run so far.`}
        </p>
      </div>
    </div>
  );
}

function MissionTable({
  missions,
  refreshing,
}: {
  missions: MissionOut[];
  refreshing: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)]">
      <div
        className={`${COLUMN_TEMPLATE} border-b border-[var(--border)] px-5 py-3 font-[family-name:var(--font-mono)] text-[11px] font-semibold uppercase tracking-[1px] text-[var(--muted)]`}
      >
        <span>Mission</span>
        <span>Search query</span>
        <span>Status</span>
        <span className="text-right" title="A/B-grade strong matches">
          Strong
        </span>
        <span className="text-right">Created</span>
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {missions.map((mission) => (
          <MissionRow key={mission.id} mission={mission} />
        ))}
      </ul>

      {refreshing && (
        <div className="border-t border-[var(--border)] px-5 py-2 text-right text-[11px] font-medium tracking-[0.4px] text-[var(--muted)]">
          Refreshing…
        </div>
      )}
    </div>
  );
}

function MissionRow({ mission }: { mission: MissionOut }) {
  const router = useRouter();
  const isLive = mission.status === 'running' || mission.status === 'pending';
  const href = `/missions/${mission.id}`;

  return (
    <li>
      <div
        role="link"
        tabIndex={0}
        onClick={() => router.push(href)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            router.push(href);
          }
        }}
        className={`${COLUMN_TEMPLATE} group cursor-pointer px-5 py-4 transition-colors hover:bg-[var(--card)] focus-visible:bg-[var(--card)] focus-visible:outline-none`}
      >
        {/* Title (also a real anchor for accessibility / open-in-new-tab) */}
        <div className="flex min-w-0 items-center gap-2.5">
          {isLive && <LivePulse />}
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="truncate text-sm font-semibold tracking-[-0.2px] text-[var(--text)] transition-colors group-hover:text-[var(--cyan)]"
          >
            {mission.title}
          </Link>
        </div>

        {/* Search query */}
        <span className="truncate text-sm text-[var(--muted)]" title={mission.search_query}>
          {mission.search_query}
        </span>

        {/* Status */}
        <span>
          <StatusBadge status={mission.status} />
        </span>

        {/* A/B-grade strong matches. The match board shows all scored roles. */}
        <span
          className="text-right font-mono text-sm tabular-nums text-[var(--text)]"
          title={`${mission.total_matches} A/B-grade strong ${
            mission.total_matches === 1 ? 'match' : 'matches'
          }`}
        >
          {mission.total_matches}
        </span>

        {/* Created */}
        <span
          className="text-right text-xs text-[var(--muted2)]"
          title={new Date(mission.created_at).toLocaleString()}
        >
          {relativeTime(mission.created_at)}
        </span>
      </div>
    </li>
  );
}

function LivePulse() {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-label="Running">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--cyan)] opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--cyan)]" />
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)]">
      <div
        className={`${COLUMN_TEMPLATE} border-b border-[var(--border)] px-5 py-3 font-[family-name:var(--font-mono)] text-[11px] font-semibold uppercase tracking-[1px] text-[var(--muted)]`}
      >
        <span>Mission</span>
        <span>Search query</span>
        <span>Status</span>
        <span className="text-right">Strong</span>
        <span className="text-right">Created</span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className={`${COLUMN_TEMPLATE} px-5 py-4`}>
            <SkeletonBar className="w-36" />
            <SkeletonBar className="w-56" />
            <SkeletonBar className="w-16 rounded-full" />
            <SkeletonBar className="ml-auto w-8" />
            <SkeletonBar className="ml-auto w-12" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkeletonBar({ className = '' }: { className?: string }) {
  return (
    <span
      className={`block h-3.5 animate-pulse rounded bg-[var(--card)] ${className}`}
    />
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-bright)] bg-[var(--card)]">
        <AlertTriangle className="h-5 w-5 text-[var(--red)]" />
      </div>
      <h3 className="font-display mt-4 text-base font-bold tracking-[-0.5px] text-[var(--text)]">
        Couldn&apos;t load missions
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-[var(--muted)]">
        {message}. This is usually momentary — please retry.
      </p>
      <div className="mt-5">
        <Button variant="secondary" onClick={onRetry}>
          <RotateCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    // api.ts throws `${status} ${detail}` — keep it short and readable.
    return error.message.length > 120
      ? `${error.message.slice(0, 120)}…`
      : error.message;
  }
  return 'Something went wrong';
}
