'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AgentOrb } from '@/components/ui/agent-orb';
import type { MissionEventOut } from '@/lib/types';
import type { MissionStreamStatus } from '@/hooks/useMissionStream';
import { FeedItem } from './feed-item';

export interface MissionFeedProps {
  events: MissionEventOut[];
  status: MissionStreamStatus;
}

type StageId = 'search' | 'verify' | 'research' | 'score';

interface StageSpec {
  id: StageId;
  label: string;
  match: RegExp;
}

interface SourceProgress {
  label: string;
  hint: string;
  done: boolean;
  active: boolean;
  value: number;
  total: number;
  tone: 'cyan' | 'green' | 'amber' | 'violet';
}

interface ParsedMatch {
  role: string;
  company: string;
  score: string;
  scoreNum: number;
  detail: string;
}

const STAGES: StageSpec[] = [
  { id: 'search', label: 'Searching the open web', match: /exa|semantic|rss|ats|source|posting/i },
  { id: 'verify', label: 'Verifying live postings', match: /verify|live|dead|closed|pruned/i },
  { id: 'research', label: 'Deep-researching companies', match: /research|company|funding|culture|sentiment/i },
  { id: 'score', label: 'Scoring & ranking', match: /scor|rank|match|grade|priorit/i },
];

const TONE_CLASS: Record<SourceProgress['tone'], string> = {
  cyan: 'bg-[var(--cyan)]',
  green: 'bg-[var(--green)]',
  amber: 'bg-[var(--amber)]',
  violet: 'bg-[var(--violet)]',
};

// Deterministic bright color per company name
const COMPANY_PALETTE = [
  '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#3b82f6', '#14b8a6',
];
function companyColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % COMPANY_PALETTE.length;
  return COMPANY_PALETTE[h];
}

function cleanHtml(value?: string): string {
  return (value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function eventText(event: MissionEventOut): string {
  return `${cleanHtml(event.message)} ${cleanHtml(event.detail)}`.trim();
}

/** Parse "A match: Applied AI Engineer at Anthropic — 4.3/5.0" */
function parseMatchEvent(event: MissionEventOut): ParsedMatch {
  const text = cleanHtml(event.message).replace(/^[a-f]?\s*match\s*[:]\s*/i, '').trim();
  const m = text.match(/^(.+?)\s+(?:at|@)\s+(.+?)\s*[—–-]+\s*([\d.]+)/i);
  const detail = cleanHtml(event.detail);
  if (m) {
    return {
      role: m[1].trim(),
      company: m[2].trim(),
      score: m[3],
      scoreNum: parseFloat(m[3]),
      detail,
    };
  }
  return { role: text, company: '', score: '--', scoreNum: 0, detail };
}

function getActiveStage(events: MissionEventOut[], status: MissionStreamStatus): StageId {
  if (status === 'done') return 'score';
  const latest = [...events].reverse().find((event) => event.event_type !== 'ok');
  const text = latest ? eventText(latest) : '';
  return [...STAGES].reverse().find((stage) => stage.match.test(text))?.id ?? 'search';
}

function getStageIndex(stageId: StageId): number {
  return Math.max(0, STAGES.findIndex((stage) => stage.id === stageId));
}

function hasText(events: MissionEventOut[], pattern: RegExp): boolean {
  return events.some((event) => pattern.test(eventText(event)));
}

function extractFirstNumber(events: MissionEventOut[], pattern: RegExp, fallback = 0): number {
  for (const event of [...events].reverse()) {
    const match = eventText(event).match(pattern);
    if (match?.[1]) return Number(match[1].replace(/,/g, ''));
  }
  return fallback;
}

function buildSourceProgress(
  events: MissionEventOut[],
  activeStage: StageId,
  status: MissionStreamStatus,
): SourceProgress[] {
  const exa = extractFirstNumber(events, /exa returned\s+([\d,]+)/i, 0);
  const ats = extractFirstNumber(events, /ats feeds returned\s+([\d,]+)/i, 0);
  const rss = extractFirstNumber(events, /rss feeds returned\s+([\d,]+)/i, 0);
  const scanned = extractFirstNumber(events, /scanned\s+([\d,]+)/i, 0);
  const filtered = extractFirstNumber(events, /filtered to\s+([\d,]+)/i, 0);
  const verified = extractFirstNumber(events, /(\d+)\s+verified live/i, 0);
  const research = extractFirstNumber(events, /researching\s+(\d+)\s+companies/i, 0);
  const matches = events.filter((event) => event.event_type === 'star').length;

  return [
    {
      label: 'Exa semantic search',
      hint: 'Semantic web scan',
      done: exa > 0,
      active: activeStage === 'search' && exa === 0,
      value: Math.min(exa, 100),
      total: 100,
      tone: 'green',
    },
    {
      label: 'ATS feeds',
      hint: 'Greenhouse, Lever, Ashby',
      done: ats > 0,
      active: activeStage === 'search' && ats === 0,
      value: ats || (hasText(events, /ats/i) ? 35 : 0),
      total: Math.max(ats, 1184),
      tone: 'green',
    },
    {
      label: 'RSS job feeds',
      hint: 'Remote boards and niche feeds',
      done: rss > 0,
      active: activeStage === 'search' && rss === 0 && hasText(events, /rss/i),
      value: rss,
      total: Math.max(rss, 45),
      tone: 'green',
    },
    {
      label: 'Profile filtering',
      hint: 'Role, location, salary, skills',
      done: filtered > 0,
      active: activeStage === 'score' && filtered === 0,
      value: filtered || (scanned ? Math.round(scanned * 0.25) : 0),
      total: Math.max(scanned, 1329),
      tone: 'amber',
    },
    {
      label: 'Live verification',
      hint: 'Checking if postings still exist',
      done: verified > 0 || hasText(events, /pruned/i),
      active: activeStage === 'verify',
      value: verified || (activeStage === 'verify' ? 28 : 0),
      total: 60,
      tone: 'amber',
    },
    {
      label: 'Company research',
      hint: 'Funding, layoffs, culture signals',
      done: hasText(events, /research complete|match/i),
      active: activeStage === 'research',
      value: hasText(events, /research complete|match/i) ? 30 : research,
      total: 30,
      tone: 'violet',
    },
    {
      label: 'Scoring & ranking',
      hint: 'Ranking best matches',
      done: status === 'done',
      active: activeStage === 'score' && status !== 'done',
      value: status === 'done' ? Math.max(matches, 1) : matches,
      total: Math.max(matches, 3),
      tone: 'cyan',
    },
  ];
}

function getOverallProgress(
  sourceProgress: SourceProgress[],
  status: MissionStreamStatus,
): number {
  if (status === 'done') return 100;
  const total = sourceProgress.reduce((sum, item) => {
    const itemTotal = item.total || 1;
    return sum + Math.min(1, item.value / itemTotal);
  }, 0);
  return Math.min(96, Math.max(8, Math.round((total / sourceProgress.length) * 100)));
}

export function MissionFeed({ events, status }: MissionFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const prevCountRef = useRef(0);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 48;
    pinnedRef.current = atBottom;
    setShowJump(!atBottom);
  };

  useLayoutEffect(() => {
    const grew = events.length > prevCountRef.current;
    const first = prevCountRef.current === 0 && events.length > 0;
    prevCountRef.current = events.length;
    if (!grew) return;
    if (pinnedRef.current) scrollToBottom(first ? 'auto' : 'smooth');
  }, [events.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (pinnedRef.current) scrollToBottom('auto'); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const connecting = status === 'connecting';
  const isEmpty = events.length === 0;
  const activeStage = useMemo(() => getActiveStage(events, status), [events, status]);
  const activeStageIndex = getStageIndex(activeStage);
  const sourceProgress = useMemo(
    () => buildSourceProgress(events, activeStage, status),
    [events, activeStage, status],
  );
  const overallProgress = getOverallProgress(sourceProgress, status);

  // Progress bar that NEVER stalls — ticks forward even between real events
  const [displayProgress, setDisplayProgress] = useState(8);
  useEffect(() => {
    if (status === 'done') { setDisplayProgress(100); return; }
    const id = setInterval(() => {
      setDisplayProgress((p) => {
        const floor = Math.max(p, overallProgress);
        return Math.min(floor + 0.4, 95);
      });
    }, 500);
    return () => clearInterval(id);
  }, [status, overallProgress]);

  const latestEventId = events.at(-1)?.id;
  const currentStep =
    status === 'done'
      ? 'Top matches ready'
      : STAGES.find((stage) => stage.id === activeStage)?.label ?? 'Searching the open web';

  const starEvents = useMemo(
    () => events.filter((e) => e.event_type === 'star'),
    [events],
  );

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_94%,white_2%),var(--surface))] shadow-[0_18px_80px_rgba(0,0,0,0.24)]">
      {/* Chrome bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[11px] uppercase tracking-[1.8px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
            AGENT.CONSOLE
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted2)]">
            <span className={['size-1.5 rounded-full', status === 'done' ? 'bg-[var(--cyan)]' : 'bg-[var(--green)] mission-node-active'].join(' ')} />
            {status === 'done' ? 'Complete' : status === 'connecting' ? 'Connecting' : 'LIVE'}
          </span>
        </div>

        <div className="order-3 flex w-full min-w-0 items-center gap-2 md:order-none md:ml-3 md:w-auto md:flex-1">
          {STAGES.map((stage, index) => {
            const reached = index <= activeStageIndex || status === 'done';
            const active = stage.id === activeStage && status !== 'done';
            return (
              <div key={stage.id} className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">
                <span
                  className={['truncate border-b py-1 text-[11px] transition-colors', reached ? 'border-[var(--cyan)] text-[var(--text)]' : 'border-transparent text-[var(--muted)]', active ? 'mission-stage-active' : ''].join(' ')}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {stage.label}
                </span>
                {index < STAGES.length - 1 && <span className="hidden text-[var(--muted)] md:inline" aria-hidden="true">/</span>}
              </div>
            );
          })}
        </div>

        <span className="ml-auto text-[11px] tabular-nums text-[var(--muted)]">
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
      </div>

      {/* Progress bar — always animating */}
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-bright)] bg-[color-mix(in_srgb,var(--card)_84%,transparent)] px-3 py-1.5">
            <AgentOrb state={status === 'done' ? 'done' : 'running'} size={10} />
            <span className="text-[12px] text-[var(--text)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {currentStep}
            </span>
          </div>
          <div className="h-2 min-w-[180px] flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--border-bright)_40%,transparent)]">
            <div
              className="mission-progress-fill h-full rounded-full bg-[linear-gradient(90deg,var(--cyan),var(--green),var(--cyan))] transition-[width] duration-700"
              style={{ width: `${displayProgress}%`, backgroundSize: '200% 100%' }}
            />
          </div>
          <span className="text-[12px] tabular-nums text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {Math.round(displayProgress)}%
          </span>
        </div>
      </div>

      <div className="grid min-h-[520px] lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
        {/* Left: event stream */}
        <div className="relative border-b border-[var(--border)] lg:border-b-0 lg:border-r">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="feed-scroll h-[520px] overflow-y-auto py-2"
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
                    highlight={Boolean(latestEventId && event.id === latestEventId && status !== 'done')}
                  />
                ))}
                {status === 'running' && <ThinkingRow />}
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(180deg,transparent,var(--surface))]" />

          {status === 'running' && (
            <div className="absolute bottom-3 left-4 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_88%,black_12%)] px-3 py-1.5 shadow-lg">
              <span className="mission-cursor size-2 rounded-sm bg-[var(--cyan)]" />
              <span className="text-[11px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
                agent is still searching
              </span>
            </div>
          )}
        </div>

        {/* Right: radar + sources */}
        <aside className="flex min-w-0 flex-col gap-4 p-4">
          <SearchPulse
            activeStage={activeStage}
            sourceProgress={sourceProgress}
            status={status}
            starEvents={starEvents}
          />
          <VerificationPanel items={sourceProgress} />
        </aside>
      </div>

      {/* Bottom: match cards */}
      <EmergingMatches starEvents={starEvents} active={status !== 'done'} />

      {showJump && (
        <button
          type="button"
          onClick={() => { pinnedRef.current = true; setShowJump(false); scrollToBottom('smooth'); }}
          className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--border-bright)] bg-[var(--card)] px-3 py-1 text-[11px] font-medium text-[var(--muted2)] shadow-lg transition-colors hover:border-[var(--cyan)] hover:text-[var(--text)]"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}

// ── Radar ────────────────────────────────────────────────────────────────────

const RADAR_POSITIONS = [
  'left-[46%] top-[9%]',
  'right-[12%] top-[24%]',
  'right-[10%] bottom-[32%]',
  'right-[28%] bottom-[9%]',
  'left-[20%] bottom-[13%]',
  'left-[8%] top-[38%]',
];

function SearchPulse({
  activeStage,
  sourceProgress,
  status,
  starEvents,
}: {
  activeStage: StageId;
  sourceProgress: SourceProgress[];
  status: MissionStreamStatus;
  starEvents: MissionEventOut[];
}) {
  const scanned = sourceProgress.find((i) => i.label === 'Profile filtering')?.total ?? 0;
  const verified = sourceProgress.find((i) => i.label === 'Live verification')?.value ?? 0;
  const filtered = sourceProgress.find((i) => i.label === 'Profile filtering')?.value ?? 0;
  const companies = sourceProgress.find((i) => i.label === 'Company research')?.value ?? 0;

  // Flash the center whenever a new star event arrives
  const lastStarId = starEvents.at(-1)?.id ?? '';
  const [flashKey, setFlashKey] = useState('');
  useEffect(() => {
    if (lastStarId) setFlashKey(lastStarId);
  }, [lastStarId]);

  // Build radar node labels: company initials for found companies, source letters for the rest
  const parsedMatches = useMemo(() => starEvents.map(parseMatchEvent), [starEvents]);
  const nodes = RADAR_POSITIONS.map((pos, i) => {
    const company = parsedMatches[i];
    if (company && company.company) {
      return {
        label: company.company[0].toUpperCase(),
        title: company.company,
        color: companyColor(company.company),
        active: i === parsedMatches.length - 1,
        isCompany: true,
      };
    }
    const src = sourceProgress[i];
    return {
      label: src?.label.slice(0, 1) ?? '?',
      title: src?.label ?? '',
      color: null,
      active: src?.active ?? false,
      isCompany: false,
    };
  });

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_72%,transparent)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[12px] uppercase tracking-[1.6px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
          Live search pulse
        </h2>
        <span className="text-[11px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {STAGES.find((s) => s.id === activeStage)?.label}
        </span>
      </div>

      <div className="relative mx-auto aspect-square max-h-[260px] max-w-[260px] rounded-full border border-[var(--border-bright)] bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--cyan)_16%,transparent),transparent_62%)]">
        {/* Concentric rings */}
        <div className="mission-radar-grid absolute inset-4 rounded-full border border-[var(--border)]" />
        <div className="mission-radar-grid absolute inset-12 rounded-full border border-[var(--border)]" />
        <div className="mission-radar-grid absolute inset-20 rounded-full border border-[var(--border)]" />

        {/* ALWAYS-ROTATING sweep — only speed changes when done */}
        <div
          className="mission-radar-sweep absolute inset-1/2 origin-left"
          style={status === 'done' ? { animationDuration: '6s', opacity: 0.4 } : undefined}
        />

        {/* Center orb — flashes on every new match */}
        <div
          key={flashKey}
          className={['absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--cyan)] shadow-[0_0_24px_var(--cyan)]', flashKey ? 'mission-center-flash' : ''].join(' ')}
        />

        {/* Radar nodes — show company initials as matches come in */}
        {nodes.map((node, i) => (
          <div
            key={`node-${i}-${node.label}`}
            className={['absolute flex size-8 items-center justify-center rounded-full border text-[10px] font-bold text-white shadow-[0_0_16px_rgba(34,211,238,0.18)] transition-all duration-500', RADAR_POSITIONS[i], node.isCompany ? 'mission-node-company border-white/30' : node.active ? 'mission-node-active border-[var(--cyan)] text-[var(--text)] bg-[var(--surface)]' : 'border-[var(--border-bright)] bg-[var(--surface)] text-[var(--text)]'].join(' ')}
            style={node.isCompany && node.color ? { backgroundColor: node.color, borderColor: node.color, boxShadow: `0 0 20px ${node.color}66` } : undefined}
            title={node.title}
          >
            {node.label}
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <PulseStat label="Scanned" value={scanned || '--'} />
        <PulseStat label="Filtered" value={filtered || '--'} />
        <PulseStat label="Verified" value={verified || '--'} accent />
        <PulseStat label="Matches" value={parsedMatches.length || '--'} highlight />
      </div>
    </section>
  );
}

function PulseStat({ label, value, accent = false, highlight = false }: { label: string; value: number | string; accent?: boolean; highlight?: boolean }) {
  return (
    <div className={['rounded-lg border px-3 py-2 transition-colors', highlight && typeof value === 'number' && value > 0 ? 'border-[var(--cyan)]/50 bg-[color-mix(in_srgb,var(--cyan)_6%,transparent)]' : 'border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)]'].join(' ')}>
      <p className="truncate text-[10px] uppercase tracking-[0.9px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </p>
      <p className={['mt-1 text-[18px] font-semibold tabular-nums', accent ? 'text-[var(--green)]' : highlight && typeof value === 'number' && value > 0 ? 'text-[var(--cyan)]' : 'text-[var(--text)]'].join(' ')} style={{ fontFamily: 'var(--font-mono)' }}>
        {value}
      </p>
    </div>
  );
}

// ── Sources panel ─────────────────────────────────────────────────────────────

function VerificationPanel({ items }: { items: SourceProgress[] }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_72%,transparent)] p-4">
      <h2 className="mb-3 text-[12px] uppercase tracking-[1.6px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
        Sources & verification
      </h2>
      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const pct = item.total ? Math.min(100, Math.round((item.value / item.total) * 100)) : 0;
          return (
            <div
              key={item.label}
              className={['rounded-lg border bg-[color-mix(in_srgb,var(--surface)_76%,transparent)] p-3', item.active ? 'border-[var(--cyan)]/60' : item.done ? 'border-[var(--border-bright)]' : 'border-[var(--border)]'].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[12px] text-[var(--text)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {item.label}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{item.hint}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {item.done && <span className="text-[10px] text-[var(--green)]">✓</span>}
                  <span className="text-[11px] tabular-nums text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {item.value || '--'} / {item.total || '--'}
                  </span>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--border-bright)_38%,transparent)]">
                <div
                  className={['h-full rounded-full transition-all duration-700', TONE_CLASS[item.tone], item.active ? 'mission-progress-fill' : ''].join(' ')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Match cards ───────────────────────────────────────────────────────────────

function scoreColor(n: number): string {
  if (n >= 4.5) return 'text-[var(--green)]';
  if (n >= 4.0) return 'text-[var(--cyan)]';
  if (n >= 3.5) return 'text-[var(--amber)]';
  return 'text-[var(--muted2)]';
}

function EmergingMatches({ starEvents, active }: { starEvents: MissionEventOut[]; active: boolean }) {
  const matches = useMemo(() => starEvents.map(parseMatchEvent), [starEvents]);
  const displayed = matches.slice(-6).reverse(); // newest first, up to 6

  const isEmpty = displayed.length === 0;

  return (
    <section className="border-t border-[var(--border)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[12px] uppercase tracking-[1.6px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
          Top matches emerging
        </h2>
        <span className="text-[11px] text-[var(--muted)]">
          {matches.length ? `${matches.length} surfaced` : active ? 'warming up…' : 'none yet'}
        </span>
      </div>

      {isEmpty ? (
        <div className="grid gap-3 md:grid-cols-3">
          {['Scanning job boards…', 'Verifying live postings…', 'Scoring your best matches…'].map((msg, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] p-3 opacity-60">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--card)]">
                <span className="mission-cursor inline-block h-3 w-[5px] bg-[var(--cyan)]" />
              </div>
              <p className="text-[12px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>{msg}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {displayed.map((match, i) => {
            const color = match.company ? companyColor(match.company) : '#06b6d4';
            const initial = match.company?.[0]?.toUpperCase() ?? '?';
            const isNew = i < 2 && active;
            return (
              <div
                key={`${match.company}-${match.role}-${i}`}
                className="mission-match-card relative flex flex-col gap-2.5 rounded-lg border border-[var(--border-bright)] bg-[color-mix(in_srgb,var(--card)_82%,transparent)] p-3"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {isNew && (
                  <span className="absolute right-2 top-2 rounded-sm bg-[var(--cyan)] px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-[#07071a]">
                    NEW
                  </span>
                )}
                <div className="flex items-center gap-2.5">
                  {/* Company logo badge */}
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-lg"
                    style={{ backgroundColor: color, boxShadow: `0 4px 16px ${color}44` }}
                  >
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-[var(--text)]">{match.role}</p>
                    <p className="truncate text-[11px] text-[var(--muted)]">{match.company || '—'}</p>
                  </div>
                </div>

                {match.detail && (
                  <p className="line-clamp-2 text-[11px] leading-relaxed text-[var(--muted)]">
                    {match.detail}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-[11px] text-[var(--muted2)]">
                    <span className="text-[var(--amber)]">★</span>
                    <span className={['font-semibold tabular-nums', scoreColor(match.scoreNum)].join(' ')}>
                      {match.score}/5.0
                    </span>
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">scorecard forming</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Utility rows ──────────────────────────────────────────────────────────────

function ConnectingState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <AgentOrb state="running" size={14} />
      <p className="text-[13px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
        Connecting to agent...
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
      <p className="text-[13px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
        No events yet.
      </p>
      <p className="max-w-xs text-[11px] text-[var(--muted)]">
        The console will light up as soon as the backend emits the first event.
      </p>
    </div>
  );
}

function ThinkingRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-1 text-[13px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
      <span className="select-none tabular-nums opacity-0" aria-hidden="true">00:00:00</span>
      <span className="mission-cursor inline-block h-3.5 w-[7px] bg-[var(--cyan)]" />
      <span>agent is still searching</span>
    </div>
  );
}

export default MissionFeed;
