'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RotateCw, Target, ArrowRight, Rocket } from 'lucide-react';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { MissionOut } from '@/lib/types';
import { LiquidGlassCard as Card } from '@/components/ui/liquid-glass';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

// Completed missions first (they have matches to browse), then by recency.
function sortMissions(missions: MissionOut[]): MissionOut[] {
  const rank = (m: MissionOut) => (m.status === 'completed' ? 0 : 1);
  return [...missions].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function MatchesIndexPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['missions'],
    queryFn: () => api.missions.list(),
  });

  const missions = sortMissions(data ?? []);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--cyan)]">
          Matches
        </span>
        <h2 className="font-display mt-2 text-2xl font-bold tracking-[-1px] text-[var(--text)]">
          Matches
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pick a mission to review its scored job matches.
        </p>
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : missions.length === 0 ? (
        <Card>
          <EmptyState
            title="No missions yet"
            description="Run a mission to scan job boards and score matches against your profile. Your matches will show up here."
            action={
              <Link href="/missions/new">
                <Button variant="primary">
                  <Rocket className="h-4 w-4" />
                  New Mission
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {missions.map((mission) => (
            <li key={mission.id}>
              <Link href={`/matches/${mission.id}`} className="block">
                <Card className="group flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.4px] text-[var(--text)] transition-colors group-hover:text-[var(--cyan)]">
                      {mission.title || 'Untitled mission'}
                    </h3>
                    <StatusBadge status={mission.status} />
                  </div>

                  <p
                    className="mt-1.5 line-clamp-1 text-xs text-[var(--muted)]"
                    title={mission.search_query}
                  >
                    {mission.search_query}
                  </p>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-sm text-[var(--muted2)]">
                      <Target className="h-4 w-4 text-[var(--cyan)]" />
                      <span className="font-mono font-semibold text-[var(--text)]">
                        {mission.total_matches}
                      </span>
                      <span className="text-[var(--muted)]">
                        {mission.total_matches === 1 ? 'match' : 'matches'}
                      </span>
                    </span>

                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted)] transition-colors group-hover:text-[var(--cyan)]">
                      View
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>

                  <div className="mt-2 text-[11px] text-[var(--muted)]">
                    {relativeTime(mission.created_at)}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="h-3.5 w-36 animate-pulse rounded bg-[var(--card)]" />
            <span className="h-5 w-16 animate-pulse rounded-full bg-[var(--card)]" />
          </div>
          <span className="mt-3 block h-3 w-48 animate-pulse rounded bg-[var(--card)]" />
          <span className="mt-5 block h-4 w-24 animate-pulse rounded bg-[var(--card)]" />
        </li>
      ))}
    </ul>
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
        {message}. The API may be cold-starting — this can take up to 30 seconds.
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
    return error.message.length > 120
      ? `${error.message.slice(0, 120)}…`
      : error.message;
  }
  return 'Something went wrong';
}
