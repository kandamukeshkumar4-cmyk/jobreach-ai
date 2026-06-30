'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/format';
import type { EventType, MissionEventOut } from '@/lib/types';
import { statusMeta, type MissionStreamStatus } from '@/hooks/useMissionStream';

export interface MissionFeedProps {
  events: MissionEventOut[];
  status: MissionStreamStatus;
  missionTitle?: string;
}

// ── Tag config ────────────────────────────────────────────────────────────────

interface TagSpec {
  label: string;
  color: string;
}

// Colors reference the Huly tokens in globals.css — single source of truth.
const TYPE_TAG: Partial<Record<EventType, TagSpec>> = {
  ok:    { label: 'OK',    color: 'var(--green)' },
  star:  { label: 'MATCH', color: 'var(--green)' },
  info:  { label: 'INFO',  color: 'var(--muted2)' },
  warn:  { label: 'WARN',  color: 'var(--amber)' },
  error: { label: 'ERR',   color: 'var(--red)' },
};

function getTag(event: MissionEventOut): TagSpec {
  const typeTag = TYPE_TAG[event.event_type];
  if (typeTag) return typeTag;

  // For 'run' events, infer the stage from message content.
  const msg = (event.message ?? '').toLowerCase();
  if (/exa|semantic/.test(msg))                              return { label: 'SEARCH', color: 'var(--amber)' };
  if (/greenhouse|lever|ashby|smartrecruiters|ats/.test(msg)) return { label: 'BOARD',  color: 'var(--cyan)' };
  if (/rss|remoteok|workable/.test(msg))                     return { label: 'BOARD',  color: 'var(--cyan)' };
  if (/filter|eliminat/.test(msg))                           return { label: 'FILTER', color: 'var(--violet)' };
  if (/verify|live|prune|dead|closed/.test(msg))             return { label: 'VERIFY', color: 'var(--green)' };
  if (/research|funding|culture|sentiment/.test(msg))        return { label: 'RSRCH',  color: 'var(--violet)' };
  if (/scor|rank|match|grade|priorit/.test(msg))             return { label: 'SCORE',  color: 'var(--violet)' };
  if (/profile|archetype|loaded/.test(msg))                  return { label: 'INIT',   color: 'var(--cyan)' };
  return { label: 'AGENT', color: 'var(--cyan)' };
}

function cleanHtml(value?: string): string {
  return (value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Pipeline stages ─────────────────────────────────────────────────────────
// The agent's real method, in order. Each stage "reaches" when a matching event
// has actually arrived — so progress reflects what happened, never a timer.

type StageState = 'done' | 'active' | 'pending';

// Regexes key on the actual phrases the worker emits (search.py / score.py) so
// an incidental keyword in a job title can't falsely advance the rail. Once a
// later stage's phrase matches, the earlier ones fill in by position — the
// agent emits in pipeline order, so that's truthful, not guessed.
const PIPELINE: ReadonlyArray<{ key: string; label: string; test: RegExp }> = [
  { key: 'search', label: 'Search', test: /exa returned|semantic search|searching exa/ },
  { key: 'boards', label: 'Boards', test: /ats feeds returned|scanned [\d,]+ postings|greenhouse|lever|ashby|smartrecruiters/ },
  { key: 'filter', label: 'Filter', test: /filtered to|filtering/ },
  { key: 'verify', label: 'Verify', test: /verifying [\d,]+ postings|still live|verified live/ },
  { key: 'score',  label: 'Score',  test: /\/5\.0|scoring roles|ranking your/ },
];

interface StageInfo { key: string; label: string; state: StageState }

function computeStages(
  events: MissionEventOut[],
  done: boolean,
  failed: boolean,
): { stages: StageInfo[]; fillPct: number } {
  const haystacks = events.map(
    (e) => `${cleanHtml(e.message)} ${cleanHtml(e.detail)}`.toLowerCase(),
  );
  let reachedIdx = -1;
  PIPELINE.forEach((stage, i) => {
    if (haystacks.some((h) => stage.test.test(h))) reachedIdx = Math.max(reachedIdx, i);
  });

  const stages: StageInfo[] = PIPELINE.map((stage, i) => {
    let state: StageState;
    if (done) state = 'done';
    else if (i < reachedIdx) state = 'done';
    // On failure nothing is "active" — the rail freezes where it stopped so the
    // header's red FAILED isn't contradicted by a pulsing stage.
    else if (i === reachedIdx) state = failed ? 'pending' : 'active';
    else state = 'pending';
    return { key: stage.key, label: stage.label, state };
  });

  // Fill reflects completed stages only; the active stage counts as a half-step
  // so the bar nudges forward honestly without ever claiming a fake percentage.
  const fillPct = done
    ? 100
    : reachedIdx < 0
      ? 4
      : Math.round(((reachedIdx + 0.5) / PIPELINE.length) * 100);

  return { stages, fillPct };
}

function StageDot({ state }: { state: StageState }) {
  if (state === 'done') {
    return (
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--cyan)]">
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-[var(--bg)]" fill="none"
          stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.5 5 9l4.5-5.5" />
        </svg>
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--cyan)] opacity-30" />
        <span className="relative h-2 w-2 rounded-full bg-[var(--cyan)]" />
      </span>
    );
  }
  return <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--border-bright)]" />;
}

// ── Match card parser ─────────────────────────────────────────────────────────

interface ParsedMatch {
  role: string;
  company: string;
  score: string;
  scoreNum: number;
  initial: string;
  color: string;
}

// Stay inside the brand trio (cyan / blue / violet) so avatars never break the
// color lock — a stable per-company pick keeps each company visually distinct.
const AVATAR_TINTS = ['var(--cyan)', 'var(--blue)', 'var(--violet)'];
function hashColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_TINTS.length;
  return AVATAR_TINTS[h];
}

function parseMatch(event: MissionEventOut): ParsedMatch | null {
  const raw = cleanHtml(event.message).replace(/^[a-f]?\s*match\s*[:]\s*/i, '').trim();
  // Greedy role capture splits at the LAST " at "/"@" so a role like
  // "Manager at Risk at Acme" keeps "Acme" as the company.
  const m = raw.match(/^(.+)\s+(?:at|@)\s+(.+?)\s*[-–—]+\s*([\d.]+)/i);
  if (!m) return null;
  const role = m[1].trim();
  const company = m[2].trim();
  const n = parseFloat(m[3]);
  // Reject garbage: empty role/company, or a non-numeric / out-of-band score.
  if (!role || !company || Number.isNaN(n)) return null;
  const scoreNum = Math.min(5, Math.max(0, n));
  return {
    role,
    company,
    score: scoreNum.toFixed(1),
    scoreNum,
    initial: (company.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase(),
    color: hashColor(company),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PulsingDot() {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--cyan)] opacity-30" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--cyan)]" />
    </span>
  );
}

function SpinIcon() {
  return (
    <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function BlinkingCursor() {
  return (
    <div className="flex items-center gap-3 px-5 py-2" style={{ fontFamily: 'var(--font-mono)' }}>
      <div className="h-1.5 w-1.5 rounded-full bg-white/10 shrink-0" />
      <span
        className="text-[13px] text-[var(--subtle)] italic"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        Searching
        <span className="mission-cursor ml-1 inline-block h-[14px] w-[5px] translate-y-[2px] bg-[var(--cyan)]" />
      </span>
    </div>
  );
}

function LogRow({ event, isLatest }: { event: MissionEventOut; isLatest: boolean }) {
  const { label, color } = getTag(event);
  const message = cleanHtml(event.message);
  const detail = cleanHtml(event.detail);

  // A row with no message and no detail is just noise — skip it.
  if (!message && !detail) return null;

  return (
    <div
      className={cn(
        'animate-feed-in flex items-start gap-3 px-5 py-[7px] border-b border-[var(--border)]',
        isLatest && 'bg-[color-mix(in_srgb,var(--cyan)_5%,transparent)]',
      )}
    >
      <div
        className="mt-[7px] h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0">
        <span
          className="mr-2 text-[9.5px] font-semibold tracking-[0.5px] uppercase"
          style={{ color, fontFamily: 'var(--font-mono)' }}
        >
          {label}
        </span>
        {/* Rendered as TEXT, never raw HTML. Event messages carry scraped
            third-party job/company text — injecting it as HTML is a stored-XSS
            sink. cleanHtml strips any tags so the content stays inert. */}
        <span
          className="text-[13px] text-[var(--muted2)] italic leading-[1.65]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {message}
        </span>
        {detail && (
          <div className="mt-0.5 text-[11.5px] text-[var(--muted)] leading-relaxed border-l border-[var(--border-bright)] pl-2 ml-1">
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchCard({ match, isNew }: { match: ParsedMatch; isNew: boolean }) {
  const scoreColor =
    match.scoreNum >= 4.5 ? 'var(--green)'
    : match.scoreNum >= 4 ? 'var(--cyan)'
    : match.scoreNum >= 3.5 ? 'var(--amber)'
    : 'var(--muted2)';
  return (
    <div className="mission-match-card flex items-center gap-3 rounded-xl border border-[var(--border-bright)] bg-[var(--card)] p-3">
      {/* Dark glyph on a bright brand tint — same contrast move as the design's black-on-green. */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
        style={{ backgroundColor: match.color, color: 'var(--bg)' }}
      >
        {match.initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-[var(--text)]">{match.role}</p>
        <p className="truncate text-[11px] text-[var(--muted)]">{match.company}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-[10px] text-[var(--amber)]">★</span>
        <span className="text-[12px] font-bold tabular-nums" style={{ color: scoreColor, fontFamily: 'var(--font-mono)' }}>
          {match.score}
        </span>
        {isNew && (
          <span className="rounded-sm bg-[var(--cyan)] px-1 py-0.5 text-[8px] font-bold tracking-widest text-[var(--bg)]">NEW</span>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MissionFeed({ events, status, missionTitle }: MissionFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const prevCountRef = useRef(0);
  const [showJump, setShowJump] = useState(false);

  // Auto-scroll on new events
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = dist < 48;
    setShowJump(!pinnedRef.current);
  };

  useLayoutEffect(() => {
    const grew = events.length > prevCountRef.current;
    const first = prevCountRef.current === 0 && events.length > 0;
    prevCountRef.current = events.length;
    if (grew && pinnedRef.current) scrollToBottom(first ? 'auto' : 'smooth');
  }, [events.length]);

  // Extract match events
  const matches = useMemo(
    () => events.filter(e => e.event_type === 'star').map(parseMatch).filter(Boolean) as ParsedMatch[],
    [events],
  );

  const connecting = status === 'connecting';
  const running    = status === 'running';
  const done       = status === 'done';
  const failed     = status === 'failed';
  const latestId   = events.at(-1)?.id;

  const meta = statusMeta(status);
  const displayTitle = missionTitle ?? 'Job Search Agent';

  // Honest, event-driven pipeline state — no timers.
  const { stages, fillPct } = useMemo(
    () => computeStages(events, done, failed),
    [events, done, failed],
  );
  const activeStage = stages.find((s) => s.state === 'active');

  return (
    <div
      className="mission-console overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] shadow-[0_18px_80px_rgba(0,0,0,0.24)]"
      aria-busy={running || connecting}
    >

      {/* ── Header ── */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_96%,white_2%)] px-5 py-3">
        {meta.live ? (
          <PulsingDot />
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.tone }} />
        )}

        <span
          className="truncate text-[11px] text-[var(--muted2)] flex-1"
          style={{ fontFamily: 'var(--font-mono)', letterSpacing: '1px', textTransform: 'uppercase' }}
        >
          {displayTitle} · {meta.label}
        </span>

        {running && (
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <SpinIcon />
            <span
              className="text-[9.5px] font-semibold text-[var(--cyan)]"
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '1.4px' }}
            >
              SCANNING…
            </span>
          </div>
        )}
        {done && (
          <span
            className="ml-auto text-[9.5px] font-semibold text-[var(--green)]"
            style={{ fontFamily: 'var(--font-mono)', letterSpacing: '1.4px' }}
          >
            COMPLETE ✓
          </span>
        )}
        {failed && (
          <span
            className="ml-auto text-[9.5px] font-semibold text-[var(--red)]"
            style={{ fontFamily: 'var(--font-mono)', letterSpacing: '1.4px' }}
          >
            FAILED
          </span>
        )}
        <span
          className="ml-3 shrink-0 text-[11px] tabular-nums text-[var(--muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {events.length} events
        </span>
      </div>

      {/* ── Pipeline rail (honest, event-driven) ── */}
      <div
        className="border-b border-[var(--border)] px-5 py-3"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fillPct}
        aria-label={
          done
            ? 'Mission pipeline complete'
            : activeStage
              ? `Mission pipeline: ${activeStage.label} in progress`
              : 'Mission pipeline starting'
        }
      >
        <ol className="flex items-center gap-2">
          {stages.map((s, i) => (
            <li
              key={s.key}
              className="flex flex-1 items-center gap-2 last:flex-none"
              aria-current={s.state === 'active' ? 'step' : undefined}
            >
              <span className="flex shrink-0 items-center gap-1.5">
                <StageDot state={s.state} />
                <span
                  className={cn(
                    'hidden text-[10px] uppercase tracking-[0.8px] sm:inline',
                    s.state === 'pending'
                      ? 'text-[var(--subtle)]'
                      : s.state === 'active'
                        ? 'text-[var(--cyan)]'
                        : 'text-[var(--muted2)]',
                  )}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {s.label}
                </span>
              </span>
              {i < stages.length - 1 && (
                <span
                  className="h-px flex-1 rounded-full transition-colors duration-500"
                  style={{ background: s.state === 'done' ? 'var(--cyan)' : 'var(--border-bright)' }}
                />
              )}
            </li>
          ))}
        </ol>

        {/* Stage labels are hidden below sm; surface the active one as text so
            mobile users still know what the agent is doing right now. */}
        {activeStage && (
          <p
            className="mt-1.5 text-[10px] uppercase tracking-[0.8px] text-[var(--cyan)] sm:hidden"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {activeStage.label}…
          </p>
        )}

        {/* Thin fill bar — width is real completed-stage fraction; the shimmer
            is ambient "working" texture only, and stops under reduced-motion. */}
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--border-bright)_40%,transparent)]">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-700',
              // Red track on failure; brand gradient + shimmer only while live.
              failed
                ? 'bg-[var(--red)]'
                : 'bg-[linear-gradient(90deg,var(--cyan),var(--green),var(--cyan))]',
              !done && !failed && 'mission-progress-fill',
            )}
            style={{ width: `${fillPct}%`, backgroundSize: '200% 100%' }}
          />
        </div>
      </div>

      {/* ── Log stream ── */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-[420px] overflow-y-auto"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {connecting && events.length === 0 ? (
            <ConnectingPlaceholder />
          ) : events.length === 0 ? (
            <EmptyPlaceholder />
          ) : (
            <div className="flex flex-col pt-1 pb-2">
              {events.map((ev, i) => (
                <LogRow
                  key={ev.id ?? `${ev.created_at}-${i}`}
                  event={ev}
                  isLatest={ev.id === latestId && !done}
                />
              ))}
              {running && <BlinkingCursor />}
            </div>
          )}
        </div>

        {/* Fade out at bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-[linear-gradient(180deg,transparent,var(--surface))]" />

        {showJump && (
          <button
            type="button"
            onClick={() => { pinnedRef.current = true; setShowJump(false); scrollToBottom(); }}
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--border-bright)] bg-[var(--card)] px-3 py-1 text-[11px] font-medium text-[var(--muted2)] shadow-lg transition-colors hover:border-[var(--cyan)] hover:text-[var(--text)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            ↓ Jump to latest
          </button>
        )}
      </div>

      {/* ── Matches ── */}
      {matches.length > 0 && (
        <div className="border-t border-[var(--border)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span
              className="text-[10px] font-bold uppercase tracking-[1.6px] text-[var(--muted2)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Top matches surfaced
            </span>
            <span className="text-[11px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {matches.length} found
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {matches.slice(-6).reverse().map((match, i) => (
              <MatchCard
                key={`${match.company}-${match.role}-${i}`}
                match={match}
                isNew={i < 2 && !done}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Placeholder states ────────────────────────────────────────────────────────

const SEARCH_THOUGHTS = [
  'Scanning Greenhouse for AI Engineer roles...',
  'Reading job descriptions on Lever boards...',
  'Checking Ashby for remote-first openings...',
  'Searching Exa for senior ML positions...',
  'Scanning SmartRecruiters job boards...',
  'Reading 100 Exa semantic search results...',
  'Checking ATS feeds: Greenhouse, Lever, Ashby...',
  'Filtering roles by location and salary requirements...',
  'Verifying live job postings...',
  'Cross-referencing skills with job descriptions...',
  'Scoring roles by profile alignment...',
  'Ranking your best matches by composite score...',
];

function ConnectingPlaceholder() {
  // ponytail: one index, thought derives from it — no second state to sync.
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SEARCH_THOUGHTS.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 py-12">
      <div className="relative flex h-10 w-10 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--cyan)] opacity-20" />
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--cyan)_20%,transparent)] ring-1 ring-[var(--cyan)]/40">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--cyan)]" />
        </span>
      </div>
      <p
        className="text-[13px] text-[var(--muted2)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        Connecting to agent…
      </p>
      <p
        className="max-w-xs text-center text-[12px] italic text-[var(--muted)]"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {SEARCH_THOUGHTS[idx]}
        <span className="mission-cursor ml-1 inline-block h-[13px] w-[5px] translate-y-[2px] bg-[var(--cyan)]" />
      </p>
    </div>
  );
}

function EmptyPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 py-12 text-center">
      <p className="text-[13px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
        No events yet.
      </p>
    </div>
  );
}

export default MissionFeed;
