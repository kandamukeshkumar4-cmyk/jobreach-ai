'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';
import type { EventType, MissionEventOut, MissionOut } from '@/lib/types';
import { statusMeta, type MissionStreamStatus } from '@/hooks/useMissionStream';

export interface MissionFeedProps {
  events: MissionEventOut[];
  status: MissionStreamStatus;
  mission?: MissionOut;
  missionTitle?: string;
  lastEventAt?: number | null;
  onRefreshStall?: () => void;
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

function fmtAgo(sec: number): string {
  if (sec < 2) return 'just now';
  if (sec < 60) return `${Math.floor(sec)}s ago`;
  const m = Math.floor(sec / 60);
  return `${m}m ${Math.floor(sec % 60)}s ago`;
}

function metaOf(e: MissionEventOut): Record<string, unknown> {
  const m = (e as unknown as { metadata?: unknown; meta?: unknown }).metadata ??
    (e as unknown as { meta?: unknown }).meta;
  return m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function toNum(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10) || 0;
}

// ── Tag config (raw log only) ─────────────────────────────────────────────────

interface TagSpec { label: string; color: string }
const TYPE_TAG: Partial<Record<EventType, TagSpec>> = {
  ok: { label: 'OK', color: 'var(--green)' },
  star: { label: 'MATCH', color: 'var(--green)' },
  info: { label: 'INFO', color: 'var(--muted2)' },
  warn: { label: 'WARN', color: 'var(--amber)' },
  error: { label: 'ERR', color: 'var(--red)' },
};
function getTag(event: MissionEventOut): TagSpec {
  const typeTag = TYPE_TAG[event.event_type];
  if (typeTag) return typeTag;
  const msg = (event.message ?? '').toLowerCase();
  if (/research|still scoring/.test(msg)) return { label: 'RSRCH', color: 'var(--violet)' };
  if (/exa|semantic/.test(msg)) return { label: 'SEARCH', color: 'var(--amber)' };
  if (/greenhouse|lever|ashby|smartrecruiters|ats|workable|remoteok|rss/.test(msg)) return { label: 'BOARD', color: 'var(--cyan)' };
  if (/filter|eliminat|priorit/.test(msg)) return { label: 'FILTER', color: 'var(--violet)' };
  if (/verify|live|prune|dead|closed/.test(msg)) return { label: 'VERIFY', color: 'var(--green)' };
  if (/scor|rank|match|grade/.test(msg)) return { label: 'SCORE', color: 'var(--violet)' };
  return { label: 'AGENT', color: 'var(--cyan)' };
}

// ── Pipeline stages ───────────────────────────────────────────────────────────

type StageState = 'done' | 'active' | 'pending';
const PIPELINE: ReadonlyArray<{ key: string; label: string; test: RegExp }> = [
  { key: 'search', label: 'Search', test: /exa returned|semantic search|searching exa|scanned [\d,]+ postings/ },
  { key: 'boards', label: 'Boards', test: /ats feeds returned|greenhouse|lever|ashby|smartrecruiters|workable returned|remoteok returned|rss feeds returned/ },
  { key: 'filter', label: 'Filter', test: /filtered to|filtering|prioritizing top/ },
  { key: 'verify', label: 'Verify', test: /verifying [\d,]+ postings|verified live|pruned/ },
  { key: 'score', label: 'Score', test: /\/5\.0|scoring roles|deep-researching|researching |still scoring/ },
];
const STAGE_INDEX: Record<string, number> = { init: -1, search: 0, boards: 1, filter: 2, verify: 3, score: 4, complete: 5 };
interface StageInfo { key: string; label: string; state: StageState }

function computeStages(events: MissionEventOut[], done: boolean, failed: boolean) {
  let metaIdx = -1, regexIdx = -1;
  const haystacks = events.map((e) => `${cleanHtml(e.message)} ${cleanHtml(e.detail)}`.toLowerCase());
  for (let i = 0; i < events.length; i++) {
    const stage = String(metaOf(events[i]).stage ?? '');
    if (STAGE_INDEX[stage] != null) metaIdx = Math.max(metaIdx, STAGE_INDEX[stage]);
    PIPELINE.forEach((s, si) => { if (s.test.test(haystacks[i])) regexIdx = Math.max(regexIdx, si); });
  }
  const reachedIdx = Math.max(metaIdx, regexIdx);
  const completeIdx = events.some((e) => String(metaOf(e).stage ?? '') === 'complete') ? PIPELINE.length : reachedIdx;
  const stages: StageInfo[] = PIPELINE.map((stage, i) => {
    let state: StageState;
    if (done || completeIdx >= PIPELINE.length) state = 'done';
    else if (i < reachedIdx) state = 'done';
    else if (i === reachedIdx) state = failed ? 'pending' : 'active';
    else state = 'pending';
    return { key: stage.key, label: stage.label, state };
  });
  const fillPct = done || completeIdx >= PIPELINE.length ? 100 : reachedIdx < 0 ? 4 : Math.round(((reachedIdx + 0.5) / PIPELINE.length) * 100);
  return { stages, reachedIdx, fillPct };
}

// ── Counters ──────────────────────────────────────────────────────────────────

interface Counters {
  scanned?: number; filtered?: number; verified?: number; pruned?: number; queued?: number; scored?: number; strong?: number;
}
function deriveCounters(events: MissionEventOut[], mission: MissionOut | undefined, scoredFromTracker: number): Counters {
  const c: Counters = { scanned: mission?.total_scanned ?? undefined, filtered: mission?.total_filtered ?? undefined };
  let strongFromEvents = 0;
  for (const e of events) {
    const m = metaOf(e);
    const scanned = num(m.scanned) ?? num(m.total_scanned); if (scanned != null) c.scanned = scanned;
    const filtered = num(m.filtered); if (filtered != null) c.filtered = filtered;
    const verified = num(m.verified); if (verified != null) c.verified = verified;
    const pruned = num(m.pruned) ?? num(m.dead_pruned); if (pruned != null) c.pruned = pruned;
    const queued = num(m.queued); if (queued != null) c.queued = queued;
    const scored = num(m.scored) ?? num(m.total_scored); if (scored != null) c.scored = scored;
    const strong = num(m.strong_matches); if (strong != null) c.strong = strong;
    if (e.event_type === 'star') {
      const grade = String(m.grade ?? '').toUpperCase();
      if (grade === 'A' || grade === 'B') strongFromEvents += 1;
    }
  }
  if (c.scored == null && scoredFromTracker > 0) c.scored = scoredFromTracker;
  if (c.strong == null) c.strong = strongFromEvents;
  return c;
}

// ── Sources ───────────────────────────────────────────────────────────────────

interface SourceDef { key: string; label: string; color: string }
const SOURCE_DEFS: SourceDef[] = [
  { key: 'exa', label: 'Exa', color: 'var(--amber)' },
  { key: 'greenhouse', label: 'Greenhouse', color: 'var(--cyan)' },
  { key: 'lever', label: 'Lever', color: 'var(--cyan)' },
  { key: 'ashby', label: 'Ashby', color: 'var(--cyan)' },
  { key: 'smartrecruiters', label: 'SmartRecruiters', color: 'var(--cyan)' },
  { key: 'workable', label: 'Workable', color: 'var(--blue)' },
  { key: 'remoteok', label: 'RemoteOK', color: 'var(--violet)' },
  { key: 'rss', label: 'RSS', color: 'var(--green)' },
];
const SOURCE_BY_KEY = Object.fromEntries(SOURCE_DEFS.map((d) => [d.key, d]));
type SourceStatus = 'pending' | 'scanning' | 'done';
interface SourceRow { key: string; label: string; color: string; status: SourceStatus; count?: number }

function deriveSources(events: MissionEventOut[], missionSources: string[]): SourceRow[] {
  const state = new Map<string, { status: SourceStatus; count?: number }>();
  const seed = (k: string) => { if (SOURCE_BY_KEY[k] && !state.has(k)) state.set(k, { status: 'pending' }); };
  missionSources.forEach((s) => seed(s.toLowerCase().trim()));
  const set = (k: string, status: SourceStatus, count?: number) => {
    if (!SOURCE_BY_KEY[k]) return;
    const prev = state.get(k);
    if (prev?.status === 'done' && status !== 'done') return;
    state.set(k, { status, count: count ?? prev?.count });
  };
  for (const e of events) {
    const m = cleanHtml(e.message).toLowerCase();
    const d = cleanHtml(e.detail).toLowerCase();
    const meta = metaOf(e);
    const provider = String(meta.provider ?? meta.source ?? '').toLowerCase();
    if (provider) {
      const count = num(meta.count);
      if (count != null) set(provider, 'done', count);
      else if (/scanning|run/.test(e.event_type)) set(provider, 'scanning');
    }
    if (/scanning exa/.test(m)) set('exa', 'scanning');
    if (/scanning workable/.test(m)) set('workable', 'scanning');
    if (/scanning remoteok/.test(m)) set('remoteok', 'scanning');
    if (/scanning rss/.test(m)) set('rss', 'scanning');
    const ats = m.match(/scanning ats feeds:\s*(.+?)(?:\.\.\.|…|$)/);
    if (ats) ats[1].split(',').forEach((name) => set(name.trim(), 'scanning'));
    let r: RegExpMatchArray | null;
    if ((r = m.match(/exa returned ([\d,]+)/))) set('exa', 'done', toNum(r[1]));
    if ((r = m.match(/workable returned ([\d,]+)/))) set('workable', 'done', toNum(r[1]));
    if ((r = m.match(/remoteok returned ([\d,]+)/))) set('remoteok', 'done', toNum(r[1]));
    if ((r = m.match(/rss feeds returned ([\d,]+)/))) set('rss', 'done', toNum(r[1]));
    if (/ats feeds returned/.test(m)) {
      const src = d || m;
      for (const mm of src.matchAll(/(greenhouse|lever|ashby|smartrecruiters):\s*([\d,]+)/g)) set(mm[1], 'done', toNum(mm[2]));
    }
  }
  return SOURCE_DEFS.filter((d) => state.has(d.key)).map((d) => ({ ...d, status: state.get(d.key)!.status, count: state.get(d.key)!.count }));
}

// ── Scoring ───────────────────────────────────────────────────────────────────

interface ScoredRow { company: string; role: string; score: number; grade: string }
interface ScoringInfo { total: number; count: number; rows: ScoredRow[]; current: { company: string; role: string } | null; startMs: number | null; etaSeconds: number | null }
function deriveScoring(events: MissionEventOut[]): ScoringInfo {
  let total = 0, count = 0, startMs: number | null = null, etaSeconds: number | null = null;
  const rows: ScoredRow[] = [];
  let current: ScoringInfo['current'] = null;
  for (const e of events) {
    const meta = metaOf(e);
    const kind = meta.kind;
    if (kind !== 'score' && kind !== 'research' && kind !== 'heartbeat') continue;
    if (startMs == null && e.created_at) startMs = new Date(e.created_at).getTime();
    if (kind === 'research' || kind === 'heartbeat') current = { company: String(meta.company ?? ''), role: String(meta.role ?? '') };
    const eta = num(meta.eta_seconds); if (eta != null) etaSeconds = eta;
    if (kind === 'score') {
      total = Math.max(total, Number(meta.total) || total);
      count = Math.max(count, Number(meta.index) || rows.length + 1);
      if (meta.company || meta.role) rows.push({ company: String(meta.company ?? ''), role: String(meta.role ?? ''), score: Number(meta.score) || 0, grade: String(meta.grade ?? '') });
    }
  }
  return { total, count, rows, current, startMs, etaSeconds };
}
function latestBackendEta(events: MissionEventOut[]): number | null {
  for (let i = events.length - 1; i >= 0; i--) { const eta = num(metaOf(events[i]).eta_seconds); if (eta != null) return eta; }
  return null;
}

// ── Matches ───────────────────────────────────────────────────────────────────

interface ParsedMatch { role: string; company: string; score: string; scoreNum: number; initial: string; color: string }
const AVATAR_TINTS = ['var(--cyan)', 'var(--blue)', 'var(--violet)'];
function hashColor(name: string): string { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_TINTS.length; return AVATAR_TINTS[h]; }
function parseMatch(event: MissionEventOut): ParsedMatch | null {
  const raw = cleanHtml(event.message).replace(/^[a-f]?\s*match\s*[:]\s*/i, '').trim();
  const m = raw.match(/^(.+)\s+(?:at|@)\s+(.+?)\s*[-–—]+\s*([\d.]+)/i);
  if (!m) return null;
  const role = m[1].trim(), company = m[2].trim(), n = parseFloat(m[3]);
  if (!role || !company || Number.isNaN(n)) return null;
  const scoreNum = Math.min(5, Math.max(0, n));
  return { role, company, score: scoreNum.toFixed(1), scoreNum, initial: (company.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase(), color: hashColor(company) };
}
function scoreColorOf(n: number): string {
  return n >= 4.5 ? 'var(--green)' : n >= 4 ? 'var(--cyan)' : n >= 3.5 ? 'var(--amber)' : 'var(--muted2)';
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

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
      if (i >= steps) { setVal(target); fromRef.current = target; clearInterval(id); }
      else setVal(Math.round(from + (target - from) * eased));
    }, 25);
    return () => clearInterval(id);
  }, [target]);
  return val;
}

const PHASE_HINTS: Record<string, string[]> = {
  search: ['Querying provider APIs…', 'Reading job descriptions…', 'Collecting postings…'],
  boards: ['Pulling open roles from ATS boards…', 'Reading each posting…', 'Collecting listings…'],
  filter: ['Matching roles to your profile…', 'Dropping off-target postings…', 'Applying salary & location rules…'],
  verify: ['Opening each posting…', 'Checking the link still resolves…', 'Pruning dead or closed roles…'],
  score: ['Reading company funding & news…', 'Checking culture & reviews…', 'Grading fit across 6 dimensions…'],
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

// ── Icons (inline SVG — self-contained, themable, no emoji) ───────────────────

function StageIcon({ stage, className }: { stage: string; className?: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className };
  switch (stage) {
    case 'search': return (<svg viewBox="0 0 24 24" {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
    case 'boards': return (<svg viewBox="0 0 24 24" {...common}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>);
    case 'filter': return (<svg viewBox="0 0 24 24" {...common}><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></svg>);
    case 'verify': return (<svg viewBox="0 0 24 24" {...common}><path d="M12 3 4.5 6v6c0 4.5 3 7.5 7.5 9 4.5-1.5 7.5-4.5 7.5-9V6L12 3Z" /><path d="m9 12 2 2 4-4" /></svg>);
    case 'score': return (<svg viewBox="0 0 24 24" {...common}><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" /><circle cx="12" cy="12" r="3.5" /></svg>);
    default: return (<svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9" /></svg>);
  }
}

function CheckIcon({ className }: { className?: string }) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12.5 10 17.5 19 7" /></svg>);
}

// ── Agent pulse orb (the prominent "AI is working" affordance) ─────────────────

function AgentPulse({ size = 64, tone = 'var(--cyan)', active = true, stage = 'search' }: { size?: number; tone?: string; active?: boolean; stage?: string }) {
  if (!active) {
    return (
      <div className="flex shrink-0 items-center justify-center rounded-full border border-[var(--border-bright)] bg-[var(--card)]" style={{ width: size, height: size, color: tone }}>
        <StageIcon stage={stage} className="h-1/2 w-1/2" />
      </div>
    );
  }
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <span className="agent-pulse-ring absolute inset-0 rounded-full" style={{ border: `2px solid ${tone}` }} />
      <span className="agent-pulse-ring absolute inset-0 rounded-full" style={{ border: `2px solid ${tone}`, animationDelay: '1.1s' }} />
      <div className="agent-breathe absolute inset-0 flex items-center justify-center rounded-full" style={{ background: 'radial-gradient(circle at 50% 40%, color-mix(in srgb, ' + tone + ' 55%, transparent), transparent 70%)' }}>
        <span style={{ width: size * 0.46, height: size * 0.46 }} className="flex items-center justify-center rounded-full" >
          <StageIcon stage={stage} className="h-1/2 w-1/2" />
        </span>
        <span className="absolute rounded-full" style={{ width: size * 0.46, height: size * 0.46, color: tone }} />
      </div>
    </div>
  );
}

function PulsingDot({ color = 'var(--cyan)' }: { color?: string }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ backgroundColor: color }} />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}

// ── Status header (top bar) ───────────────────────────────────────────────────

function StatusHeader({ meta, title, fillPct, failed, done, elapsedSec, etaSec, silenceSec, eventCount }: {
  meta: ReturnType<typeof statusMeta>; title: string; fillPct: number; failed: boolean; done: boolean;
  elapsedSec: number; etaSec: number | null; silenceSec: number; eventCount: number;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-3 px-6 py-5">
      <span className="flex items-center gap-2.5">
        <span className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: 'color-mix(in srgb, ' + meta.tone + ' 14%, transparent)', border: '1px solid color-mix(in srgb, ' + meta.tone + ' 35%, transparent)' }}>
          {meta.live ? <PulsingDot color={meta.tone} /> : <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.tone }} />}
          <span className="text-[12px] font-semibold tracking-[0.4px]" style={{ color: meta.tone }}>{done ? 'Complete' : failed ? 'Failed' : meta.label}</span>
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[17px] font-semibold tracking-[-0.3px] text-[var(--text)]" style={{ fontFamily: 'var(--font-display)' }}>{title}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-right">
        <Metric label="Elapsed" value={fmtDuration(elapsedSec)} tone="var(--text)" />
        {etaSec != null && !done && !failed && <Metric label="ETA" value={fmtDuration(etaSec)} tone="var(--cyan)" />}
        <Metric label="Updated" value={fmtAgo(silenceSec)} tone={silenceSec > 15 ? 'var(--amber)' : 'var(--muted2)'} />
        <Metric label="Events" value={String(eventCount)} tone="var(--muted2)" />
      </div>
      <div className="basis-full h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--border-bright)_40%,transparent)]">
        <div className={cn('h-full rounded-full transition-[width] duration-700', failed ? 'bg-[var(--red)]' : 'bg-[linear-gradient(90deg,var(--cyan),var(--green),var(--cyan))]', !done && !failed && 'mission-progress-fill')} style={{ width: `${fillPct}%`, backgroundSize: '200% 100%' }} />
      </div>
    </header>
  );
}
function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="text-[9px] uppercase tracking-[1.4px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{label}</span>
      <span className="text-[14px] font-semibold tabular-nums" style={{ color: tone, fontFamily: 'var(--font-mono)' }}>{value}</span>
    </span>
  );
}

// ── Stall banner ──────────────────────────────────────────────────────────────

function StallBanner({ silenceSec, elapsedSec, phaseKey, onRefresh }: { silenceSec: number; elapsedSec: number; phaseKey: string | undefined; onRefresh?: () => void; }) {
  if (silenceSec >= 60) {
    return (
      <div role="alert" aria-live="assertive" className="mx-6 mb-4 flex items-start gap-3 rounded-xl border px-4 py-3" style={{ borderColor: 'color-mix(in srgb, var(--amber) 40%, var(--border))', background: 'color-mix(in srgb, var(--amber) 8%, var(--surface))' }}>
        <span className="mt-0.5"><PulsingDot color="var(--amber)" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[var(--text)]">Possible stall — no update for {fmtDuration(silenceSec)}.</p>
          <p className="mt-0.5 text-[12px] text-[var(--muted2)]">The agent may be waiting on a slow provider or a cold model. Elapsed {fmtDuration(elapsedSec)}.</p>
        </div>
        {onRefresh && <button type="button" onClick={onRefresh} className="shrink-0 rounded-lg border border-[var(--border-bright)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-medium text-[var(--text)] transition-colors hover:border-[var(--amber)]">Check for update</button>}
      </div>
    );
  }
  if (silenceSec >= 15) {
    const reason = phaseKey === 'score' ? 'Deep research reads funding, culture & news per company — each role can take 10–30s to score.' : phaseKey === 'verify' ? 'Liveness checks open each posting URL; a few slow hosts can stall the batch.' : 'Provider APIs can take a while to respond.';
    return (
      <div role="status" aria-live="polite" className="mx-6 mb-4 flex items-start gap-3 rounded-xl border border-[var(--border)] px-4 py-3" style={{ background: 'color-mix(in srgb, var(--cyan) 5%, var(--surface))' }}>
        <span className="mt-0.5"><PulsingDot /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[var(--text)]">Still working — waiting for a backend update… ({fmtDuration(silenceSec)} since last event)</p>
          <p className="mt-0.5 text-[12px] text-[var(--muted2)]">{reason}</p>
        </div>
      </div>
    );
  }
  return null;
}

// ── Current step card (the hero — big, breathing, confident) ──────────────────

function CurrentStepCard({ stage, action, hint, live, failed, done }: { stage: string; action: string; hint: string; live: boolean; failed: boolean; done: boolean }) {
  const tone = failed ? 'var(--red)' : done ? 'var(--green)' : 'var(--cyan)';
  return (
    <section className={cn('mx-6 mb-4 rounded-2xl border p-5', live && 'agent-breathe')} style={{ borderColor: live ? 'color-mix(in srgb, ' + tone + ' 38%, var(--border))' : 'var(--border)', background: 'linear-gradient(180deg, color-mix(in srgb, ' + tone + ' 6%, var(--card)), var(--card))' }}>
      <div className="flex items-center gap-5">
        <AgentPulse size={64} tone={tone} active={live && !done} stage={stage} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[1.8px]" style={{ color: tone, fontFamily: 'var(--font-mono)' }}>{done ? 'Done' : failed ? 'Stopped' : 'Now'}</span>
            <span className="text-[11px] uppercase tracking-[1.4px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>· {stage}</span>
          </div>
          <p className="mt-1 truncate text-[20px] font-semibold leading-tight tracking-[-0.3px] text-[var(--text)]" style={{ fontFamily: 'var(--font-display)' }}>{action}</p>
          {live && <p className="mt-1 text-[13px] italic text-[var(--muted2)]">{hint}<span className="mission-cursor ml-1 inline-block h-[13px] w-[5px] translate-y-[2px] bg-[var(--cyan)]" /></p>}
        </div>
      </div>
    </section>
  );
}

// ── Pipeline timeline (5 stage cards) ─────────────────────────────────────────

function PipelineTimeline({ stages, done }: { stages: StageInfo[]; done: boolean }) {
  return (
    <section className="mx-6 mb-4">
      <SectionLabel>Pipeline</SectionLabel>
      <ol className="grid grid-cols-5 gap-2" role="progressbar" aria-valuemin={0} aria-valuemax={stages.length} aria-valuenow={stages.filter((s) => s.state === 'done').length} aria-label="Mission pipeline">
        {stages.map((s) => {
          const active = s.state === 'active' && !done;
          const tone = s.state === 'done' ? 'var(--green)' : active ? 'var(--cyan)' : 'var(--subtle)';
          return (
            <li key={s.key} aria-current={active ? 'step' : undefined} className={cn('relative flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center transition-colors', active && 'stage-sheen')} style={{ borderColor: active ? 'color-mix(in srgb, var(--cyan) 40%, var(--border))' : 'var(--border)', background: active ? 'color-mix(in srgb, var(--cyan) 7%, var(--card))' : 'var(--card)' }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: s.state === 'pending' ? 'var(--surface3)' : 'color-mix(in srgb, ' + tone + ' 16%, transparent)', color: tone }}>
                {s.state === 'done' ? <CheckIcon className="h-4 w-4" /> : <StageIcon stage={s.key} className="h-4 w-4" />}
              </span>
              <span className={cn('text-[11px] font-medium tracking-[0.2px]', s.state === 'pending' ? 'text-[var(--subtle)]' : 'text-[var(--muted2)]')}>{s.label}</span>
              {active && <span className="absolute -top-1 -right-1"><PulsingDot color="var(--cyan)" /></span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ── Provider grid ─────────────────────────────────────────────────────────────

function ProviderGrid({ sources }: { sources: SourceRow[] }) {
  const total = sources.reduce((acc, s) => acc + (s.count ?? 0), 0);
  return (
    <section className="mx-6 mb-4">
      <div className="mb-2 flex items-baseline justify-between">
        <SectionLabel>Providers</SectionLabel>
        <span className="text-[11px] tabular-nums text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{total.toLocaleString('en-US')} postings</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {sources.map((s) => (
          <div key={s.key} className={cn('flex items-center gap-2.5 rounded-xl border px-3 py-2.5', s.status === 'done' ? 'border-[var(--border-bright)] bg-[var(--card)]' : 'border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_60%,transparent)]')}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: s.status === 'pending' ? 'var(--surface3)' : 'color-mix(in srgb, ' + s.color + ' 16%, transparent)', color: s.color }}>
              {s.status === 'done' ? <CheckIcon className="h-3.5 w-3.5" /> : s.status === 'scanning' ? <PulsingDot color={s.color} /> : <span className="h-1.5 w-1.5 rounded-full bg-[var(--subtle)]" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-[12.5px] font-medium', s.status === 'pending' ? 'text-[var(--subtle)]' : 'text-[var(--text)]')}>{s.label}</p>
              <p className="text-[10px] uppercase tracking-[0.6px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{s.status === 'done' ? `${s.count?.toLocaleString('en-US') ?? '0'} found` : s.status === 'scanning' ? 'scanning' : 'queued'}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Scoring section (progress dial + current role + recent) ───────────────────

function ScoringSection({ scoring, live, etaSec }: { scoring: ScoringInfo; live: boolean; etaSec: number | null }) {
  const { total, count, rows, current } = scoring;
  const pct = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0;
  const recent = rows.slice(-4).reverse();
  const active = live && count < total;
  const R = 26, C = 2 * Math.PI * R, off = C * (1 - Math.max(pct, 3) / 100);
  return (
    <section className="mx-6 mb-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-center gap-5">
        <div className="relative h-[64px] w-[64px] shrink-0">
          <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--surface3)" strokeWidth="6" />
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--violet)" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[15px] font-bold tabular-nums text-[var(--text)]" style={{ fontFamily: 'var(--font-mono)' }}>{pct}%</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Deep scoring</SectionLabel>
            <span className="text-[13px] font-semibold tabular-nums text-[var(--text)]" style={{ fontFamily: 'var(--font-mono)' }}>{count}<span className="text-[var(--muted)]"> / {total}</span></span>
          </div>
          {active && current && (current.company || current.role) ? (
            <p className="mt-1.5 flex items-center gap-2 text-[13px] text-[var(--muted2)]"><PulsingDot color="var(--violet)" /> Researching <span className="font-medium text-[var(--text)]">{current.company}</span>{current.role ? <span className="text-[var(--muted)]"> — {current.role}</span> : null}</p>
          ) : !active && count >= total && total > 0 ? (
            <p className="mt-1.5 text-[13px] text-[var(--green)]">All roles scored.</p>
          ) : null}
          {etaSec != null && active && <p className="mt-0.5 text-[11px] tabular-nums text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>~{fmtDuration(etaSec)} remaining</p>}
        </div>
      </div>
      {recent.length > 0 && (
        <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {recent.map((row, i) => {
            const strong = row.grade === 'A' || row.grade === 'B';
            return (
              <div key={`${row.company}-${row.role}-${i}`} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: scoreColorOf(row.score) }} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--muted2)]"><span className="text-[var(--text)]">{row.role || 'Role'}</span><span className="text-[var(--muted)]"> @ {row.company || '—'}</span></span>
                {strong && <span className="text-[9px] text-[var(--amber)]">★</span>}
                <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: scoreColorOf(row.score), fontFamily: 'var(--font-mono)' }}>{row.score.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Match counters (big stat cards) ───────────────────────────────────────────

function MatchCounters({ counters }: { counters: Counters }) {
  const cells: Array<{ label: string; value?: number; color: string; stage: string }> = [
    { label: 'Scanned', value: counters.scanned, color: 'var(--cyan)', stage: 'search' },
    { label: 'Filtered', value: counters.filtered, color: 'var(--blue)', stage: 'filter' },
    { label: 'Verified', value: counters.verified, color: 'var(--green)', stage: 'verify' },
    { label: 'Pruned', value: counters.pruned, color: 'var(--amber)', stage: 'verify' },
    { label: 'Scored', value: counters.scored, color: 'var(--violet)', stage: 'score' },
    { label: 'Strong', value: counters.strong, color: 'var(--green)', stage: 'score' },
  ];
  return (
    <section className="mx-6 mb-4">
      <SectionLabel>Discovery</SectionLabel>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {cells.map((c) => <StatCard key={c.label} label={c.label} value={c.value} color={c.color} stage={c.stage} />)}
      </div>
    </section>
  );
}
function StatCard({ label, value, color, stage }: { label: string; value?: number; color: string; stage: string }) {
  const animated = useCountUp(value);
  const has = value != null;
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 py-3 text-center">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, ' + color + ' 14%, transparent)', color }}><StageIcon stage={stage} className="h-3.5 w-3.5" /></span>
      <span className="stat-pop text-[18px] font-bold tabular-nums tracking-[-0.4px]" style={{ color: has ? color : 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>{has ? animated.toLocaleString('en-US') : '—'}</span>
      <span className="text-[9.5px] uppercase tracking-[1px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{label}</span>
    </div>
  );
}

// ── Top matches ───────────────────────────────────────────────────────────────

function TopMatches({ matches, done }: { matches: ParsedMatch[]; done: boolean }) {
  if (matches.length === 0) return null;
  return (
    <section className="mx-6 mb-4">
      <div className="mb-2 flex items-baseline justify-between"><SectionLabel>Matches surfaced</SectionLabel><span className="text-[11px] tabular-nums text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{matches.length} found</span></div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {matches.slice(-6).reverse().map((match, i) => <MatchCard key={`${match.company}-${match.role}-${i}`} match={match} isNew={i < 2 && !done} />)}
      </div>
    </section>
  );
}
function MatchCard({ match, isNew }: { match: ParsedMatch; isNew: boolean }) {
  const sc = scoreColorOf(match.scoreNum);
  return (
    <div className="mission-match-card flex items-center gap-3 rounded-xl border border-[var(--border-bright)] bg-[var(--card)] p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold" style={{ backgroundColor: match.color, color: 'var(--bg)' }}>{match.initial}</div>
      <div className="min-w-0 flex-1"><p className="truncate text-[12.5px] font-semibold text-[var(--text)]">{match.role}</p><p className="truncate text-[11px] text-[var(--muted)]">{match.company}</p></div>
      <div className="flex shrink-0 flex-col items-end gap-0.5"><span className="text-[10px] text-[var(--amber)]">★</span><span className="text-[13px] font-bold tabular-nums" style={{ color: sc, fontFamily: 'var(--font-mono)' }}>{match.score}</span>{isNew && <span className="rounded-sm bg-[var(--cyan)] px-1 py-0.5 text-[8px] font-bold tracking-widest text-[var(--bg)]">NEW</span>}</div>
    </div>
  );
}

// ── Completion summary (success state) ───────────────────────────────────────

function CompletionSummary({ counters, elapsedSec, matches }: { counters: Counters; elapsedSec: number; matches: ParsedMatch[] }) {
  const top3 = [...matches].sort((a, b) => b.scoreNum - a.scoreNum).slice(0, 3);
  return (
    <section className="mx-6 mb-4 rounded-2xl border p-5" style={{ borderColor: 'color-mix(in srgb, var(--green) 35%, var(--border))', background: 'linear-gradient(180deg, color-mix(in srgb, var(--green) 7%, var(--card)), var(--card))' }} role="status" aria-live="polite">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--green)]"><CheckIcon className="h-5 w-5 text-[var(--bg)]" /></span>
        <div><p className="text-[16px] font-semibold tracking-[-0.2px] text-[var(--text)]" style={{ fontFamily: 'var(--font-display)' }}>Mission complete</p><p className="text-[12px] text-[var(--muted2)]">{counters.strong ?? 0} strong matches from {counters.scored ?? 0} scored roles</p></div>
        <span className="ml-auto text-[12px] tabular-nums text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{fmtDuration(elapsedSec)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {[
          { l: 'Scanned', v: counters.scanned, c: 'var(--cyan)' }, { l: 'Filtered', v: counters.filtered, c: 'var(--blue)' },
          { l: 'Verified', v: counters.verified, c: 'var(--green)' }, { l: 'Pruned', v: counters.pruned, c: 'var(--amber)' },
          { l: 'Scored', v: counters.scored, c: 'var(--violet)' }, { l: 'Strong', v: counters.strong, c: 'var(--green)' },
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-center">
            <p className="text-[15px] font-semibold tabular-nums" style={{ color: s.v != null ? s.c : 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>{s.v != null ? s.v.toLocaleString('en-US') : '—'}</p>
            <p className="text-[9px] uppercase tracking-[1px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{s.l}</p>
          </div>
        ))}
      </div>
      {top3.length > 0 && (
        <div className="mt-4">
          <SectionLabel>Top {top3.length} matches</SectionLabel>
          <div className="mt-2 flex flex-col gap-1.5">
            {top3.map((m, i) => (
              <div key={`${m.company}-${m.role}-${i}`} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <span className="text-[11px] font-semibold tabular-nums text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>#{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">{m.role}<span className="text-[var(--muted)]"> @ {m.company}</span></span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: scoreColorOf(m.scoreNum), fontFamily: 'var(--font-mono)' }}>{m.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Failed state ──────────────────────────────────────────────────────────────

function FailedState({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <section className="mx-6 mb-4 flex items-start gap-3 rounded-2xl border p-5" style={{ borderColor: 'color-mix(in srgb, var(--red) 38%, var(--border))', background: 'color-mix(in srgb, var(--red) 7%, var(--card))' }} role="alert">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--red) 18%, transparent)', color: 'var(--red)' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-[var(--text)]">This mission stopped before finishing</p>
        <p className="mt-1 text-[12.5px] text-[var(--muted2)]">The agent hit an error mid-run. Any matches found before it stopped are still saved.</p>
      </div>
      {onRefresh && <button type="button" onClick={onRefresh} className="shrink-0 self-center rounded-lg border border-[var(--border-bright)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-medium text-[var(--text)] transition-colors hover:border-[var(--red)]">Retry check</button>}
    </section>
  );
}

// ── Connecting / empty states ─────────────────────────────────────────────────

const SEARCH_THOUGHTS = ['Waking the agent…', 'Loading your profile & archetypes…', 'Lining up job sources…', 'Preparing the search…'];
function ConnectingState() {
  const [idx, setIdx] = useState(0);
  useEffect(() => { if (reduceMotion()) return; const t = setInterval(() => setIdx((i) => (i + 1) % SEARCH_THOUGHTS.length), 1800); return () => clearInterval(t); }, []);
  return (
    <div className="flex flex-col items-center justify-center gap-5 px-8 py-16">
      <AgentPulse size={72} active stage="search" />
      <div className="text-center">
        <p className="text-[14px] font-medium text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>Connecting to agent…</p>
        <p className="mt-1 text-[13px] italic text-[var(--muted)]">{SEARCH_THOUGHTS[idx]}<span className="mission-cursor ml-1 inline-block h-[13px] w-[5px] translate-y-[2px] bg-[var(--cyan)]" /></p>
      </div>
    </div>
  );
}
function EmptyState() {
  return <div className="flex flex-col items-center justify-center gap-2 px-8 py-12 text-center"><p className="text-[13px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>No events yet.</p></div>;
}

// ── Raw log (secondary, collapsible) ──────────────────────────────────────────

function RawLog({ events, done }: { events: MissionEventOut[]; done: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const prevCountRef = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [open, setOpen] = useState(false);
  const latestId = events.at(-1)?.id;
  const scrollToBottom = (b: ScrollBehavior = 'smooth') => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: b }); };
  const handleScroll = () => { const el = scrollRef.current; if (!el) return; const dist = el.scrollHeight - el.scrollTop - el.clientHeight; pinnedRef.current = dist < 48; setShowJump(!pinnedRef.current); };
  useLayoutEffect(() => {
    if (!open) return;
    const grew = events.length > prevCountRef.current;
    const first = prevCountRef.current === 0 && events.length > 0;
    prevCountRef.current = events.length;
    if (grew && pinnedRef.current) scrollToBottom(first ? 'auto' : 'smooth');
  }, [events.length, open]);
  return (
    <section className="mx-6 mb-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-left transition-colors hover:border-[var(--border-bright)]">
        <svg viewBox="0 0 12 12" className={cn('h-3 w-3 text-[var(--muted)] transition-transform', open && 'rotate-90')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 2.5 8 6l-4 3.5" /></svg>
        <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>Activity log</span>
        <span className="ml-auto text-[11px] tabular-nums text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{events.length}</span>
      </button>
      {open && (
        <div className="relative mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div ref={scrollRef} onScroll={handleScroll} className="feed-scroll h-[280px] overflow-y-auto" role="log" aria-live="polite" aria-relevant="additions">
            {events.length === 0 ? <EmptyState /> : (
              <div className="flex flex-col py-1">
                {events.map((ev, i) => <LogRow key={ev.id ?? `${ev.created_at}-${i}`} event={ev} isLatest={ev.id === latestId && !done} />)}
              </div>
            )}
          </div>
          {showJump && <button type="button" onClick={() => { pinnedRef.current = true; setShowJump(false); scrollToBottom(); }} className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--border-bright)] bg-[var(--card)] px-3 py-1 text-[11px] font-medium text-[var(--muted2)] shadow-lg transition-colors hover:border-[var(--cyan)] hover:text-[var(--text)]" style={{ fontFamily: 'var(--font-mono)' }}>↓ Jump to latest</button>}
        </div>
      )}
    </section>
  );
}
function LogRow({ event, isLatest }: { event: MissionEventOut; isLatest: boolean }) {
  const { label, color } = getTag(event);
  const message = cleanHtml(event.message);
  const detail = cleanHtml(event.detail);
  if (!message && !detail) return null;
  return (
    <div className={cn('animate-feed-in flex items-start gap-3 border-b border-[var(--border)] px-4 py-[6px]', isLatest && 'bg-[color-mix(in_srgb,var(--cyan)_5%,transparent)]')}>
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <span className="mr-2 text-[9.5px] font-semibold tracking-[0.5px] uppercase" style={{ color, fontFamily: 'var(--font-mono)' }}>{label}</span>
        <span className="text-[12.5px] text-[var(--muted2)] leading-[1.6]">{message}</span>
        {detail && <div className="mt-0.5 border-l border-[var(--border-bright)] pl-2 text-[11px] text-[var(--muted)] leading-relaxed">{detail}</div>}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="block text-[10px] font-bold uppercase tracking-[1.8px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>{children}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function MissionFeed({ events, status, mission, missionTitle, lastEventAt, onRefreshStall }: MissionFeedProps) {
  const meta = statusMeta(status);
  const connecting = status === 'connecting';
  const done = status === 'done';
  const failed = status === 'failed';
  const live = meta.live;

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { if (!live && !connecting) return; const t = setInterval(() => setNowMs(Date.now()), 1000); return () => clearInterval(t); }, [live, connecting]);

  const { stages, reachedIdx, fillPct } = useMemo(() => computeStages(events, done, failed), [events, done, failed]);
  const activeStage = stages.find((s) => s.state === 'active');
  const phaseKey = activeStage?.key ?? (reachedIdx >= 0 ? PIPELINE[reachedIdx].key : 'search');

  const rawSources = (mission as unknown as { sources?: unknown } | undefined)?.sources;
  const missionSources = useMemo<string[]>(() => { if (Array.isArray(rawSources)) return rawSources.map((s) => String(s)); if (typeof rawSources === 'string') return rawSources.split(','); return []; }, [rawSources]);
  const sources = useMemo(() => deriveSources(events, missionSources), [events, missionSources]);
  const scoring = useMemo(() => deriveScoring(events), [events]);
  const matches = useMemo(() => events.filter((e) => e.event_type === 'star').map(parseMatch).filter(Boolean) as ParsedMatch[], [events]);
  const counters = useMemo(() => deriveCounters(events, mission, scoring.count), [events, mission, scoring.count]);

  const currentAction = useMemo(() => {
    const last = events.at(-1);
    if (last && String(metaOf(last).kind ?? '') === 'heartbeat') return cleanHtml(last.message);
    for (let i = events.length - 1; i >= 0; i--) if (events[i].event_type === 'run') return cleanHtml(events[i].message);
    return last ? cleanHtml(last.message) : 'Starting the agent…';
  }, [events]);
  const hint = useRotatingHint(phaseKey, live);

  const startMs = useMemo(() => { if (mission?.started_at) return new Date(mission.started_at).getTime(); if (events[0]?.created_at) return new Date(events[0].created_at).getTime(); return null; }, [mission?.started_at, events]);
  const endMs = mission?.completed_at ? new Date(mission.completed_at).getTime() : null;
  const refMs = !live && endMs ? endMs : nowMs;
  const elapsedSec = startMs != null ? Math.max(0, (refMs - startMs) / 1000) : 0;

  const backendEta = useMemo(() => latestBackendEta(events), [events]);
  const clientEta = useMemo(() => {
    if (!live || scoring.total <= 0 || scoring.count <= 0 || scoring.startMs == null) return null;
    if (scoring.count >= scoring.total) return null;
    const perItem = (nowMs - scoring.startMs) / scoring.count;
    const remaining = (perItem * (scoring.total - scoring.count)) / 1000;
    return Number.isFinite(remaining) && remaining > 0 ? Math.min(remaining, 60 * 30) : null;
  }, [live, scoring.total, scoring.count, scoring.startMs, nowMs]);
  const etaSec = backendEta ?? clientEta;
  const silenceSec = lastEventAt != null && live ? Math.max(0, (nowMs - lastEventAt) / 1000) : 0;

  const showScoring = scoring.total > 0 || (phaseKey === 'score' && reachedIdx >= 4);
  const displayTitle = missionTitle ?? 'Job Search Agent';

  return (
    <div className="mission-console overflow-hidden rounded-2xl border border-[var(--border-bright)] bg-[var(--surface)] shadow-[0_24px_100px_rgba(0,0,0,0.34)]" aria-busy={connecting || (live && !done)}>
      <StatusHeader meta={meta} title={displayTitle} fillPct={fillPct} failed={failed} done={done} elapsedSec={elapsedSec} etaSec={etaSec} silenceSec={silenceSec} eventCount={events.length} />
      {live && silenceSec >= 15 && <StallBanner silenceSec={silenceSec} elapsedSec={elapsedSec} phaseKey={phaseKey} onRefresh={onRefreshStall} />}
      {failed && <FailedState onRefresh={onRefreshStall} />}
      {connecting && events.length === 0 ? <ConnectingState /> : (
        <>
          {done && <CompletionSummary counters={counters} elapsedSec={elapsedSec} matches={matches} />}
          {!done && <CurrentStepCard stage={phaseKey} action={currentAction} hint={hint} live={live} failed={failed} done={done} />}
          <PipelineTimeline stages={stages} done={done} />
          {sources.length > 0 && <ProviderGrid sources={sources} />}
          {showScoring && <ScoringSection scoring={scoring} live={live} etaSec={etaSec} />}
          <MatchCounters counters={counters} />
          <TopMatches matches={matches} done={done} />
          <RawLog events={events} done={done} />
        </>
      )}
    </div>
  );
}

export default MissionFeed;
