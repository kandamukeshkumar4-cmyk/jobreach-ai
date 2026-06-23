const STATS = [
  { value: '4.3/5', label: 'Top match graded across 6 weighted dimensions', sub: 'Grade B' },
  { value: '627', label: 'jobs scanned / mission' },
  { value: '8', label: 'job sources ingested' },
  { value: '35K+', label: 'companies searchable' },
  { value: '70B', label: 'param scoring model' },
  { value: '89', label: 'live events / session' },
];

export function StatsSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
      <div className="mb-10 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.8px] text-[var(--cyan)]">
          Quality First
        </span>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
        {STATS.map((stat) => (
          <div
            key={stat.value}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <div className="font-mono text-[28px] font-extrabold tracking-[-1px] text-[var(--text)]">
              {stat.value}
            </div>
            {stat.sub && (
              <div className="mt-0.5 font-mono text-[11px] text-[var(--cyan)]">
                {stat.sub}
              </div>
            )}
            <div className="mt-1 text-[13px] leading-snug text-[var(--muted2)]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default StatsSection;
