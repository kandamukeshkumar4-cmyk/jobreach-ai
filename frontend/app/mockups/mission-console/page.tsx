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
  { event_type: 'ok', message: 'Candidate profile loaded — 3 archetypes detected' },
  { event_type: 'run', message: "Scanning Exa semantic web search for: 'AI Engineer'..." },
  { event_type: 'ok', message: 'Exa returned 1016 postings' },
  { event_type: 'run', message: 'Scanning ATS feeds: Greenhouse, Lever, Ashby...' },
  { event_type: 'ok', message: 'ATS feeds returned 344 postings', detail: 'greenhouse: 116 | lever: 117 | ashby: 111' },
  { event_type: 'run', message: 'Scanning RemoteOK for US-eligible remote roles...' },
  { event_type: 'ok', message: 'RemoteOK returned 28 postings' },
  { event_type: 'run', message: 'Scanning RSS job feeds (Remotive, WeWorkRemotely)...' },
  { event_type: 'ok', message: 'RSS feeds returned 33 postings' },
  { event_type: 'ok', message: 'Scanned 1,421 postings across 6 sources', metadata: { total_scanned: 1421 } },
  { event_type: 'run', message: 'Applying profile filters: location=any, salary≥$0...' },
  { event_type: 'ok', message: 'Filtered to 81 matching roles (1340 eliminated)' },
  { event_type: 'info', message: 'Prioritizing top 30 of 81 matching roles for deep scoring' },
  { event_type: 'run', message: 'Verifying 60 postings are still live...' },
  { event_type: 'info', message: 'Pruned 5 dead/closed postings — 55 verified live' },
  { event_type: 'run', message: 'Deep-researching 30 companies and scoring roles...' },
  { event_type: 'run', message: 'Researching Stripe — Senior ML Engineer…', metadata: { kind: 'research', company: 'Stripe', role: 'Senior ML Engineer' } },
  { event_type: 'info', message: 'Scored Senior ML Engineer at Stripe — 3.8/5.0', metadata: { kind: 'score', index: 1, total: 30, company: 'Stripe', role: 'Senior ML Engineer', score: 3.8, grade: 'C' } },
  { event_type: 'run', message: 'Researching Notion — Backend Engineer…', metadata: { kind: 'research', company: 'Notion', role: 'Backend Engineer' } },
  { event_type: 'star', message: '<strong>A match</strong>: Backend Engineer at Notion — 4.6/5.0', detail: 'Strong CV overlap and remote-first culture; level matches your target.', metadata: { kind: 'score', index: 2, total: 30, company: 'Notion', role: 'Backend Engineer', score: 4.6, grade: 'A' } },
  { event_type: 'run', message: 'Researching Ramp — Staff Engineer…', metadata: { kind: 'research', company: 'Ramp', role: 'Staff Engineer' } },
  { event_type: 'star', message: '<strong>B match</strong>: Staff Engineer at Ramp — 4.2/5.0', detail: 'Comp likely competitive; slight seniority stretch.', metadata: { kind: 'score', index: 3, total: 30, company: 'Ramp', role: 'Staff Engineer', score: 4.2, grade: 'B' } },
  { event_type: 'run', message: 'Researching Vercel — Frontend Engineer…', metadata: { kind: 'research', company: 'Vercel', role: 'Frontend Engineer' } },
  { event_type: 'info', message: 'Scored Frontend Engineer at Vercel — 3.4/5.0', metadata: { kind: 'score', index: 4, total: 30, company: 'Vercel', role: 'Frontend Engineer', score: 3.4, grade: 'D' } },
  { event_type: 'run', message: 'Researching Linear — Product Engineer…', metadata: { kind: 'research', company: 'Linear', role: 'Product Engineer' } },
  { event_type: 'star', message: '<strong>A match</strong>: Product Engineer at Linear — 4.7/5.0', detail: 'Excellent archetype fit and strong legitimacy signals.', metadata: { kind: 'score', index: 5, total: 30, company: 'Linear', role: 'Product Engineer', score: 4.7, grade: 'A' } },
  { event_type: 'star', message: '<strong>3 strong matches found</strong> (A/B grade) out of 30 scored', metadata: { strong_matches: 3, total_scored: 30 } },
  { event_type: 'ok', message: 'Mission complete' },
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
        <MissionFeed events={events} status={status} mission={mission} missionTitle="AI Engineer" />
      </div>
    </div>
  );
}
