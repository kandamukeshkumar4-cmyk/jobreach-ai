'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RotateCw, ArrowLeft, Target } from 'lucide-react';
import { api } from '@/lib/api';
import type { Grade, MatchOut } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { MatchCard } from '@/components/match/match-card';

type GradeFilter = 'all' | 'A' | 'B' | 'C';
type SortKey = 'score' | 'salary' | 'company';

const GRADE_TABS: { key: GradeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'A', label: 'A' },
  { key: 'B', label: 'B' },
  { key: 'C', label: 'C' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Score (high → low)' },
  { key: 'salary', label: 'Salary (high → low)' },
  { key: 'company', label: 'Company (A → Z)' },
];

// Map grade letters to a coarse rank for "Strong Matches" counting (A/B).
const STRONG_GRADES = new Set<Grade>(['A', 'B']);

function matchesGrade(match: MatchOut, filter: GradeFilter): boolean {
  if (filter === 'all') return true;
  return match.grade === filter;
}

function salaryValue(match: MatchOut): number {
  const { salary_max, salary_min } = match.job ?? {};
  if (typeof salary_max === 'number') return salary_max;
  if (typeof salary_min === 'number') return salary_min;
  return -1; // unknown salaries sort to the bottom
}

function sortMatches(matches: MatchOut[], sort: SortKey): MatchOut[] {
  const copy = [...matches];
  switch (sort) {
    case 'salary':
      return copy.sort((a, b) => salaryValue(b) - salaryValue(a));
    case 'company':
      return copy.sort((a, b) =>
        (a.job?.company ?? '').localeCompare(b.job?.company ?? '', undefined, {
          sensitivity: 'base',
        }),
      );
    case 'score':
    default:
      return copy.sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));
  }
}

export default function MatchBoardPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = use(params);

  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [sort, setSort] = useState<SortKey>('score');

  // Fetch all matches once; grade filtering is done client-side so switching
  // tabs is instant and we can show accurate per-tab counts.
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['matches', missionId],
    queryFn: () => api.matches.list(missionId),
    enabled: Boolean(missionId),
  });

  const allMatches = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    const c = { all: allMatches.length, A: 0, B: 0, C: 0 };
    for (const m of allMatches) {
      if (m.grade === 'A') c.A += 1;
      else if (m.grade === 'B') c.B += 1;
      else if (m.grade === 'C') c.C += 1;
    }
    return c;
  }, [allMatches]);

  const visibleMatches = useMemo(() => {
    const filtered = allMatches.filter((m) => matchesGrade(m, gradeFilter));
    return sortMatches(filtered, sort);
  }, [allMatches, gradeFilter, sort]);

  const strongCount = useMemo(
    () => allMatches.filter((m) => STRONG_GRADES.has(m.grade)).length,
    [allMatches],
  );

  return (
    <div className="mx-auto max-w-6xl">
      {/* Back link */}
      <Link
        href="/matches"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted2)] transition-colors hover:text-[var(--cyan)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All missions
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-[-1px] text-[var(--text)]">
            {isLoading ? (
              <span className="inline-block h-7 w-48 animate-pulse rounded bg-[var(--card)] align-middle" />
            ) : (
              <>
                {strongCount} Strong {strongCount === 1 ? 'Match' : 'Matches'}
              </>
            )}
          </h2>
          {!isLoading && !isError && (
            <p className="mt-1 text-sm text-[var(--muted)]">
              {counts.all} scored {counts.all === 1 ? 'role' : 'roles'} in this
              mission.
            </p>
          )}
        </div>

        {/* Sort */}
        {!isLoading && !isError && allMatches.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="font-medium uppercase tracking-[0.5px]">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)] outline-none transition-colors hover:border-[var(--border-bright)] focus-visible:border-[var(--border-bright)] focus-visible:ring-1 focus-visible:ring-[var(--cyan)]"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Filter tabs */}
      {!isLoading && !isError && allMatches.length > 0 && (
        <div className="mb-6 inline-flex items-center gap-1 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] p-1">
          {GRADE_TABS.map((tab) => {
            const active = gradeFilter === tab.key;
            const count = counts[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setGradeFilter(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-sm font-medium tracking-[-0.2px] transition-colors ${
                  active
                    ? 'bg-[var(--card)] text-[var(--text)]'
                    : 'text-[var(--muted2)] hover:text-[var(--text)]'
                }`}
              >
                {tab.label}
                <span
                  className={`font-mono text-[11px] ${
                    active ? 'text-[var(--cyan)]' : 'text-[var(--muted)]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <GridSkeleton />
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : allMatches.length === 0 ? (
        <Card>
          <EmptyState
            title="No matches yet"
            description="This mission hasn't produced any scored matches. If it's still running, check back shortly."
            action={
              <Link href={`/missions/${missionId}`}>
                <Button variant="secondary">
                  <Target className="h-4 w-4" />
                  View mission
                </Button>
              </Link>
            }
          />
        </Card>
      ) : visibleMatches.length === 0 ? (
        <Card>
          <EmptyState
            title={`No ${gradeFilter}-grade matches`}
            description="Try a different grade filter to see more roles."
            action={
              <Button variant="secondary" onClick={() => setGradeFilter('all')}>
                Show all
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {isFetching && (
            <div className="mb-3 text-right text-[11px] font-medium tracking-[0.4px] text-[var(--muted)]">
              Refreshing…
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleMatches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="block h-3 w-24 animate-pulse rounded bg-[var(--card)]" />
              <span className="mt-2 block h-4 w-40 animate-pulse rounded bg-[var(--card)]" />
              <span className="mt-2 block h-3 w-28 animate-pulse rounded bg-[var(--card)]" />
            </div>
            <span className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-[var(--card)]" />
          </div>
          <div className="mt-5 space-y-2">
            {Array.from({ length: 4 }).map((__, j) => (
              <span
                key={j}
                className="block h-2.5 w-full animate-pulse rounded bg-[var(--card)]"
              />
            ))}
          </div>
          <div className="mt-5 flex gap-2 border-t border-[var(--border)] pt-4">
            <span className="h-9 flex-1 animate-pulse rounded-[7px] bg-[var(--card)]" />
            <span className="h-9 w-16 animate-pulse rounded-[7px] bg-[var(--card)]" />
            <span className="h-9 w-16 animate-pulse rounded-[7px] bg-[var(--card)]" />
          </div>
        </div>
      ))}
    </div>
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-bright)] bg-[var(--card)]">
        <AlertTriangle className="h-5 w-5 text-[var(--red)]" />
      </div>
      <h3 className="mt-4 text-base font-bold tracking-[-0.5px] text-[var(--text)]">
        Couldn&apos;t load matches
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
