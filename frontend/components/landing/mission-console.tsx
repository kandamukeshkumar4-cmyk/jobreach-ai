'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { AgentOrb } from '@/components/ui/agent-orb';
import { ScoreRing } from '@/components/ui/score-ring';
import { GradeBadge } from '@/components/ui/grade-badge';
import { Chip } from '@/components/ui/chip';
import {
  DEMO_FEED,
  DEMO_MATCHES,
  type DemoFeedItem,
} from '@/components/landing/demo-data';

type Phase = 'idle' | 'running' | 'done';

const FEED_TYPE_META: Record<
  DemoFeedItem['type'],
  { glyph: string; color: string; label: string }
> = {
  run: { glyph: '⟳', color: 'var(--cyan)', label: 'run' }, // ⟳
  ok: { glyph: '✓', color: 'var(--green)', label: 'ok' }, // ✓
  star: { glyph: '★', color: 'var(--amber)', label: 'star' }, // ★
  info: { glyph: '·', color: 'var(--muted)', label: 'info' }, // ·
};

/**
 * Renders a feed message, converting **token** into an emphasized span.
 * Keeps everything inline; no dangerouslySetInnerHTML.
 */
function FeedMessage({ text }: { text: string }) {
  const parts = useMemo(() => text.split(/(\*\*[^*]+\*\*)/g), [text]);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong
              key={i}
              className="font-semibold text-[var(--text)]"
            >
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function FeedRow({ item }: { item: DemoFeedItem }) {
  const meta = FEED_TYPE_META[item.type];
  return (
    <div className="flex gap-2.5 px-3 py-1.5">
      <span
        className="console-log mt-px shrink-0 select-none"
        style={{ color: meta.color }}
        aria-hidden
      >
        {meta.glyph}
      </span>
      <div className="min-w-0">
        <p className="console-log text-[var(--muted2)]">
          <FeedMessage text={item.message} />
        </p>
        {item.detail && (
          <p className="console-log mt-0.5 text-[var(--muted)]">
            {item.detail}
          </p>
        )}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  index,
  reduced,
}: {
  match: (typeof DEMO_MATCHES)[number];
  index: number;
  reduced: boolean;
}) {
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: reduced ? 0 : index * 0.12, ease: 'easeOut' }}
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors duration-150 hover:border-[var(--border-bright)]"
    >
      <div className="flex items-start gap-3">
        <ScoreRing score={match.score} grade={match.grade} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="truncate text-[15px] font-bold tracking-[-0.3px] text-[var(--text)]">
                {match.title}
              </h4>
              <p className="mt-0.5 truncate text-[13px] text-[var(--muted2)]">
                {match.company} · {match.location}
              </p>
            </div>
            <GradeBadge grade={match.grade} score={match.score} />
          </div>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted2)]">
        {match.whyFit}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-[var(--muted)]">
          {match.salary}
        </span>
        <span className="text-[var(--border-bright)]">·</span>
        {match.tags.map((tag) => (
          <Chip key={tag.label} tone={tag.tone}>
            {tag.label}
          </Chip>
        ))}
      </div>
    </motion.div>
  );
}

export function MissionConsole() {
  const reduced = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>('idle');
  const [visibleCount, setVisibleCount] = useState(0);
  const [runId, setRunId] = useState(0);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setPhase('running');
    setVisibleCount(0);

    let elapsed = 0;
    DEMO_FEED.forEach((item, i) => {
      elapsed += reduced ? 120 : item.delay;
      const t = setTimeout(() => {
        setVisibleCount(i + 1);
        if (i === DEMO_FEED.length - 1) {
          const done = setTimeout(
            () => setPhase('done'),
            reduced ? 100 : 600,
          );
          timersRef.current.push(done);
        }
      }, elapsed);
      timersRef.current.push(t);
    });
  }, [clearTimers, reduced]);

  const restart = useCallback(() => {
    setRunId((n) => n + 1);
    start();
  }, [start]);

  // Auto-start once the console scrolls into view.
  const hasStartedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasStartedRef.current) {
            hasStartedRef.current = true;
            start();
          }
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [start]);

  // Clean up timers on unmount.
  useEffect(() => clearTimers, [clearTimers]);

  // Keep the feed scrolled to the latest row.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleCount]);

  const orbState = phase === 'running' ? 'running' : phase === 'done' ? 'done' : 'idle';
  const statusLabel =
    phase === 'done' ? 'completed' : phase === 'running' ? 'running' : 'idle';
  const items = DEMO_FEED.slice(0, visibleCount);

  return (
    <div
      ref={rootRef}
      className="overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[var(--surface)]"
    >
      {/* Console header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <AgentOrb state={orbState} />
          <span className="console-log text-[var(--muted2)]">
            mission-47 · Senior Backend Engineer · Remote EU
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px] uppercase tracking-[0.5px]"
            style={{
              color:
                phase === 'done'
                  ? 'var(--green)'
                  : phase === 'running'
                    ? 'var(--cyan)'
                    : 'var(--muted)',
            }}
          >
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={restart}
            disabled={phase === 'running'}
            className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[12px] font-medium text-[var(--muted2)] transition-colors duration-150 hover:border-[var(--border-bright)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            <RotateCcw size={13} strokeWidth={2} />
            Restart
          </button>
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-[1.15fr_1fr]">
        {/* Live feed */}
        <div className="border-b border-[var(--border)] md:border-b-0 md:border-r">
          <div
            ref={feedRef}
            className="feed-scroll h-[320px] overflow-y-auto py-2"
            aria-live="polite"
            aria-label="Simulated agent activity feed"
          >
            {items.map((item, i) => (
              <div key={`${runId}-${i}`} className="animate-feed-in">
                <FeedRow item={item} />
              </div>
            ))}
            {phase === 'running' && (
              <div className="flex gap-2.5 px-3 py-1.5">
                <span className="console-log animate-pulse text-[var(--cyan)]" aria-hidden>
                  {'⟳'}
                </span>
                <span className="console-log text-[var(--muted)]">working…</span>
              </div>
            )}
          </div>
        </div>

        {/* Match results panel */}
        <div className="h-[320px] overflow-y-auto p-3 feed-scroll">
          {phase !== 'done' ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-3">
                <AgentOrb state={orbState} />
              </div>
              <p className="text-[13px] text-[var(--muted)]">
                {phase === 'idle'
                  ? 'Matches appear here once the agent finishes its run.'
                  : 'Grading candidates and researching companies…'}
              </p>
            </div>
          ) : (
            <AnimatePresence>
              <div className="space-y-3">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.8px] text-[var(--muted)]">
                  3 vetted matches
                </p>
                {DEMO_MATCHES.map((match, i) => (
                  <MatchCard
                    key={`${runId}-${match.id}`}
                    match={match}
                    index={i}
                    reduced={reduced}
                  />
                ))}
              </div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}

export default MissionConsole;
