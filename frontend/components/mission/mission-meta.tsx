'use client';

import { StatusBadge } from '@/components/ui/status-badge';
import type { MissionOut } from '@/lib/types';

export interface MissionMetaProps {
  mission?: MissionOut;
  /** Accepted for API compatibility; the live clock now lives in the console. */
  live?: boolean;
}

/**
 * Summary bar below the console: scan/filter/match totals, source badges, and
 * the mission status badge. The live elapsed clock now lives in the console
 * hero (the always-ticking anti-"stuck" anchor), so it's not duplicated here.
 */
export function MissionMeta({ mission }: MissionMetaProps) {
  const sources = extractSources(mission);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <Stat label="Scanned" value={mission?.total_scanned} />
        <Stat label="Filtered" value={mission?.total_filtered} />
        <Stat label="Matches" value={mission?.total_matches} accent="cyan" />

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
