'use client';

import type { CSSProperties } from 'react';
import type { EventType, MissionEventOut } from '@/lib/types';

interface IconSpec {
  glyph: string;
  color: string;
  /** Accessible name for screen readers. */
  label: string;
}

// Console glyph + color per event type (see Mission Console spec).
const EVENT_ICON: Record<EventType, IconSpec> = {
  run: { glyph: '⟳', color: 'var(--cyan)', label: 'running' },
  ok: { glyph: '✓', color: 'var(--green)', label: 'ok' },
  star: { glyph: '★', color: 'var(--amber)', label: 'highlight' },
  info: { glyph: '·', color: 'var(--muted)', label: 'info' },
  warn: { glyph: '!', color: 'var(--amber)', label: 'warning' },
  error: { glyph: '✗', color: 'var(--red)', label: 'error' },
};

const FALLBACK_ICON: IconSpec = {
  glyph: '·',
  color: 'var(--muted)',
  label: 'event',
};

/** Formats an ISO timestamp as a monospace HH:MM:SS console clock. */
function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface FeedItemProps {
  event: MissionEventOut;
  /** Animate the row in. New rows animate; replayed history can skip it. */
  animate?: boolean;
}

export function FeedItem({ event, animate = true }: FeedItemProps) {
  const icon = EVENT_ICON[event.event_type] ?? FALLBACK_ICON;

  const rowStyle: CSSProperties = { fontFamily: 'var(--font-mono)' };

  return (
    <div
      className={[
        'group flex items-start gap-3 px-4 py-1 text-[13px] leading-[1.55]',
        animate ? 'animate-feed-in' : '',
      ].join(' ')}
      style={rowStyle}
    >
      <span
        className="shrink-0 select-none tabular-nums text-[var(--muted)]"
        aria-hidden="true"
      >
        {formatClock(event.created_at)}
      </span>

      <span
        className="w-3 shrink-0 select-none text-center font-bold"
        style={{ color: icon.color }}
        role="img"
        aria-label={icon.label}
      >
        {icon.glyph}
      </span>

      <div className="min-w-0 flex-1">
        <span
          className="break-words text-[var(--text)] [&_strong]:font-semibold [&_strong]:text-white"
          // Messages may contain inline <strong> per the API contract.
          dangerouslySetInnerHTML={{ __html: event.message ?? '' }}
        />
        {event.detail ? (
          <div
            className="mt-1 border-l border-[var(--border-bright)] pl-3 text-[12px] leading-[1.55] text-[var(--muted2)] [&_strong]:font-semibold [&_strong]:text-[var(--text)]"
            // Details may contain <br> per the API contract.
            dangerouslySetInnerHTML={{ __html: event.detail }}
          />
        ) : null}
      </div>
    </div>
  );
}

export default FeedItem;
