'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const STATS: { value: string; label: string }[] = [
  { value: '10,000+', label: 'sources' },
  { value: '10', label: 'dimensions' },
  { value: '~8 min', label: 'per mission' },
  { value: 'A–F', label: 'graded' },
];

export function Hero() {
  return (
    <section className="relative mx-auto max-w-5xl px-6 pt-20 pb-16 text-center sm:pt-28 sm:pb-20">
      {/* Pulsing status badge */}
      <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--border-bright)] bg-[var(--surface)] px-3.5 py-1.5">
        <span className="relative inline-flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--cyan)] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--cyan)]" />
        </span>
        <span className="text-[13px] font-medium text-[var(--muted2)]">
          Agent actively scanning 47 job portals
        </span>
      </div>

      <h1 className="mx-auto max-w-4xl text-[40px] font-extrabold leading-[1.05] tracking-[-1.5px] text-[var(--text)] sm:text-[54px]">
        The AI Agent That Does the{' '}
        <span className="text-[var(--cyan)]">Job Search</span> For You
      </h1>

      <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-[var(--muted2)] sm:text-[17px]">
        Not a chatbot. Not another search box. JobReach is an autonomous agent
        that scans the whole internet, grades every role on 10 dimensions, and
        researches each company — then shows you exactly how it reached every
        verdict. You watch it work; it does the work.
      </p>

      {/* CTAs */}
      <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/signup"
          className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--cyan)] px-6 py-3 text-[15px] font-semibold tracking-[-0.2px] text-[#07071a] transition-[filter] duration-150 hover:brightness-110 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] sm:w-auto"
        >
          Start a Mission
          <ArrowRight size={17} strokeWidth={2.25} />
        </Link>
        <a
          href="#demo"
          className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-6 py-3 text-[15px] font-semibold tracking-[-0.2px] text-[var(--text)] transition-colors duration-150 hover:border-[var(--border-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] sm:w-auto"
        >
          Watch Agent Work
        </a>
      </div>

      {/* Stats row */}
      <div className="mx-auto mt-12 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-4 text-left sm:gap-x-10">
        {STATS.map((stat, i) => (
          <div key={stat.label} className="flex items-center gap-6 sm:gap-10">
            <div>
              <div className="font-mono text-[18px] font-bold tracking-[-0.5px] text-[var(--text)]">
                {stat.value}
              </div>
              <div className="text-[12px] uppercase tracking-[0.6px] text-[var(--muted)]">
                {stat.label}
              </div>
            </div>
            {i < STATS.length - 1 && (
              <span
                className="hidden h-8 w-px bg-[var(--border)] sm:block"
                aria-hidden
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default Hero;
