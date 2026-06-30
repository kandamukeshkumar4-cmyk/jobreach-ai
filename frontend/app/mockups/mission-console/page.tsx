'use client';

/**
 * Dev-only harness for the redesigned live mission console. Scripts a realistic
 * mission (including the per-job scoring metadata the worker now emits) and
 * reveals events on a timer so the live animations can be eyeballed without a
 * backend. Not linked from nav.
 */

import { useEffect, useMemo, useState } from 'react';
import type { MissionEventOut, MissionOut } from '@/lib/types';
import { MissionFeed } from '@/components/mission/mission-feed';
import type { MissionStreamStatus } from '@/hooks/useMissionStream';

interface Scripted {
  event_type: MissionEventOut['event_type'];
  message: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

const SCRIPT: Scripted[] = [
  { event_type: 'ok', message: 'Candidate profile loaded — 3 archetypes detected', metadata: { stage: 'init' } },
  { event_type: 'run', message: "Scanning Exa semantic web search for: 'AI Engineer'...", metadata: { stage: 'search', provider: 'exa', source: 'exa' } },
  { event_type: 'ok', message: 'Exa returned 1016 postings', metadata: { stage: 'search', provider: 'exa', source: 'exa', count: 1016, scanned: 1016 } },
  { event_type: 'run', message: 'Scanning ATS feeds: Greenhouse, Lever, Ashby...', metadata: { stage: 'boards', provider: 'greenhouse,lever,ashby' } },
  { event_type: 'ok', message: 'ATS feeds returned 344 postings', detail: 'greenhouse: 116 | lever: 117 | ashby: 111', metadata: { stage: 'boards', provider: 'greenhouse,lever,ashby', count: 344, scanned: 1360, by_source: { greenhouse: 116, lever: 117, ashby: 111 } } },
  { event_type: 'run', message: 'Scanning RemoteOK for US-eligible remote roles...', metadata: { stage: 'boards', provider: 'remoteok', source: 'remoteok' } },
  { event_type: 'ok', message: 'RemoteOK returned 28 postings', metadata: { stage: 'boards', provider: 'remoteok', source: 'remoteok', count: 28, scanned: 1388 } },
  { event_type: 'run', message: 'Scanning RSS job feeds (Remotive, WeWorkRemotely)...', metadata: { stage: 'boards', provider: 'rss', source: 'rss' } },
  { event_type: 'ok', message: 'RSS feeds returned 33 postings', metadata: { stage: 'boards', provider: 'rss', source: 'rss', count: 33, scanned: 1421 } },
  { event_type: 'ok', message: 'Scanned 1,421 postings across 6 sources', metadata: { stage: 'search', scanned: 1421, total_scanned: 1421 } },
  { event_type: 'run', message: 'Applying profile filters: location=any, salary≥$0...', metadata: { stage: 'filter', scanned: 1421 } },
  { event_type: 'ok', message: 'Filtered to 81 matching roles (1340 eliminated)', metadata: { stage: 'filter', filtered: 81, scanned: 1421, pruned: 1340 } },
  { event_type: 'info', message: 'Prioritizing top 30 of 81 matching roles for deep scoring', metadata: { stage: 'filter', capped_from: 81, cap: 30, queued: 30, filtered: 81 } },
  { event_type: 'run', message: 'Verifying 60 postings are still live...', metadata: { stage: 'verify', total: 60, scanned: 1421, filtered: 81 } },
  { event_type: 'info', message: 'Pruned 5 dead/closed postings — 55 verified live', metadata: { stage: 'verify', verified: 55, pruned: 5, scanned: 1421, filtered: 81 } },
  { event_type: 'run', message: 'Deep-researching 30 companies and scoring roles...', metadata: { stage: 'score', queued: 30, scanned: 1421, filtered: 81, verified: 55, total: 30, eta_seconds: 360 } },
  { event_type: 'run', message: 'Researching Stripe — Senior ML Engineer…', metadata: { kind: 'research', stage: 'score', company: 'Stripe', role: 'Senior ML Engineer', url: 'https://boards.greenhouse.io/stripe', total: 30 } },
  { event_type: 'info', message: 'Still scoring Stripe — Senior ML Engineer… (8s in this role)', metadata: { kind: 'heartbeat', stage: 'score', company: 'Stripe', role: 'Senior ML Engineer', elapsed_job_sec: 8, index: 0, total: 30, scored: 0, eta_seconds: 352 } },
  { event_type: 'info', message: 'Scored Senior ML Engineer at Stripe — 3.8/5.0', metadata: { kind: 'score', stage: 'score', index: 1, total: 30, company: 'Stripe', role: 'Senior ML Engineer', score: 3.8, grade: 'C', scored: 1, eta_seconds: 338 } },
  { event_type: 'run', message: 'Researching Notion — Backend Engineer…', metadata: { kind: 'research', stage: 'score', company: 'Notion', role: 'Backend Engineer', total: 30 } },
  { event_type: 'star', message: '<strong>A match</strong>: Backend Engineer at Notion — 4.6/5.0', detail: 'Strong CV overlap and remote-first culture; level matches your target.', metadata: { kind: 'score', stage: 'score', index: 2, total: 30, company: 'Notion', role: 'Backend Engineer', score: 4.6, grade: 'A', scored: 2, eta_seconds: 312 } },
  { event_type: 'run', message: 'Researching Ramp — Staff Engineer…', metadata: { kind: 'research', stage: 'score', company: 'Ramp', role: 'Staff Engineer', total: 30 } },
  { event_type: 'star', message: '<strong>B match</strong>: Staff Engineer at Ramp — 4.2/5.0', detail: 'Comp likely competitive; slight seniority stretch.', metadata: { kind: 'score', stage: 'score', index: 3, total: 30, company: 'Ramp', role: 'Staff Engineer', score: 4.2, grade: 'B', scored: 3, eta_seconds: 284 } },
  { event_type: 'run', message: 'Researching Vercel — Frontend Engineer…', metadata: { kind: 'research', stage: 'score', company: 'Vercel', role: 'Frontend Engineer', total: 30 } },
  { event_type: 'info', message: 'Scored Frontend Engineer at Vercel — 3.4/5.0', metadata: { kind: 'score', stage: 'score', index: 4, total: 30, company: 'Vercel', role: 'Frontend Engineer', score: 3.4, grade: 'D', scored: 4, eta_seconds: 252 } },
  { event_type: 'run', message: 'Researching Linear — Product Engineer…', metadata: { kind: 'research', stage: 'score', company: 'Linear', role: 'Product Engineer', total: 30 } },
  { event_type: 'star', message: '<strong>A match</strong>: Product Engineer at Linear — 4.7/5.0', detail: 'Excellent archetype fit and strong legitimacy signals.', metadata: { kind: 'score', stage: 'score', index: 5, total: 30, company: 'Linear', role: 'Product Engineer', score: 4.7, grade: 'A', scored: 5, eta_seconds: 216 } },
  { event_type: 'star', message: '<strong>3 strong matches found</strong> (A/B grade) out of 30 scored', metadata: { stage: 'complete', strong_matches: 3, total_scored: 30, scored: 30, queued: 30 } },
  { event_type: 'ok', message: 'Mission complete', metadata: { stage: 'complete' } },
];

export default function MissionConsoleMockup() {
  const [n, setN] = useState(3);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    if (n >= SCRIPT.length) return;
    const t = setTimeout(() => setN((x) => Math.min(SCRIPT.length, x + 1)), 1100);
    return () => clearTimeout(t);
  }, [n, playing]);

  const startedAt = useMemo(() => new Date(Date.now() - 42_000).toISOString(), []);
  const events: MissionEventOut[] = SCRIPT.slice(0, n).map((s, i) => ({
    id: `evt-${i}`,
    mission_id: 'mock',
    event_type: s.event_type,
    message: s.message,
    detail: s.detail,
    metadata: s.metadata,
    created_at: new Date(Date.now() - (n - i) * 1100).toISOString(),
  }));

  const done = n >= SCRIPT.length;
  const status: MissionStreamStatus = n === 0 ? 'connecting' : done ? 'done' : 'running';
  const lastEventAt = events.length
    ? new Date(events[events.length - 1].created_at).getTime()
    : null;

  const mission = {
    id: 'mock', user_id: 'u', profile_id: 'p', title: 'AI Engineer',
    search_query: 'AI Engineer', status: done ? 'completed' : 'running',
    total_scanned: n > 9 ? 1421 : 0,
    total_filtered: n > 11 ? 30 : 0,
    total_matches: done ? 3 : 0,
    started_at: startedAt,
    completed_at: done ? new Date().toISOString() : undefined,
    created_at: startedAt,
    sources: ['exa', 'greenhouse', 'lever', 'ashby', 'remoteok', 'rss'],
  } as unknown as MissionOut;

  return (
    <div className="min-h-screen bg-[var(--bg)] p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => setPlaying((p) => !p)} className="rounded-md border border-[var(--border-bright)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--text)]">
            {playing ? 'Pause' : 'Play'}
          </button>
          <button onClick={() => { setN(0); setPlaying(true); }} className="rounded-md border border-[var(--border-bright)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--text)]">
            Restart
          </button>
          <input type="range" min={0} max={SCRIPT.length} value={n} onChange={(e) => { setPlaying(false); setN(Number(e.target.value)); }} className="flex-1" />
          <span className="text-sm text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>{n}/{SCRIPT.length}</span>
        </div>
        <MissionFeed events={events} status={status} mission={mission} missionTitle="AI Engineer" lastEventAt={lastEventAt} onRefreshStall={() => setN((x) => Math.min(SCRIPT.length, x + 1))} />
      </div>
    </div>
  );
}
