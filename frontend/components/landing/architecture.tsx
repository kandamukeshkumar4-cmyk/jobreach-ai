const LAYERS = [
  { layer: 'Frontend', stack: 'Next.js · React · SSE streaming' },
  { layer: 'API', stack: 'FastAPI · WebSockets · Auth' },
  { layer: 'Queue', stack: 'Celery · Redis · Beat scheduler' },
  { layer: 'AI', stack: 'Llama 3.3-70B · 3.1-8B via NVIDIA NIM' },
  { layer: 'Ingestion', stack: '8 Sources · Playwright · requests' },
  { layer: 'Storage', stack: 'Supabase · PostgreSQL · pgvector' },
];

const HIGHLIGHTS = [
  'Distributed Celery + Redis queue — async task orchestration at scale',
  'Multi-model routing — Llama 3.3-70B for scoring & research, 3.1-8B for parsing & tailoring via NVIDIA NIM',
  'Real-time SSE streaming — 89 live events per session, zero polling',
  '8-source ingestion with conservative liveness-verified filtering',
  'Full-stack solo — Next.js · FastAPI · Supabase · Vercel · Redis',
];

export function Architecture() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
      <div className="mb-10 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.8px] text-[var(--cyan)]">
          Architecture
        </span>
        <h2 className="mt-3 text-[28px] font-extrabold tracking-[-1px] text-[var(--text)] sm:text-[34px]">
          This isn't a prompt wrapper.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-[var(--muted2)]">
          A distributed, multi-model agent system — the architecture is the
          product.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Highlights */}
        <div className="space-y-3">
          {HIGHLIGHTS.map((h) => (
            <div
              key={h}
              className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cyan)]" />
              <span className="text-[14px] leading-relaxed text-[var(--muted2)]">{h}</span>
            </div>
          ))}
        </div>

        {/* System layers */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.8px] text-[var(--muted)]">
              System Layers
            </span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {LAYERS.map(({ layer, stack }) => (
              <div key={layer} className="flex items-center gap-4 px-4 py-3">
                <span className="w-20 shrink-0 font-mono text-[12px] font-bold text-[var(--cyan)]">
                  {layer}
                </span>
                <span className="text-[13px] text-[var(--muted2)]">{stack}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Architecture;
