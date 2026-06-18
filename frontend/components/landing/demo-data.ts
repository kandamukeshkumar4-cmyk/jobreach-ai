// Hardcoded, SIMULATED mission run for the landing-page demo console.
// This does NOT hit the real API — it is purely for the marketing illustration.

import type { EventType, Grade } from '@/lib/types';

export interface DemoFeedItem {
  /** Visual type — drives icon + color. */
  type: Extract<EventType, 'run' | 'ok' | 'star' | 'info'>;
  /** Main line. May contain a `<strong>`-style emphasis token wrapped in **…**. */
  message: string;
  /** Optional secondary detail line. */
  detail?: string;
  /** ms to wait AFTER the previous item before showing this one. */
  delay: number;
}

export interface DemoMatch {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  grade: Grade;
  /** 0–5 scale, matching ScoreRing/GradeBadge expectations. */
  score: number;
  whyFit: string;
  tags: { label: string; tone: 'good' | 'flag' | 'neutral' }[];
}

// The simulated agent feed. Roughly ~14s end-to-end so visitors see a full run.
export const DEMO_FEED: DemoFeedItem[] = [
  {
    type: 'run',
    message: 'Mission accepted — **Senior Backend Engineer**, Remote EU',
    detail: 'Parsing profile · 11 years experience · Go, Python, Postgres, Kafka',
    delay: 300,
  },
  {
    type: 'info',
    message: 'Sourcing across **10,000+ sources**',
    detail: 'Exa semantic search · Greenhouse / Lever / Ashby feeds · 23 RSS streams',
    delay: 900,
  },
  {
    type: 'ok',
    message: 'Scanned **2,140 postings** · filtered to 38 plausible roles',
    delay: 1100,
  },
  {
    type: 'run',
    message: 'Grading on **10 dimensions** with cited evidence',
    detail: 'CV match · archetype fit · seniority · comp · culture · legitimacy',
    delay: 1000,
  },
  {
    type: 'info',
    message: 'Reading JD for **Lumen Systems** with Jina Reader',
    detail: 'Cross-referencing GitHub repos to infer real tech stack',
    delay: 1000,
  },
  {
    type: 'ok',
    message: 'Company research complete — funding, sentiment, layoff signals',
    delay: 900,
  },
  {
    type: 'star',
    message: 'Strong match found — **Lumen Systems** · Grade A',
    detail: 'Stack aligns 9/10 · Series B, hiring up · Glassdoor 4.4',
    delay: 1000,
  },
  {
    type: 'star',
    message: 'Strong match found — **Northwind Labs** · Grade A',
    delay: 800,
  },
  {
    type: 'ok',
    message: 'Match found — **Cobalt Data** · Grade B',
    delay: 800,
  },
  {
    type: 'info',
    message: 'Flagged **2 ghost postings** — re-listed 90+ days, discarded',
    delay: 900,
  },
  {
    type: 'ok',
    message: 'Mission complete — **3 vetted matches** ready, resumes queued',
    detail: 'Elapsed 7m 52s · every grade traceable to the JD + your profile',
    delay: 1000,
  },
];

export const DEMO_MATCHES: DemoMatch[] = [
  {
    id: 'demo-lumen',
    title: 'Senior Backend Engineer',
    company: 'Lumen Systems',
    location: 'Remote · EU',
    salary: '€95,000 – €120,000',
    grade: 'A',
    score: 4.6,
    whyFit:
      'Your Go + Kafka event-pipeline work maps directly to their core platform. Series B with headcount growth and no freeze signals.',
    tags: [
      { label: 'Stack 9/10', tone: 'good' },
      { label: 'Hiring up', tone: 'good' },
      { label: 'Glassdoor 4.4', tone: 'good' },
    ],
  },
  {
    id: 'demo-northwind',
    title: 'Staff Backend Engineer',
    company: 'Northwind Labs',
    location: 'Remote · EU',
    salary: '€110,000 – €135,000',
    grade: 'A',
    score: 4.4,
    whyFit:
      'Distributed-systems depth matches their scaling mandate. Comp is above your target floor and the archetype fit is high.',
    tags: [
      { label: 'Comp above target', tone: 'good' },
      { label: 'Archetype fit', tone: 'good' },
      { label: 'Profitable', tone: 'good' },
    ],
  },
  {
    id: 'demo-cobalt',
    title: 'Backend Engineer, Platform',
    company: 'Cobalt Data',
    location: 'Remote · EU',
    salary: '€80,000 – €100,000',
    grade: 'B',
    score: 3.7,
    whyFit:
      'Solid stack overlap, but seniority skews one level junior and comp sits at the low end of your range.',
    tags: [
      { label: 'Stack 7/10', tone: 'good' },
      { label: 'Seniority −1', tone: 'flag' },
      { label: 'Comp low', tone: 'flag' },
    ],
  },
];
