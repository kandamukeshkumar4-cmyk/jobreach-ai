'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/ui/status-badge';
import type { MissionOut } from '@/lib/types';

export interface MissionMetaProps {
  mission?: MissionOut;
  /** True while the SSE stream is connecting or running (drives the live clock). */
  live: boolean;
}

/**
 * Meta bar below the console: source badges, scan/filter/match counters, a live
 * elapsed-time clock, and the mission status badge.
 */
export function MissionMeta({ mission, live }: MissionMetaProps) {
  const elapsed = useElapsed(mission?.started_at, mission?.completed_at, live);
  const sources = extractSources(mission);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <Stat label="Scanned" value={mission?.total_scanned} />
        <Stat label="Filtered" value={mission?.total_filtered} />
        <Stat label="Matches" value={mission?.total_matches} accent="cyan" />

        <div className="flex flex-col gap-1">
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[1.4px] text-[var(--muted)]">
            Elapsed
          </span>
          <span
            className="text-lg font-semibold tabular-nums tracking-[-0.5px] text-[var(--text)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {elapsed}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {sources.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[1.4px] text-[var(--muted)]">
                Sources
              </span>
              <div className="flex flex-wrap gap-1.5">
                {sources.map((src) => (
                  <span
                    key={src}
                    className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--muted2)]"
                  >
                    {src}
                  </span>
                ))}
              </div>
            </div>
          )}
          {mission ? <StatusBadge status={mission.status} /> : null}
        </div>
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value?: number;
  accent?: 'cyan';
}

function Stat({ label, value, accent }: StatProps) {
  const color = accent === 'cyan' ? 'var(--cyan)' : 'var(--text)';
  return (
    <div className="flex flex-col gap-1">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[1.4px] text-[var(--muted)]">
        {label}
      </span>
      <span
        className="text-lg font-semibold tabular-nums tracking-[-0.5px]"
        style={{ color, fontFamily: 'var(--font-mono)' }}
      >
        {value == null ? '—' : value.toLocaleString('en-US')}
      </span>
    </div>
  );
}

/**
 * Computes the elapsed time from started_at, ticking once per second while live
 * and the mission is unfinished. Freezes at the final duration when complete.
 */
function useElapsed(
  startedAt: string | undefined,
  completedAt: string | undefined,
  live: boolean,
): string {
  const [now, setNow] = useState(() => Date.now());

  const startMs = startedAt ? new Date(startedAt).getTime() : NaN;
  const endMs = completedAt ? new Date(completedAt).getTime() : NaN;
  const finished = !Number.isNaN(endMs);
  const ticking = live && !finished && !Number.isNaN(startMs);

  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  if (Number.isNaN(startMs)) return '00:00';

  const reference = finished ? endMs : now;
  const totalSec = Math.max(0, Math.floor((reference - startMs) / 1000));
  return formatDuration(totalSec);
}

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/**
 * Best-effort extraction of source labels from a mission. The contract doesn't
 * guarantee a typed `sources` field, so we probe common shapes defensively.
 */
function extractSources(mission?: MissionOut): string[] {
  if (!mission) return [];
  const raw = (mission as unknown as Record<string, unknown>).sources;
  let list: unknown[] = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    list = raw.split(',');
  }

  const cleaned = list
    .map((v) => (typeof v === 'string' ? v.trim() : String(v ?? '').trim()))
    .filter((v) => v.length > 0);

  return Array.from(new Set(cleaned));
}

export default MissionMeta;
