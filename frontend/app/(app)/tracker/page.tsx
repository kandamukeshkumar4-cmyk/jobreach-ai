'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Table as TableIcon,
  Target,
} from 'lucide-react';
import { api } from '@/lib/api';
import { relativeTime, cn, errorMessage } from '@/lib/format';
import type {
  ApplicationOut,
  ApplicationStatus,
  ApplicationUpdate,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ScoreRing } from '@/components/ui/score-ring';
import { StatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { KanbanColumn } from '@/components/tracker/kanban-column';
import { AppDrawer } from '@/components/tracker/app-drawer';
import { FollowupStrip } from '@/components/tracker/followup-strip';
import {
  ARCHIVED_STATUSES,
  PIPELINE_STATUSES,
  TRACKER_KEY,
} from '@/components/tracker/constants';

type ViewMode = 'kanban' | 'table';

export default function TrackerPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>('kanban');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: TRACKER_KEY,
    queryFn: () => api.tracker.list(),
  });

  const applications = useMemo(() => data ?? [], [data]);

  const openApp = useMemo(
    () => applications.find((a) => a.id === openId) ?? null,
    [applications, openId],
  );

  // One optimistic update path shared by drag-drop AND drawer edits. onMutate
  // cancels in-flight refetches (so a background poll can't clobber the write),
  // snapshots per-mutation for rollback, and onSettled refetches once the
  // request resolves — not mid-flight, which is what caused the drop flicker.
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ApplicationUpdate }) =>
      api.tracker.update(id, payload),
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: TRACKER_KEY });
      const previous = queryClient.getQueryData<ApplicationOut[]>(TRACKER_KEY);
      queryClient.setQueryData<ApplicationOut[]>(TRACKER_KEY, (old) =>
        (old ?? []).map((a) => (a.id === id ? { ...a, ...payload } : a)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      const previous = (ctx as { previous?: ApplicationOut[] } | undefined)?.previous;
      if (previous) queryClient.setQueryData(TRACKER_KEY, previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: TRACKER_KEY });
      void queryClient.invalidateQueries({ queryKey: ['tracker', 'stats'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.tracker.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TRACKER_KEY });
      void queryClient.invalidateQueries({ queryKey: ['tracker', 'stats'] });
    },
  });

  const handleSave = async (id: string, payload: ApplicationUpdate) => {
    await updateMutation.mutateAsync({ id, payload });
  };

  const handleDelete = async (id: string) => {
    await removeMutation.mutateAsync(id);
  };

  // Drag-to-move between kanban columns — read the row from the LIVE cache (not
  // the render closure) so a background refetch can't make this act on stale data.
  const handleDropCard = (id: string, target: ApplicationStatus) => {
    const current = (queryClient.getQueryData<ApplicationOut[]>(TRACKER_KEY) ?? []).find(
      (a) => a.id === id,
    );
    if (!current || current.status === target) return;
    updateMutation.mutate({ id, payload: { status: target } });
  };

  const showToggle = !isLoading && !isError && applications.length > 0;

  // Count by pipeline status for the chrome bar chips
  const byStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of applications) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    }
    return counts;
  }, [applications]);

  const pipelineCount = PIPELINE_STATUSES.reduce((n, s) => n + (byStatus[s.value] ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* ── Chrome bar ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_94%,white_2%),var(--surface))] shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
            </div>
            <span className="text-[11px] uppercase tracking-[1.8px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
              PIPELINE.TRACKER
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:ml-4">
            {PIPELINE_STATUSES.map((s) => {
              const n = byStatus[s.value] ?? 0;
              if (!n && applications.length > 0) return null;
              return (
                <span
                  key={s.value}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.8px] text-[var(--muted2)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: s.accent }} />
                  {s.label} {n > 0 && <span className="font-semibold text-[var(--text)]">{n}</span>}
                </span>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {isFetching && !isLoading && (
              <span className="text-[11px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>Refreshing…</span>
            )}
            {showToggle && (
              <div className="inline-flex shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
                <ToggleButton active={view === 'kanban'} onClick={() => setView('kanban')}>
                  <Columns3 className="h-3.5 w-3.5" />
                  Kanban
                </ToggleButton>
                <ToggleButton active={view === 'table'} onClick={() => setView('table')}>
                  <TableIcon className="h-3.5 w-3.5" />
                  Table
                </ToggleButton>
              </div>
            )}
          </div>
        </div>

        {/* Inline header row */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-[-0.8px] text-[var(--text)]">
              Application tracker
            </h2>
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">
              {applications.length === 0
                ? 'Track jobs from the Match board to build your pipeline.'
                : `${applications.length} ${applications.length === 1 ? 'application' : 'applications'} · ${pipelineCount} in pipeline`}
            </p>
          </div>
          {!isLoading && !isError && applications.length > 0 && (
            <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {PIPELINE_STATUSES.map((s) => (
                <div key={s.value} className="flex flex-col items-center rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_60%,transparent)] px-3 py-2">
                  <span className="text-[18px] font-bold tabular-nums" style={{ color: byStatus[s.value] ? s.accent : 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                    {byStatus[s.value] ?? 0}
                  </span>
                  <span className="mt-0.5 text-[10px] uppercase tracking-[0.6px] text-[var(--muted)]">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!isLoading && !isError && applications.length > 0 && (
        <FollowupStrip
          applications={applications}
          onOpen={(a) => setOpenId(a.id)}
        />
      )}

      {isLoading ? (
        <KanbanSkeleton />
      ) : isError ? (
        <ErrorState
          title="Couldn't load your tracker"
          message={errorMessage(error)}
          onRetry={() => void refetch()}
        />
      ) : applications.length === 0 ? (
        <EmptyTrackerState />
      ) : view === 'kanban' ? (
        <KanbanView
          applications={applications}
          draggingId={draggingId}
          onOpen={(a) => setOpenId(a.id)}
          onDragStart={(a) => setDraggingId(a.id)}
          onDragEnd={() => setDraggingId(null)}
          onDropCard={handleDropCard}
        />
      ) : (
        <TableView
          applications={applications}
          onOpen={(a) => setOpenId(a.id)}
        />
      )}

      {openApp && (
        <AppDrawer
          key={openApp.id}
          application={openApp}
          onClose={() => setOpenId(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Empty tracker state
 * ------------------------------------------------------------------------- */

function EmptyTrackerState() {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_94%,white_2%),var(--surface))]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[11px] uppercase tracking-[1.8px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
            pipeline empty
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center px-8 py-14 text-center">
        <p className="text-[13px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
          No applications tracked yet
        </p>
        <p className="mt-2 max-w-sm text-[12px] text-[var(--muted)]">
          Click <strong className="text-[var(--text)]">Track</strong> on any match card to add it to this pipeline. You can then drag cards between stages and log notes.
        </p>
        <div className="mt-5">
          <Link href="/matches">
            <Button variant="primary">
              <Target className="h-4 w-4" />
              Go to Matches
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-[var(--card)] text-[var(--cyan)]'
          : 'text-[var(--muted2)] hover:text-[var(--text)]',
      )}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------------------
 * Kanban view
 * ------------------------------------------------------------------------- */

function groupByStatus(
  applications: ApplicationOut[],
): Record<string, ApplicationOut[]> {
  const groups: Record<string, ApplicationOut[]> = {};
  for (const app of applications) {
    (groups[app.status] ??= []).push(app);
  }
  return groups;
}

function KanbanView({
  applications,
  draggingId,
  onOpen,
  onDragStart,
  onDragEnd,
  onDropCard,
}: {
  applications: ApplicationOut[];
  draggingId: string | null;
  onOpen: (a: ApplicationOut) => void;
  onDragStart: (a: ApplicationOut) => void;
  onDragEnd: () => void;
  onDropCard: (id: string, target: ApplicationStatus) => void;
}) {
  const groups = useMemo(() => groupByStatus(applications), [applications]);

  const archivedCount = ARCHIVED_STATUSES.reduce(
    (acc, s) => acc + (groups[s.value]?.length ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      {/* Pipeline columns */}
      <div className="min-w-0 flex-1 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {PIPELINE_STATUSES.map((s) => (
            <KanbanColumn
              key={s.value}
              status={s.value}
              label={s.label}
              accent={s.accent}
              applications={groups[s.value] ?? []}
              draggingId={draggingId}
              onOpen={onOpen}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropCard={onDropCard}
            />
          ))}
        </div>
      </div>

      {/* Side rail: rejected & discarded */}
      <div className="w-full shrink-0 xl:w-[280px]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="mb-3 flex items-center gap-2 px-1">
            <h3 className="text-xs font-semibold uppercase tracking-[0.6px] text-[var(--muted2)]">
              Archived
            </h3>
            <span className="ml-auto font-mono text-xs tabular-nums text-[var(--muted)]">
              {archivedCount}
            </span>
          </div>
          <div className="space-y-4">
            {ARCHIVED_STATUSES.map((s) => (
              <KanbanColumn
                key={s.value}
                status={s.value}
                label={s.label}
                accent={s.accent}
                applications={groups[s.value] ?? []}
                draggingId={draggingId}
                onOpen={onOpen}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDropCard={onDropCard}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Table view
 * ------------------------------------------------------------------------- */

type SortKey = 'status' | 'score' | 'created';
type SortDir = 'asc' | 'desc';

const STATUS_RANK: Record<string, number> = {
  evaluated: 0,
  applied: 1,
  responded: 2,
  interview: 3,
  offer: 4,
  rejected: 5,
  discarded: 6,
  skip: 7,
};

const TABLE_TEMPLATE =
  'grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_140px_84px_104px] items-center gap-4';

function TableView({
  applications,
  onOpen,
}: {
  applications: ApplicationOut[];
  onOpen: (a: ApplicationOut) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const rows = [...applications];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'status') {
        cmp = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
      } else if (sortKey === 'score') {
        cmp = a.overall_score - b.overall_score;
      } else {
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [applications, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Sensible defaults: score high-first, dates newest-first, status pipeline order.
      setSortDir(key === 'status' ? 'asc' : 'desc');
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div
        className={`${TABLE_TEMPLATE} border-b border-[var(--border)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.6px] text-[var(--muted)]`}
      >
        <span>Role</span>
        <span>Company</span>
        <SortHeader
          label="Status"
          active={sortKey === 'status'}
          dir={sortDir}
          onClick={() => toggleSort('status')}
        />
        <SortHeader
          label="Score"
          active={sortKey === 'score'}
          dir={sortDir}
          onClick={() => toggleSort('score')}
          align="right"
        />
        <SortHeader
          label="Created"
          active={sortKey === 'created'}
          dir={sortDir}
          onClick={() => toggleSort('created')}
          align="right"
        />
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {sorted.map((app) => (
          <li key={app.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpen(app)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen(app);
                }
              }}
              className={`${TABLE_TEMPLATE} group cursor-pointer px-5 py-3.5 transition-colors hover:bg-[var(--card)] focus-visible:bg-[var(--card)] focus-visible:outline-none`}
            >
              <span className="truncate text-sm font-semibold tracking-[-0.2px] text-[var(--text)] transition-colors group-hover:text-[var(--cyan)]">
                {app.job_title || 'Untitled role'}
              </span>
              <span className="truncate text-sm text-[var(--muted)]">
                {app.company || '—'}
              </span>
              <span>
                <StatusBadge status={app.status} />
              </span>
              <span className="flex justify-end">
                <ScoreRing size={30} score={app.overall_score} grade={app.grade} />
              </span>
              <span
                className="text-right text-xs text-[var(--muted2)]"
                title={new Date(app.created_at).toLocaleString()}
              >
                {relativeTime(app.created_at)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = 'left',
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.6px] transition-colors hover:text-[var(--text)] focus-visible:outline-none',
        active ? 'text-[var(--cyan)]' : 'text-[var(--muted)]',
        align === 'right' ? 'justify-end' : 'justify-start',
      )}
    >
      {label}
      {active &&
        (dir === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        ))}
    </button>
  );
}

/* ----------------------------------------------------------------------------
 * Loading / error states
 * ------------------------------------------------------------------------- */

function KanbanSkeleton() {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {PIPELINE_STATUSES.map((s) => (
            <div key={s.value} className="flex min-w-[260px] flex-1 flex-col">
              <div className="mb-3 flex items-center gap-2 px-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.accent }}
                />
                <span className="text-xs font-semibold uppercase tracking-[0.6px] text-[var(--muted2)]">
                  {s.label}
                </span>
              </div>
              <div className="flex flex-col gap-2.5 p-1.5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="w-full shrink-0 xl:w-[280px]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <Skeleton className="mb-3 h-3 w-20" />
          <CardSkeleton />
        </div>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton tone="surface" className="h-3.5 w-32" />
          <Skeleton tone="surface" className="h-3 w-20" />
        </div>
        <Skeleton tone="surface" className="h-8 w-8 shrink-0 rounded-full" />
      </div>
    </div>
  );
}
