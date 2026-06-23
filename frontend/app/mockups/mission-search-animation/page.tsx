import { MissionFeed } from '@/components/mission/mission-feed';
import type { MissionEventOut } from '@/lib/types';

const missionId = 'mock-mission-search-animation';

const sampleEvents: MissionEventOut[] = [
  {
    id: 'mock-01',
    mission_id: missionId,
    event_type: 'ok',
    message: 'Candidate profile loaded - 0 archetypes detected',
    created_at: '2026-06-19T20:22:51.000Z',
  },
  {
    id: 'mock-02',
    mission_id: missionId,
    event_type: 'run',
    message: "Scanning Exa semantic web search for: 'ai engineer role with 4 years of experience'...",
    created_at: '2026-06-19T20:22:52.000Z',
  },
  {
    id: 'mock-03',
    mission_id: missionId,
    event_type: 'ok',
    message: 'Exa returned 100 postings',
    created_at: '2026-06-19T20:22:53.000Z',
  },
  {
    id: 'mock-04',
    mission_id: missionId,
    event_type: 'run',
    message: 'Scanning ATS feeds: Greenhouse, Lever, Ashby...',
    created_at: '2026-06-19T20:22:53.000Z',
  },
  {
    id: 'mock-05',
    mission_id: missionId,
    event_type: 'ok',
    message: 'ATS feeds returned 1184 postings',
    detail: 'greenhouse: 954 | lever: 118 | ashby: 112',
    created_at: '2026-06-19T20:23:03.000Z',
  },
  {
    id: 'mock-06',
    mission_id: missionId,
    event_type: 'run',
    message: 'Scanning RSS job feeds (Remotive, WeWorkRemotely)...',
    created_at: '2026-06-19T20:23:04.000Z',
  },
  {
    id: 'mock-07',
    mission_id: missionId,
    event_type: 'ok',
    message: 'RSS feeds returned 45 postings',
    created_at: '2026-06-19T20:23:06.000Z',
  },
  {
    id: 'mock-08',
    mission_id: missionId,
    event_type: 'ok',
    message: 'Scanned 1,329 postings across 6 sources',
    created_at: '2026-06-19T20:23:06.000Z',
  },
  {
    id: 'mock-09',
    mission_id: missionId,
    event_type: 'run',
    message: 'Applying profile filters: location=any, salary>$0...',
    created_at: '2026-06-19T20:23:06.000Z',
  },
  {
    id: 'mock-10',
    mission_id: missionId,
    event_type: 'ok',
    message: 'Filtered to 88 matching roles (1241 eliminated)',
    created_at: '2026-06-19T20:23:07.000Z',
  },
  {
    id: 'mock-11',
    mission_id: missionId,
    event_type: 'info',
    message: 'Prioritizing top 30 of 88 matching roles for deep scoring',
    created_at: '2026-06-19T20:23:07.000Z',
  },
  {
    id: 'mock-12',
    mission_id: missionId,
    event_type: 'run',
    message: 'Verifying 60 postings are still live...',
    created_at: '2026-06-19T20:23:07.000Z',
  },
  {
    id: 'mock-13',
    mission_id: missionId,
    event_type: 'ok',
    message: 'Pruned 8 dead/closed postings - 52 verified live',
    created_at: '2026-06-19T20:23:13.000Z',
  },
  {
    id: 'mock-14',
    mission_id: missionId,
    event_type: 'run',
    message: 'Deep-researching 30 companies and scoring roles...',
    created_at: '2026-06-19T20:23:15.000Z',
  },
  {
    id: 'mock-15',
    mission_id: missionId,
    event_type: 'star',
    message: 'B match found: Applied AI Engineer at Anthropic - 4.3/5.0',
    detail:
      "This job is a strong match because the candidate's Python and AI engineering work align with the role and company signals.",
    created_at: '2026-06-19T20:24:18.000Z',
  },
  {
    id: 'mock-16',
    mission_id: missionId,
    event_type: 'star',
    message: 'B match found: Applied AI Engineer, CyberSecurity at Mistral - 4.3/5.0',
    detail:
      'Strong alignment with AI systems and security requirements. Compensation competitiveness still needs review.',
    created_at: '2026-06-19T20:24:32.000Z',
  },
];

export default function MissionSearchAnimationMockupPage() {
  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)] sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[1.4px] text-[var(--cyan)]">
              Design mockup
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.8px]">
              Mission search anticipation state
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted2)]">
              Static event data, live running state. Use this to review the
              internet-search animation without auth, SSE, or backend seeding.
            </p>
          </div>
          <a
            href="/mockups/mission-search-animation"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted2)] transition-colors hover:border-[var(--cyan)] hover:text-[var(--text)]"
          >
            Stable mockup URL
          </a>
        </header>

        <MissionFeed events={sampleEvents} status="running" />

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-sm text-[var(--muted2)]">
            Claude hookup note: wire backend SSE events in the documented loop
            under <code className="font-mono text-[var(--text)]">frontend/.claude/mission-search-animation-handoff.md</code>.
          </p>
        </section>
      </div>
    </main>
  );
}
