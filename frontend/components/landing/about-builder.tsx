import Image from 'next/image';
import Link from 'next/link';
import { Mail } from 'lucide-react';

function LinkedInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
      <rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
    </svg>
  );
}

function GitLabIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.52L23 13.45a.84.84 0 0 1-.35.94z"/>
    </svg>
  );
}

export function AboutBuilder() {
  return (
    <section
      id="about"
      className="mx-auto max-w-5xl scroll-mt-16 px-6 py-16 sm:py-20"
    >
      <div className="mb-10 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.8px] text-[var(--cyan)]">
          About the Builder
        </span>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-[var(--muted2)]">
          I designed and shipped this entire distributed, multi-model agent
          system solo — frontend to infra.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 items-center">
        {/* Photo */}
        <div className="flex justify-center md:justify-end">
          <div className="relative w-56 overflow-hidden rounded-2xl border border-[var(--border-bright)]">
            <Image
              src="/mukesh-photo.png"
              alt="Mukesh — Full-stack + AI Engineer"
              width={224}
              height={298}
              className="object-cover w-full"
              priority
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--bg)] to-transparent px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.4px] text-[var(--muted2)]">
                Full-stack + AI Engineer
              </span>
            </div>
          </div>
        </div>

        {/* Bio & links */}
        <div>
          <h2 className="text-[26px] font-extrabold tracking-[-1px] text-[var(--text)] sm:text-[32px]">
            I'm Mukesh.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--muted2)]">
            A full-stack + AI engineer who builds end-to-end systems, not
            prototypes. JobReach is proof: a production-grade autonomous agent
            with a distributed queue, multi-model routing, real-time streaming,
            and a polished frontend — all shipped solo.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted2)]">
            Here's what I can build for your team.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="mailto:kandadamukesh8@gmail.com"
              className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--cyan)] px-5 py-2.5 text-[14px] font-semibold tracking-[-0.2px] text-[#07071a] transition-[filter] hover:brightness-110"
            >
              <Mail size={15} strokeWidth={2.25} />
              Get in touch
            </a>
            <a
              href="/mukesh-resume.docx"
              download
              className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-[14px] font-semibold text-[var(--text)] transition-colors hover:border-[var(--border-bright)]"
            >
              Download resume
            </a>
            <a
              href="https://gitlab.com/mukeshkumar-kanda"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-[14px] font-semibold text-[var(--text)] transition-colors hover:border-[var(--border-bright)]"
            >
              <GitLabIcon />
              View on GitLab
            </a>
          </div>

          <div className="mt-5 flex items-center gap-4">
            <a
              href="https://www.linkedin.com/in/mukesh-gen-ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[13px] text-[var(--muted2)] transition-colors hover:text-[var(--text)]"
            >
              <LinkedInIcon />
              LinkedIn
            </a>
            <a
              href="mailto:kandadamukesh8@gmail.com"
              className="flex items-center gap-1.5 text-[13px] text-[var(--muted2)] transition-colors hover:text-[var(--text)]"
            >
              <Mail size={14} strokeWidth={2} />
              kandadamukesh8@gmail.com
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default AboutBuilder;
