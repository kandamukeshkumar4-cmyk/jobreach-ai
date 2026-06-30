'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/format';
import type { EventType, MissionEventOut, MissionOut } from '@/lib/types';
import { statusMeta, type MissionStreamStatus } from '@/hooks/useMissionStream';

export interface MissionFeedProps {
  events: MissionEventOut[];
  status: MissionStreamStatus;
  mission?: MissionOut;
  missionTitle?: string;
}

// ── Text helpers ──────────────────────────────────────────────────────────────

function cleanHtml(value?: string): string {
  return (value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const reduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function fmtDuration(totalSec: number): string {
  const t = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// ── Tag config (for the raw log) ───────────────────────────────────────────────

interface TagSpec { label: string; color: string }

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
  const msg = (event.message ?? '').toLowerCase();
  if (/research/.test(msg))                                    return { label: 'RSRCH',  color: 'var(--violet)' };
  if (/exa|semantic/.test(msg))                                return { label: 'SEARCH', color: 'var(--amber)' };
  if (/greenhouse|lever|ashby|smartrecruiters|ats/.test(msg))  return { label: 'BOARD',  color: 'var(--cyan)' };
  if (/rss|remoteok|workable/.test(msg))                       return { label: 'BOARD',  color: 'var(--cyan)' };
  if (/filter|eliminat/.test(msg))                             return { label: 'FILTER', color: 'var(--violet)' };
  if (/verify|live|prune|dead|closed/.test(msg))               return { label: 'VERIFY', color: 'var(--green)' };
  if (/scor|rank|match|grade|priorit/.test(msg))               return { label: 'SCORE',  color: 'var(--violet)' };
  if (/profile|archetype|loaded/.test(msg))                    return { label: 'INIT',   color: 'var(--cyan)' };
  return { label: 'AGENT', color: 'var(--cyan)' };
}

// ── Pipeline stages (honest, event-driven — no timers) ─────────────────────────

type StageState = 'done' | 'active' | 'pending';

const PIPELINE: ReadonlyArray<{ key: string; label: string; test: RegExp }> = [
  { key: 'search', label: 'Search', test: /exa returned|semantic search|searching exa/ },
  { key: 'boards', label: 'Boards', test: /ats feeds returned|scanned [\d,]+ postings|greenhouse|lever|ashby|smartrecruiters/ },
  { key: 'filter', label: 'Filter', test: /filtered to|filtering/ },
  { key: 'verify', label: 'Verify', test: /verifying [\d,]+ postings|still live|verified live/ },
  { key: 'score',  label: 'Score',  test: /\/5\.0|scoring roles|ranking your|researching / },
];

interface StageInfo { key: string; label: string; state: StageState }

function computeStages(
  events: MissionEventOut[],
  done: boolean,
  failed: boolean,
): { stages: StageInfo[]; reachedIdx: number; fillPct: number } {
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
    else if (i === reachedIdx) state = failed ? 'pending' : 'active';
    else state = 'pending';
    return { key: stage.key, label: stage.label, state };
  });

  const fillPct = done
    ? 100
    : reachedIdx < 0
      ? 4
      : Math.round(((reachedIdx + 0.5) / PIPELINE.length) * 100);

  return { stages, reachedIdx, fillPct };
}

// ── Source board derivation (answers "what sites are being opened") ────────────

interface SourceDef { key: string; label: string; color: string }
const SOURCE_DEFS: SourceDef[] = [
  { key: 'exa',             label: 'Exa',             color: 'var(--amber)' },
  { key: 'greenhouse',      label: 'Greenhouse',      color: 'var(--cyan)' },
  { key: 'lever',           label: 'Lever',           color: 'var(--cyan)' },
  { key: 'ashby',           label: 'Ashby',           color: 'var(--cyan)' },
  { key: 'smartrecruiters', label: 'SmartRecruiters', color: 'var(--cyan)' },
  { key: 'workable',        label: 'Workable',        color: 'var(--blue)' },
  { key: 'remoteok',        label: 'RemoteOK',        color: 'var(--violet)' },
  { key: 'rss',             label: 'RSS',             color: 'var(--green)' },
];
const SOURCE_BY_KEY = Object.fromEntries(SOURCE_DEFS.map((d) => [d.key, d]));

type SourceStatus = 'pending' | 'scanning' | 'done';
interface SourceRow { key: string; label: string; color: string; status: SourceStatus; count?: number }

function deriveSources(events: MissionEventOut[], missionSources: string[]): SourceRow[] {
  const state = new Map<string, { status: SourceStatus; count?: number }>();
  const seed = (k: string) => {
    if (SOURCE_BY_KEY[k] && !state.has(k)) state.set(k, { status: 'pending' });
  };
  missionSources.forEach((s) => seed(s.toLowerCase().trim()));

  const set = (k: string, status: SourceStatus, count?: number) => {
    if (!SOURCE_BY_KEY[k]) return;
    const prev = state.get(k);
    // Never regress 'done' back to 'scanning'.
    if (prev?.status === 'done' && status !== 'done') return;
    state.set(k, { status, count: count ?? prev?.count });
  };

  for (const e of events) {
    const m = cleanHtml(e.message).toLowerCase();
    const d = cleanHtml(e.detail).toLowerCase();

    if (/scanning exa/.test(m)) set('exa', 'scanning');
    if (/scanning workable/.test(m)) set('workable', 'scanning');
    if (/scanning remoteok/.test(m)) set('remoteok', 'scanning');
    if (/scanning rss/.test(m)) set('rss', 'scanning');
    const ats = m.match(/scanning ats feeds:\s*(.+?)(?:\.\.\.|…|$)/);
    if (ats) ats[1].split(',').forEach((name) => set(name.trim(), 'scanning'));

    let r: RegExpMatchArray | null;
    if ((r = m.match(/exa returned ([\d,]+)/)))        set('exa', 'done', toNum(r[1]));
    if ((r = m.match(/workable returned ([\d,]+)/)))   set('workable', 'done', toNum(r[1]));
    if ((r = m.match(/remoteok returned ([\d,]+)/)))   set('remoteok', 'done', toNum(r[1]));
    if ((r = m.match(/rss feeds returned ([\d,]+)/)))  set('rss', 'done', toNum(r[1]));
    if (/ats feeds returned/.test(m)) {
      const src = d || m;
      for (const mm of src.matchAll(/(greenhouse|lever|ashby|smartrecruiters):\s*([\d,]+)/g)) {
        set(mm[1], 'done', toNum(mm[2]));
      }
    }
  }

  return SOURCE_DEFS.filter((d) => state.has(d.key)).map((d) => ({
    ...d,
    status: state.get(d.key)!.status,
    count: state.get(d.key)!.count,
  }));
}

function toNum(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10) || 0;
}

// ── Scoring tracker derivation (answers "which role is open right now") ─────────

interface ScoredRow { company: string; role: string; score: number; grade: string }
interface ScoringInfo {
  total: number;
  count: number;
  rows: ScoredRow[];
  current: { company: string; role: string } | null;
  startMs: number | null;
}

function metaOf(e: MissionEventOut): Record<string, unknown> {
  const m = (e as unknown as { metadata?: unknown; meta?: unknown }).metadata ??
    (e as unknown as { meta?: unknown }).meta;
  return m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
}

function deriveScoring(events: MissionEventOut[]): ScoringInfo {
  let total = 0;
  let count = 0;
  let startMs: number | null = null;
  const rows: ScoredRow[] = [];
  let current: ScoringInfo['current'] = null;

  for (const e of events) {
    const meta = metaOf(e);
    const kind = meta.kind;
    if (kind !== 'score' && kind !== 'research') continue;
    if (startMs == null && e.created_at) startMs = new Date(e.created_at).getTime();

    if (kind === 'research') {
      current = { company: String(meta.company ?? ''), role: String(meta.role ?? '') };
    } else {
      total = Math.max(total, Number(meta.total) || 0);
      count = Math.max(count, Number(meta.index) || rows.length + 1);
      if (meta.company || meta.role) {
        rows.push({
          company: String(meta.company ?? ''),
          role: String(meta.role ?? ''),
          score: Number(meta.score) || 0,
          grade: String(meta.grade ?? ''),
        });
      }
    }
  }
  return { total, count, rows, current, startMs };
}

// ── Match card parser (for the surfaced-matches grid) ──────────────────────────

interface ParsedMatch {
  role: string; company: string; score: string; scoreNum: number; initial: string; color: string;
}
const AVATAR_TINTS = ['var(--cyan)', 'var(--blue)', 'var(--violet)'];
function hashColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_TINTS.length;
  return AVATAR_TINTS[h];
}
function parseMatch(event: MissionEventOut): ParsedMatch | null {
  const raw = cleanHtml(event.message).replace(/^[a-f]?\s*match\s*[:]\s*/i, '').trim();
  const m = raw.match(/^(.+)\s+(?:at|@)\s+(.+?)\s*[-–—]+\s*([\d.]+)/i);
  if (!m) return null;
  const role = m[1].trim();
  const company = m[2].trim();
  const n = parseFloat(m[3]);
  if (!role || !company || Number.isNaN(n)) return null;
  const scoreNum = Math.min(5, Math.max(0, n));
  return {
    role, company, score: scoreNum.toFixed(1), scoreNum,
    initial: (company.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase(),
    color: hashColor(company),
  };
}

function scoreColorOf(n: number): string {
  return n >= 4.5 ? 'var(--green)'
    : n >= 4 ? 'var(--cyan)'
    : n >= 3.5 ? 'var(--amber)'
    : 'var(--muted2)';
}

// ── Small hooks ────────────────────────────────────────────────────────────────

/**
 * Animates an integer toward `target` for satisfying, alive-feeling counters.
 * Stepped with setInterval (not rAF) so it always lands on the true value even
 * when rAF is throttled — background tabs, reduced power mode, headless renders.
 */
function useCountUp(target?: number): number {
  const [val, setVal] = useState(target ?? 0);
  const fromRef = useRef(target ?? 0);
  useEffect(() => {
    if (target == null) return;
    const from = fromRef.current;
    if (from === target) return;
    if (reduceMotion()) { setVal(target); fromRef.current = target; return; }
    const steps = 24;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      const p = i / steps;
      const eased = 1 - Math.pow(1 - p, 3);
      if (i >= steps) {
        setVal(target);
        fromRef.current = target;
        clearInterval(id);
      } else {
        setVal(Math.round(from + (target - from) * eased));
      }
    }, 25);
    return () => clearInterval(id);
  }, [target]);
  return val;
}

/** Rotates through phase-true descriptions so sparse phases still show motion. */
const PHASE_HINTS: Record<string, string[]> = {
  search: ['Querying provider APIs…', 'Reading job descriptions…', 'Collecting postings…'],
  boards: ['Pulling open roles from ATS boards…', 'Reading each posting…', 'Collecting listings…'],
  filter: ['Matching roles to your profile…', 'Dropping off-target postings…', 'Applying salary & location rules…'],
  verify: ['Opening each posting…', 'Checking the link still resolves…', 'Pruning dead or closed roles…'],
  score:  ['Reading company funding & news…', 'Checking culture & reviews…', 'Grading fit across 6 dimensions…'],
};
function useRotatingHint(phaseKey: string | undefined, live: boolean): string {
  const hints = (phaseKey && PHASE_HINTS[phaseKey]) || PHASE_HINTS.search;
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
    if (!live || reduceMotion()) return;
    const t = setInterval(() => setIdx((i) => i + 1), 2400);
    return () => clearInterval(t);
  }, [phaseKey, live]);
  return hints[idx % hints.length];
}

// ── Presentational atoms ───────────────────────────────────────────────────────

function PulsingDot({ color = 'var(--cyan)' }: { color?: string }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ backgroundColor: color }} />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
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

// ── Hero: the anti-"stuck" anchor (always-ticking clock + ETA + progress) ───────

function Hero({
  meta, fillPct, failed, done, elapsedSec, etaSec, eventCount,
}: {
  meta: ReturnType<typeof statusMeta>;
  fillPct: number;
  failed: boolean;
  done: boolean;
  elapsedSec: number;
  etaSec: number | null;
  eventCount: number;
}) {
  return (
    <div className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,white_3%)] px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Live status */}
        <span className="flex items-center gap-2.5">
          {meta.live
            ? <PulsingDot color={meta.tone} />
            : <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.tone }} />}
          <span
            className="text-[13px] font-semibold tracking-[1.6px] uppercase"
            style={{ color: meta.tone, fontFamily: 'var(--font-mono)' }}
          >
            {done ? 'Complete' : failed ? 'Failed' : meta.label}
          </span>
        </span>

        {/* Clock + ETA — the clock ticks every second, so the agent is visibly alive */}
        <span className="ml-auto flex items-center gap-x-4 gap-y-1 flex-wrap">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[9px] uppercase tracking-[1.4px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
              elapsed
            </span>
            <span className="text-[15px] font-semibold tabular-nums text-[var(--text)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {fmtDuration(elapsedSec)}
            </span>
          </span>
          {etaSec != null && !done && !failed && (
            <span className="flex items-baseline gap-1.5">
              <span className="text-[9px] uppercase tracking-[1.4px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                ~left
              </span>
              <span className="text-[15px] font-semibold tabular-nums text-[var(--cyan)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {fmtDuration(etaSec)}
              </span>
            </span>
          )}
          <span className="text-[11px] tabular-nums text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {eventCount} events
          </span>
        </span>
      </div>

      {/* Thin progress — real completed-stage fraction; shimmer is ambient texture */}
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--border-bright)_40%,transparent)]">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700',
            failed
              ? 'bg-[var(--red)]'
              : 'bg-[linear-gradient(90deg,var(--cyan),var(--green),var(--cyan))]',
            !done && !failed && 'mission-progress-fill',
          )}
          style={{ width: `${fillPct}%`, backgroundSize: '200% 100%' }}
        />
      </div>
    </div>
  );
}

// ── Now line: the single prominent "what's happening right now" ────────────────

function NowLine({ action, hint, live }: { action: string; hint: string; live: boolean }) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-3.5">
      <span className="mt-1.5">
        {live ? <PulsingDot /> : <span className="block h-2 w-2 rounded-full bg-[var(--muted)]" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium tracking-[-0.2px] text-[var(--text)]">
          {action}
        </p>
        {live && (
          <p className="mt-0.5 text-[12px] italic text-[var(--muted)]" style={{ fontFamily: 'var(--font-sans)' }}>
            {hint}
            <span className="mission-cursor ml-1 inline-block h-[12px] w-[5px] translate-y-[2px] bg-[var(--cyan)]" />
          </p>
        )}
      </div>
    </div>
  );
}

// ── Phase stepper ──────────────────────────────────────────────────────────────

function PhaseStepper({ stages, done, activeKey }: { stages: StageInfo[]; done: boolean; activeKey?: string }) {
  return (
    <div
      className="border-b border-[var(--border)] px-5 py-3"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={stages.length}
      aria-valuenow={stages.filter((s) => s.state === 'done').length}
      aria-label={done ? 'Pipeline complete' : activeKey ? `Pipeline: ${activeKey} in progress` : 'Pipeline starting'}
    >
      <ol className="flex items-center gap-2">
        {stages.map((s, i) => (
          <li key={s.key} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={s.state === 'active' ? 'step' : undefined}>
            <span className="flex shrink-0 items-center gap-1.5">
              <StageDot state={s.state} />
              <span
                className={cn(
                  'hidden text-[10px] uppercase tracking-[0.8px] sm:inline',
                  s.state === 'pending' ? 'text-[var(--subtle)]' : s.state === 'active' ? 'text-[var(--cyan)]' : 'text-[var(--muted2)]',
                )}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {s.label}
              </span>
            </span>
            {i < stages.length - 1 && (
              <span className="h-px flex-1 rounded-full transition-colors duration-500" style={{ background: s.state === 'done' ? 'var(--cyan)' : 'var(--border-bright)' }} />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Source board ───────────────────────────────────────────────────────────────

function SourceBoard({ sources }: { sources: SourceRow[] }) {
  const total = sources.reduce((acc, s) => acc + (s.count ?? 0), 0);
  return (
    <div className="border-b border-[var(--border)] px-5 py-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[1.6px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
          Sources scanned
        </span>
        <span className="text-[11px] tabular-nums text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {total.toLocaleString('en-US')} postings
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {sources.map((s) => (
          <div
            key={s.key}
            className={cn(
              'flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5',
              s.status === 'done'
                ? 'border-[var(--border-bright)] bg-[var(--card)]'
                : 'border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_60%,transparent)]',
            )}
          >
            {s.status === 'done' ? (
              <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" fill="none" stroke={s.color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 6.5 5 9l4.5-5.5" />
              </svg>
            ) : s.status === 'scanning' ? (
              <PulsingDot color={s.color} />
            ) : (
              <span className="h-2 w-2 shrink-0 rounded-full border border-[var(--border-bright)]" />
            )}
            <span className={cn('truncate text-[11px]', s.status === 'pending' ? 'text-[var(--subtle)]' : 'text-[var(--muted2)]')}>
              {s.label}
            </span>
            {s.status === 'done' && (
              <span className="ml-auto text-[11px] font-semibold tabular-nums" style={{ color: s.color, fontFamily: 'var(--font-mono)' }}>
                {s.count?.toLocaleString('en-US') ?? '0'}
              </span>
            )}
            {s.status === 'scanning' && (
              <span className="ml-auto text-[9px] uppercase tracking-[1px] text-[var(--cyan)]" style={{ fontFamily: 'var(--font-mono)' }}>
                scanning
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Scoring tracker (the centerpiece — real n/total, kills the "stuck" feeling) ─

function ScoringTracker({ scoring, live }: { scoring: ScoringInfo; live: boolean }) {
  const { total, count, rows, current } = scoring;
  const pct = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0;
  const recent = rows.slice(-5).reverse();
  const active = live && count < total;

  return (
    <div className="border-b border-[var(--border)] px-5 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[1.6px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
          Deep-scoring roles
        </span>
        <span className="text-[12px] font-semibold tabular-nums text-[var(--text)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {count} <span className="text-[var(--muted)]">/ {total}</span>
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--border-bright)_40%,transparent)]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--violet),var(--cyan))] transition-[width] duration-500"
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>

      {active && current && (current.company || current.role) && (
        <div className="mt-2.5 flex items-center gap-2 text-[12px]">
          <PulsingDot color="var(--violet)" />
          <span className="text-[var(--muted2)]">
            Researching <span className="text-[var(--text)]">{current.company}</span>
            {current.role ? <span className="text-[var(--muted)]"> — {current.role}</span> : null}
          </span>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1">
          {recent.map((row, i) => {
            const strong = row.grade === 'A' || row.grade === 'B';
            return (
              <div key={`${row.company}-${row.role}-${i}`} className="flex items-center gap-2 text-[12px]">
                <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" fill="none" stroke={scoreColorOf(row.score)} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.5 5 9l4.5-5.5" />
                </svg>
                <span className="min-w-0 flex-1 truncate text-[var(--muted2)]">
                  <span className="text-[var(--text)]">{row.role || 'Role'}</span>
                  <span className="text-[var(--muted)]"> @ {row.company || '—'}</span>
                </span>
                {strong && <span className="text-[9px] text-[var(--amber)]">★</span>}
                <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: scoreColorOf(row.score), fontFamily: 'var(--font-mono)' }}>
                  {row.score.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Raw activity log ───────────────────────────────────────────────────────────

function LogRow({ event, isLatest }: { event: MissionEventOut; isLatest: boolean }) {
  const { label, color } = getTag(event);
  const message = cleanHtml(event.message);
  const detail = cleanHtml(event.detail);
  if (!message && !detail) return null;

  return (
    <div className={cn('animate-feed-in flex items-start gap-3 px-5 py-[6px] border-b border-[var(--border)]', isLatest && 'bg-[color-mix(in_srgb,var(--cyan)_5%,transparent)]')}>
      <div className="mt-[7px] h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <span className="mr-2 text-[9.5px] font-semibold tracking-[0.5px] uppercase" style={{ color, fontFamily: 'var(--font-mono)' }}>
          {label}
        </span>
        {/* Rendered as TEXT, never raw HTML — event messages carry scraped
            third-party text; injecting as HTML is a stored-XSS sink. */}
        <span className="text-[12.5px] text-[var(--muted2)] leading-[1.6]" style={{ fontFamily: 'var(--font-sans)' }}>
          {message}
        </span>
        {detail && (
          <div className="mt-0.5 text-[11px] text-[var(--muted)] leading-relaxed border-l border-[var(--border-bright)] pl-2 ml-1">
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchCard({ match, isNew }: { match: ParsedMatch; isNew: boolean }) {
  const scoreColor = scoreColorOf(match.scoreNum);
  return (
    <div className="mission-match-card flex items-center gap-3 rounded-xl border border-[var(--border-bright)] bg-[var(--card)] p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold" style={{ backgroundColor: match.color, color: 'var(--bg)' }}>
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
        {isNew && <span className="rounded-sm bg-[var(--cyan)] px-1 py-0.5 text-[8px] font-bold tracking-widest text-[var(--bg)]">NEW</span>}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function MissionFeed({ events, status, mission, missionTitle }: MissionFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const prevCountRef = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const meta = statusMeta(status);
  const connecting = status === 'connecting';
  const running = status === 'running';
  const done = status === 'done';
  const failed = status === 'failed';
  const live = meta.live;

  // Single per-second tick drives both the elapsed clock and the live ETA.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  // ── Derivations ──
  const { stages, reachedIdx, fillPct } = useMemo(() => computeStages(events, done, failed), [events, done, failed]);
  const activeStage = stages.find((s) => s.state === 'active');
  const phaseKey = activeStage?.key ?? (reachedIdx >= 0 ? PIPELINE[reachedIdx].key : 'search');

  // `sources` isn't in the typed MissionOut contract — probe defensively.
  const rawSources = (mission as unknown as { sources?: unknown } | undefined)?.sources;
  const missionSources = useMemo<string[]>(() => {
    if (Array.isArray(rawSources)) return rawSources.map((s) => String(s));
    if (typeof rawSources === 'string') return rawSources.split(',');
    return [];
  }, [rawSources]);
  const sources = useMemo(() => deriveSources(events, missionSources), [events, missionSources]);
  const scoring = useMemo(() => deriveScoring(events), [events]);
  const matches = useMemo(
    () => events.filter((e) => e.event_type === 'star').map(parseMatch).filter(Boolean) as ParsedMatch[],
    [events],
  );

  // Current action = latest "run" event (during scoring this is "Researching …").
  const currentAction = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].event_type === 'run') return cleanHtml(events[i].message);
    }
    const last = events.at(-1);
    return last ? cleanHtml(last.message) : 'Starting the agent…';
  }, [events]);
  const hint = useRotatingHint(phaseKey, live);

  // Elapsed + ETA. Elapsed is real (from started_at). ETA is derived from the
  // real scoring rate (count/total over scoring-elapsed) — the dominant phase.
  const startMs = useMemo(() => {
    if (mission?.started_at) return new Date(mission.started_at).getTime();
    if (events[0]?.created_at) return new Date(events[0].created_at).getTime();
    return null;
  }, [mission?.started_at, events]);
  const endMs = mission?.completed_at ? new Date(mission.completed_at).getTime() : null;
  const refMs = !live && endMs ? endMs : nowMs;
  const elapsedSec = startMs != null ? Math.max(0, (refMs - startMs) / 1000) : 0;

  const etaSec = useMemo(() => {
    if (!live || scoring.total <= 0 || scoring.count <= 0 || scoring.startMs == null) return null;
    if (scoring.count >= scoring.total) return null;
    const perItem = (nowMs - scoring.startMs) / scoring.count;
    const remaining = (perItem * (scoring.total - scoring.count)) / 1000;
    return Number.isFinite(remaining) && remaining > 0 ? Math.min(remaining, 60 * 30) : null;
  }, [live, scoring.total, scoring.count, scoring.startMs, nowMs]);

  // Animated headline counts.
  const scanned = useCountUp(mission?.total_scanned ?? (sources.length ? sources.reduce((a, s) => a + (s.count ?? 0), 0) : undefined));
  const filtered = useCountUp(mission?.total_filtered ?? undefined);
  const matchCount = useCountUp(mission?.total_matches ?? (matches.length || undefined));

  // ── Auto-scroll the raw log ──
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
    if (!logOpen) return;
    const grew = events.length > prevCountRef.current;
    const first = prevCountRef.current === 0 && events.length > 0;
    prevCountRef.current = events.length;
    if (grew && pinnedRef.current) scrollToBottom(first ? 'auto' : 'smooth');
  }, [events.length, logOpen]);

  const latestId = events.at(-1)?.id;
  const showScoring = scoring.total > 0 || (phaseKey === 'score' && reachedIdx >= 4);
  const displayTitle = missionTitle ?? 'Job Search Agent';

  return (
    <div className="mission-console overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] shadow-[0_18px_80px_rgba(0,0,0,0.24)]" aria-busy={running || connecting}>
      {/* Title strip */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-2.5">
        <span className="truncate text-[11px] text-[var(--muted)] flex-1" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '1px', textTransform: 'uppercase' }}>
          {displayTitle}
        </span>
      </div>

      <Hero meta={meta} fillPct={fillPct} failed={failed} done={done} elapsedSec={elapsedSec} etaSec={etaSec} eventCount={events.length} />

      {connecting && events.length === 0 ? (
        <ConnectingPlaceholder />
      ) : (
        <>
          <NowLine
            action={done ? 'Mission complete — your matches are ready.' : failed ? 'Mission stopped before finishing.' : currentAction}
            hint={hint}
            live={live}
          />

          <PhaseStepper stages={stages} done={done} activeKey={activeStage?.label} />

          {sources.length > 0 && <SourceBoard sources={sources} />}

          {showScoring && <ScoringTracker scoring={scoring} live={live} />}

          {/* Headline counts — count up as they land */}
          <div className="grid grid-cols-3 divide-x divide-[var(--border)] border-b border-[var(--border)]">
            <Stat label="Scanned" value={scanned} />
            <Stat label="Filtered" value={filtered} />
            <Stat label="Matches" value={matchCount} accent />
          </div>

          {/* Collapsible raw log — structured views carry the story; this is the detail */}
          <div>
            <button
              type="button"
              onClick={() => setLogOpen((o) => !o)}
              className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-[var(--card)]"
            >
              <svg viewBox="0 0 12 12" className={cn('h-3 w-3 text-[var(--muted)] transition-transform', logOpen && 'rotate-90')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 2.5 8 6l-4 3.5" />
              </svg>
              <span className="text-[10px] font-bold uppercase tracking-[1.6px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
                Full activity log
              </span>
              <span className="ml-auto text-[11px] tabular-nums text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {events.length}
              </span>
            </button>

            {logOpen && (
              <div className="relative border-t border-[var(--border)]">
                <div ref={scrollRef} onScroll={handleScroll} className="h-[300px] overflow-y-auto" role="log" aria-live="polite" aria-relevant="additions">
                  {events.length === 0 ? (
                    <EmptyPlaceholder />
                  ) : (
                    <div className="flex flex-col pt-1 pb-2">
                      {events.map((ev, i) => (
                        <LogRow key={ev.id ?? `${ev.created_at}-${i}`} event={ev} isLatest={ev.id === latestId && !done} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-[linear-gradient(180deg,transparent,var(--surface))]" />
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
            )}
          </div>
        </>
      )}

      {/* Surfaced matches */}
      {matches.length > 0 && (
        <div className="border-t border-[var(--border)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[1.6px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
              Top matches surfaced
            </span>
            <span className="text-[11px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {matches.length} found
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {matches.slice(-6).reverse().map((match, i) => (
              <MatchCard key={`${match.company}-${match.role}-${i}`} match={match} isNew={i < 2 && !done} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-3.5">
      <span className="text-[9px] font-medium uppercase tracking-[1.4px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
      <span
        className="text-xl font-semibold tabular-nums tracking-[-0.5px]"
        style={{ color: accent ? 'var(--cyan)' : 'var(--text)', fontFamily: 'var(--font-mono)' }}
      >
        {value.toLocaleString('en-US')}
      </span>
    </div>
  );
}

// ── Placeholders ───────────────────────────────────────────────────────────────

const SEARCH_THOUGHTS = [
  'Waking the agent…',
  'Loading your profile & archetypes…',
  'Lining up job sources…',
  'Preparing the search…',
];

function ConnectingPlaceholder() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (reduceMotion()) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % SEARCH_THOUGHTS.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-14">
      <div className="relative flex h-10 w-10 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--cyan)] opacity-20" />
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--cyan)_20%,transparent)] ring-1 ring-[var(--cyan)]/40">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--cyan)]" />
        </span>
      </div>
      <p className="text-[13px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
        Connecting to agent…
      </p>
      <p className="max-w-xs text-center text-[12px] italic text-[var(--muted)]" style={{ fontFamily: 'var(--font-sans)' }}>
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
