import { MissionConsole } from '@/components/landing/mission-console';

export function DemoSection() {
  return (
    <section
      id="demo"
      className="mx-auto max-w-5xl scroll-mt-12 px-6 py-16 sm:py-20"
    >
      <div className="mb-8 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.8px] text-[var(--cyan)]">
          Live demo · simulated run
        </span>
        <h2 className="mt-3 text-[28px] font-extrabold tracking-[-1px] text-[var(--text)] sm:text-[34px]">
          Watch the agent work
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-[var(--muted2)]">
          This is the actual mission console — every line is a step the agent
          takes in the open. Sourcing, grading, research, then vetted matches.
        </p>
      </div>

      <MissionConsole />
    </section>
  );
}

export default DemoSection;
