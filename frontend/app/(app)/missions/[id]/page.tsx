'use client';

import { use, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import type { MissionOut } from '@/lib/types';
import { useMissionStream } from '@/hooks/useMissionStream';
import { AgentOrb, type AgentOrbState } from '@/components/ui/agent-orb';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { MissionFeed } from '@/components/mission/mission-feed';
import { MissionMeta } from '@/components/mission/mission-meta';
import { useAppStore } from '../../store';

interface MissionConsolePageProps {
  params: Promise<{ id: string }>;
}

export default function MissionConsolePage({ params }: MissionConsolePageProps) {
  const { id } = use(params);

  const setActiveMission = useAppStore((s) => s.setActiveMission);

  // Live agent stream (replays history, then streams live events).
  const { events, status: streamStatus } = useMissionStream(id);
  const live = streamStatus === 'connecting' || streamStatus === 'running';

  // Mission metadata. Poll while the stream is live so counters/elapsed stay
  // fresh; stop polling once the stream reports done.
  const {
    data: mission,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<MissionOut>({
    queryKey: ['mission', id],
    queryFn: () => api.missions.get(id),
    enabled: Boolean(id),
    refetchInterval: live ? 5000 : false,
    // Backend may cold-start ~30s; retry a few times with backoff.
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: 2000,
  });

  // Pull a fresh copy when the stream completes to capture final totals.
  useEffect(() => {
    if (streamStatus === 'done') refetch();
  }, [streamStatus, refetch]);

  // Sync the active mission into global app state on mount / id change.
  useEffect(() => {
    if (id) setActiveMission(id);
  }, [id, setActiveMission]);

  const orbState: AgentOrbState =
    streamStatus === 'done' ? 'done' : 'running';
  const shortId = id.slice(0, 8);
  const title = mission?.title ?? (isLoading ? 'Loading…' : 'Mission');
  const done = streamStatus === 'done';

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      {/* Header bar */}
      <header className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>

        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className="text-[12px] text-[var(--muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              mission-{shortId}
            </span>
            <span className="text-[var(--muted)]">·</span>
            <h1 className="truncate text-lg font-bold tracking-[-0.8px] text-[var(--text)]">
              {title}
            </h1>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <AgentOrb
            state={orbState}
            label={done ? 'Done' : streamStatus === 'connecting' ? 'Connecting' : 'Running'}
          />
          {done && (
            <Link href={`/matches/${id}`}>
              <Button variant="primary">
                View Matches
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Mission-load error (distinct from stream — stream degrades gracefully). */}
      {isError && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--text)]">
              Couldn&apos;t load mission details
            </p>
            <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
              {error instanceof Error ? error.message : 'Unknown error'} — the
              API may be cold-starting.
            </p>
          </div>
          <Button variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Live console */}
      <MissionFeed events={events} status={streamStatus} />

      {/* Meta bar */}
      {isLoading && !mission ? (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-sm text-[var(--muted)]">
          <Spinner size={14} />
          Loading mission details…
        </div>
      ) : (
        <MissionMeta mission={mission} live={live} />
      )}
    </div>
  );
}
