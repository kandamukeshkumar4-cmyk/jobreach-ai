'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const TECH_STACK = ['NVIDIA NIM', 'Llama 3.3-70B', 'Supabase', 'Vercel', 'Celery · Redis'];

export function Hero() {
  return (
    <section className="relative mx-auto max-w-5xl px-6 pt-20 pb-16 text-center sm:pt-28 sm:pb-20">
      {/* Personal badge */}
      <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--border-bright)] bg-[var(--surface)] px-3.5 py-1.5">
        <span className="relative inline-flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--cyan)] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--cyan)]" />
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.6px] text-[var(--muted2)]">
          Built solo by Mukesh · Full-stack + AI Engineer
        </span>
      </div>

      <h1 className="mx-auto max-w-4xl text-[40px] font-extrabold leading-[1.05] tracking-[-1.5px] text-[var(--text)] sm:text-[54px]">
        An autonomous AI agent that runs your entire{' '}
        <span className="text-[var(--cyan)]">job search</span>.
      </h1>

      <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-[var(--muted2)] sm:text-[17px]">
        Not a chatbot you talk to — an agent that scans, scores, researches,
        and tailors, while you watch it work.
      </p>

      {/* CTAs */}
      <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/signup"
          className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--cyan)] px-6 py-3 text-[15px] font-semibold tracking-[-0.2px] text-[#07071a] transition-[filter] hover:brightness-110 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)] sm:w-auto"
        >
          Open the live app
          <ArrowRight size={17} strokeWidth={2.25} />
        </Link>
        <a
          href="#demo"
          className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-6 py-3 text-[15px] font-semibold tracking-[-0.2px] text-[var(--text)] transition-colors hover:border-[var(--border-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)] sm:w-auto"
        >
          Watch it work
        </a>
      </div>

      {/* Tech stack */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
        {TECH_STACK.map((tech, i) => (
          <span key={tech} className="flex items-center gap-2">
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 font-mono text-[11px] tracking-[-0.1px] text-[var(--muted2)]">
              {tech}
            </span>
            {i < TECH_STACK.length - 1 && (
              <span className="h-1 w-1 rounded-full bg-[var(--border)]" />
            )}
          </span>
        ))}
      </div>

      {/* Stats row */}
      <p className="mt-6 font-mono text-[12px] uppercase tracking-[0.6px] text-[var(--muted)]">
        Matches graded A–F across 6 dimensions · top match 4.3/5
      </p>

      {/* Mini live-feed card */}
      <div className="mx-auto mt-12 max-w-sm rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] p-4 text-left">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--green)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--green)]" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--muted)]">
              jobreach · mission-runner · live
            </span>
          </div>
          <span className="rounded-full bg-[var(--green)]/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.6px] text-[var(--green)]">
            ACTIVE
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="rounded-lg bg-[var(--card)] p-2.5">
            <div className="font-mono text-[18px] font-bold text-[var(--text)]">627</div>
            <div className="font-mono text-[10px] text-[var(--muted)]">roles scanned</div>
          </div>
          <div className="rounded-lg bg-[var(--card)] p-2.5">
            <div className="font-mono text-[18px] font-bold text-[var(--cyan)]">B · 4.3/5</div>
            <div className="font-mono text-[10px] text-[var(--muted)]">top match grade</div>
          </div>
        </div>

        <div className="space-y-1.5 font-mono text-[10px]">
          {[
            { tag: 'MTCH', text: 'Agentic AI Eng @ Eigen Labs · B · 4.3/5', color: 'text-[var(--cyan)]' },
            { tag: 'TLOR', text: 'Resume tailored · cover letter written', color: 'text-[var(--green)]' },
            { tag: 'TRAK', text: 'Application logged · mission complete ✓', color: 'text-[var(--muted2)]' },
          ].map(({ tag, text, color }) => (
            <div key={tag} className="flex items-start gap-2">
              <span className={`shrink-0 ${color}`}>{tag}</span>
              <span className="text-[var(--muted)]">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Hero;
