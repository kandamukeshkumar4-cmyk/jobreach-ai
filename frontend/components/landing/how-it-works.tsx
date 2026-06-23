const STEPS = [
  { num: '01', title: 'Scan', detail: '8 sources' },
  { num: '02', title: 'Filter', detail: 'Verified only' },
  { num: '03', title: 'Verify', detail: 'Liveness check' },
  { num: '04', title: 'Score', detail: '6D · A–F' },
  { num: '05', title: 'Research', detail: '12+ signals' },
  { num: '06', title: 'Tailor', detail: 'Per-role docs' },
  { num: '07', title: 'Track', detail: 'Auto Kanban' },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-5xl scroll-mt-16 px-6 py-16 sm:py-20"
    >
      <div className="mb-10 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.8px] text-[var(--cyan)]">
          How it works
        </span>
        <h2 className="mt-3 text-[28px] font-extrabold tracking-[-1px] text-[var(--text)] sm:text-[34px]">
          From brief to application in minutes.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-[var(--muted2)]">
          A single coherent loop — no human in the pipeline between scanning
          and submitting.
        </p>
      </div>

      {/* Pipeline steps */}
      <div className="flex flex-wrap items-center justify-center gap-0">
        {STEPS.map((step, i) => (
          <div key={step.num} className="flex items-center">
            <div className="flex flex-col items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-center transition-colors hover:border-[var(--border-bright)]">
              <span className="font-mono text-[11px] text-[var(--muted)]">{step.num}</span>
              <span className="mt-1 text-[15px] font-bold tracking-[-0.3px] text-[var(--text)]">
                {step.title}
              </span>
              <span className="mt-0.5 font-mono text-[10px] text-[var(--cyan)]">
                {step.detail}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className="mx-1 text-[var(--border)] text-lg">→</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default HowItWorks;
