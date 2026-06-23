import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';

function LinkedInIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
      <rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
    </svg>
  );
}

function GitLabIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.52L23 13.45a.84.84 0 0 1-.35.94z" />
    </svg>
  );
}

export function CtaFooter() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24 pt-8">
      {/* CTA banner */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border-bright)] bg-[var(--surface)] px-6 py-14 text-center sm:px-12 sm:py-16">
        <h2 className="mx-auto max-w-3xl text-[26px] font-extrabold leading-[1.15] tracking-[-1px] text-[var(--text)] sm:text-[36px]">
          See it do in minutes what takes a job seeker a weekend.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--muted2)]">
          627 roles scanned. Top match graded and tailored. Zero manual work.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-[var(--cyan)] px-7 py-3 text-[15px] font-semibold tracking-[-0.2px] text-[#07071a] transition-[filter] hover:brightness-110 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)]"
          >
            Open the live app
            <ArrowRight size={17} strokeWidth={2.25} />
          </Link>
          <a
            href="mailto:kandadamukesh8@gmail.com"
            className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-7 py-3 text-[15px] font-semibold text-[var(--text)] transition-colors hover:border-[var(--border-bright)]"
          >
            Get in touch
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-[var(--border)] pt-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div>
            <span className="font-bold tracking-[-0.5px] text-[var(--muted2)]">
              JobReach AI
            </span>
            <span className="ml-2 text-[13px] text-[var(--muted)]">
              · Built in India · © 2026 Mukesh
            </span>
          </div>

          <div className="flex items-center gap-5 text-[13px] text-[var(--muted)]">
            <Link
              href="/signup"
              className="transition-colors hover:text-[var(--text)]"
            >
              Open the live app
            </Link>
            <a
              href="mailto:kandadamukesh8@gmail.com"
              className="flex items-center gap-1 transition-colors hover:text-[var(--text)]"
            >
              <Mail size={13} strokeWidth={2} />
              Email
            </a>
            <a
              href="https://gitlab.com/mukeshkumar-kanda"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 transition-colors hover:text-[var(--text)]"
            >
              <GitLabIcon />
              GitLab
            </a>
            <a
              href="https://www.linkedin.com/in/mukesh-gen-ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 transition-colors hover:text-[var(--text)]"
            >
              <LinkedInIcon />
              LinkedIn
            </a>
          </div>
        </div>
      </footer>
    </section>
  );
}

export default CtaFooter;
