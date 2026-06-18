import type { LucideIcon } from 'lucide-react';
import {
  Globe,
  Target,
  Building2,
  FileText,
  CalendarClock,
  GraduationCap,
} from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  poweredBy: string;
}

const FEATURES: Feature[] = [
  {
    icon: Globe,
    title: 'Whole-internet sourcing',
    body: 'Exa semantic search, Jina Reader, Greenhouse / Lever / Ashby ATS feeds, LinkedIn, Wellfound, and 23 RSS sources — far beyond any single job board.',
    poweredBy: 'Agent-Reach',
  },
  {
    icon: Target,
    title: 'A–F on 10 dimensions',
    body: 'CV match, archetype fit, seniority, comp research, cultural signals, posting legitimacy. Every grade cites the JD + your profile, so nothing is a black box.',
    poweredBy: '10-dimension rubric',
  },
  {
    icon: Building2,
    title: 'Deep company research',
    body: 'Funding, Glassdoor sentiment, tech stack inferred from repos, layoff and freeze signals, and competitor context — gathered before you ever apply.',
    poweredBy: 'Research agent',
  },
  {
    icon: FileText,
    title: 'ATS-tailored resumes',
    body: 'A 16-step pipeline produces one resume per role — ethically reframed to the JD, never fabricated. Tuned to pass the screen and read like you.',
    poweredBy: '16-step pipeline',
  },
  {
    icon: CalendarClock,
    title: 'Scheduled autonomous runs',
    body: 'Set it to scan every morning and wake up to a fresh batch of vetted matches. The agent works while you sleep, on your schedule.',
    poweredBy: 'Cron missions',
  },
  {
    icon: GraduationCap,
    title: 'Interview prep that compounds',
    body: '6-axis company research, a STAR + Reflection story bank, and audience-segmented prep that gets sharper with every role you pursue.',
    poweredBy: 'Prep engine',
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <div className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-colors duration-150 hover:border-[var(--border-bright)]">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--card)] text-[var(--cyan)] transition-colors duration-150 group-hover:border-[var(--border-bright)]">
        <Icon size={19} strokeWidth={2} aria-hidden />
      </div>
      <h3 className="text-[16px] font-bold tracking-[-0.4px] text-[var(--text)]">
        {feature.title}
      </h3>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted2)]">
        {feature.body}
      </p>
      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.4px] text-[var(--muted)]">
        [Powered by {feature.poweredBy}]
      </p>
    </div>
  );
}

export function FeatureGrid() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
      <div className="mb-10 text-center">
        <h2 className="text-[28px] font-extrabold tracking-[-1px] text-[var(--text)] sm:text-[34px]">
          One agent. The entire pipeline.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-[var(--muted2)]">
          From sourcing to interview prep — every stage handled, every decision
          traceable.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    </section>
  );
}

export default FeatureGrid;
