import { Globe, Target, Building2, FileText, LayoutGrid } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  tag: string;
}

const FEATURES: Feature[] = [
  {
    icon: Globe,
    title: 'Mission Scanning & Matching',
    body: '8+ job sources scanned per mission. Every result graded, not just listed.',
    tag: 'Agent-Reach',
  },
  {
    icon: Target,
    title: '6-Dimension Scoring Engine',
    body: 'Skills, Culture, Growth, Location, Comp, and Fit — weighted and graded A–F per role.',
    tag: '6D rubric',
  },
  {
    icon: Building2,
    title: 'Company Research & Intelligence',
    body: '12+ signals per company: funding stage, team size, tech stack, news sentiment.',
    tag: 'Research agent',
  },
  {
    icon: FileText,
    title: 'Document Studio',
    body: 'Tailored resumes and cover letters generated per role — contextually written, not templated.',
    tag: '16-step pipeline',
  },
  {
    icon: LayoutGrid,
    title: 'Application Tracker',
    body: 'Kanban board auto-populated as the agent works. Zero manual entry required.',
    tag: 'Auto Kanban',
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <div className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-colors hover:border-[var(--border-bright)]">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--card)] text-[var(--cyan)] transition-colors group-hover:border-[var(--border-bright)]">
        <Icon size={19} strokeWidth={2} aria-hidden />
      </div>
      <h3 className="text-[16px] font-bold tracking-[-0.4px] text-[var(--text)]">
        {feature.title}
      </h3>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted2)]">
        {feature.body}
      </p>
      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.4px] text-[var(--muted)]">
        [{feature.tag}]
      </p>
    </div>
  );
}

export function FeatureGrid() {
  return (
    <section
      id="features"
      className="mx-auto max-w-5xl scroll-mt-16 px-6 py-16 sm:py-20"
    >
      <div className="mb-10 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.8px] text-[var(--cyan)]">
          Capabilities
        </span>
        <h2 className="mt-3 text-[28px] font-extrabold tracking-[-1px] text-[var(--text)] sm:text-[34px]">
          Five tools. One mission. No manual work.
        </h2>
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
