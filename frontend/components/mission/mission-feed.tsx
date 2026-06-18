'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AgentOrb } from '@/components/ui/agent-orb';
import type { MissionEventOut } from '@/lib/types';
import type { MissionStreamStatus } from '@/hooks/useMissionStream';
import { FeedItem } from './feed-item';

export interface MissionFeedProps {
  events: MissionEventOut[];
  status: MissionStreamStatus;
}

/**
 * The live agent console. Renders streamed MissionEventOut rows in a scrollable
 * monospace panel, auto-scrolling to the newest line unless the user has
 * scrolled up to read history.
 */
export function MissionFeed({ events, status }: MissionFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the viewport is pinned to the bottom. When the user scrolls up we
  // stop auto-following so they can read; re-pin when they return to bottom.
  const pinnedRef = useRef(true);
  const prevCountRef = useRef(0);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  // Track pin state from user scrolling.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 48;
    pinnedRef.current = atBottom;
    setShowJump(!atBottom);
  };

  // Auto-scroll on new events while pinned. useLayoutEffect avoids a flash of
  // the old scroll position before the browser paints.
  useLayoutEffect(() => {
    const grew = events.length > prevCountRef.current;
    const first = prevCountRef.current === 0 && events.length > 0;
    prevCountRef.current = events.length;
    if (!grew) return;
    if (pinnedRef.current) {
      // Jump instantly on initial history replay, smooth for live appends.
      scrollToBottom(first ? 'auto' : 'smooth');
    }
  }, [events.length]);

  // Keep pinned to bottom when the panel resizes (e.g. a tall detail block).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToBottom('auto');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const connecting = status === 'connecting';
  const isEmpty = events.length === 0;

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      {/* Console chrome bar */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span
          className="text-[11px] uppercase tracking-[1px] text-[var(--muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          agent.console
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-[var(--muted)]">
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="feed-scroll h-[440px] overflow-y-auto py-2"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {connecting && isEmpty ? (
          <ConnectingState />
        ) : isEmpty ? (
          <IdleEmptyState />
        ) : (
          <div className="flex flex-col">
            {events.map((event, i) => (
              <FeedItem
                key={event.id ?? `${event.created_at}-${i}`}
                event={event}
              />
            ))}
            {status === 'running' && <ThinkingRow />}
          </div>
        )}
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => {
            pinnedRef.current = true;
            setShowJump(false);
            scrollToBottom('smooth');
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-[var(--border-bright)] bg-[var(--card)] px-3 py-1 text-[11px] font-medium text-[var(--muted2)] shadow-lg transition-colors hover:border-[var(--cyan)] hover:text-[var(--text)]"
        >
          Jump to latest ↓
        </button>
      )}
    </div>
  );
}

function ConnectingState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <AgentOrb state="running" size={14} />
      <p
        className="text-[13px] text-[var(--muted2)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Connecting to agent…
      </p>
      <p className="max-w-xs text-[11px] text-[var(--muted)]">
        The agent may take up to 30 seconds to spin up on a cold start.
      </p>
    </div>
  );
}

function IdleEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p
        className="text-[13px] text-[var(--muted2)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        No events yet.
      </p>
      <p className="max-w-xs text-[11px] text-[var(--muted)]">
        Waiting for the agent to report activity.
      </p>
    </div>
  );
}

/** A trailing cursor row that signals the agent is still working. */
function ThinkingRow() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-1 text-[13px] text-[var(--muted)]"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span className="select-none tabular-nums opacity-0" aria-hidden="true">
        00:00:00
      </span>
      <span className="inline-block h-3.5 w-[7px] animate-pulse bg-[var(--cyan)]" />
    </div>
  );
}

export default MissionFeed;
