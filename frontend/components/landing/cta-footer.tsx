import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function CtaFooter() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24 pt-8">
      <div className="overflow-hidden rounded-2xl border border-[var(--border-bright)] bg-[var(--surface)] px-6 py-14 text-center sm:px-12 sm:py-16">
        <h2 className="mx-auto max-w-3xl text-[26px] font-extrabold leading-[1.15] tracking-[-1px] text-[var(--text)] sm:text-[36px]">
          Your competition is using AI to screen you.
          <br className="hidden sm:block" />{' '}
          <span className="text-[var(--cyan)]">
            Use AI to screen them back.
          </span>
        </h2>

        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--muted2)]">
          Deploy an autonomous agent on your job search tonight. Wake up to
          vetted, graded, research-backed matches.
        </p>

        <div className="mt-9">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-[var(--cyan)] px-7 py-3 text-[15px] font-semibold tracking-[-0.2px] text-[#07071a] transition-[filter] duration-150 hover:brightness-110 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            Start a Mission
            <ArrowRight size={17} strokeWidth={2.25} />
          </Link>
        </div>
      </div>

      <footer className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[var(--border)] pt-8 text-[13px] text-[var(--muted)] sm:flex-row">
        <span className="font-bold tracking-[-0.5px] text-[var(--muted2)]">
          JobReach AI
        </span>
        <span>The AI agent that does the job search for you.</span>
      </footer>
    </section>
  );
}

export default CtaFooter;
