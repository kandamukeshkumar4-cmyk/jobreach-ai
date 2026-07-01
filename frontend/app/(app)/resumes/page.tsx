'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  FileSignature,
  RotateCw,
  ExternalLink,
  ScanLine,
  ListOrdered,
  ShieldCheck,
  Printer,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { downloadDoc } from '@/lib/download';
import { relativeTime } from '@/lib/format';
import type { ApplicationOut } from '@/lib/types';
import { GradeBadge } from '@/components/ui/grade-badge';
import { AgentOrb } from '@/components/ui/agent-orb';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TRACKER_KEY } from '@/components/tracker/constants';

// ── Pipeline steps ────────────────────────────────────────────────────────────

const PIPELINE_STEPS: ReadonlyArray<{
  icon: LucideIcon;
  title: string;
  detail: string;
  accent: string;
  key: string;
}> = [
  {
    key: 'extract',
    icon: ScanLine,
    title: 'Keyword extraction',
    detail: 'Parses the JD for ATS signals.',
    accent: 'var(--cyan)',
  },
  {
    key: 'reorder',
    icon: ListOrdered,
    title: 'Content reorder',
    detail: 'Re-ranks your proof without fabrication.',
    accent: 'var(--violet)',
  },
  {
    key: 'ats',
    icon: ShieldCheck,
    title: 'ATS compliance',
    detail: 'Strips tables, normalises headings.',
    accent: 'var(--green)',
  },
  {
    key: 'render',
    icon: Printer,
    title: 'DOCX render',
    detail: 'Typesets one parser-safe document per role.',
    accent: 'var(--amber)',
  },
];

// Deterministic badge tint per company, locked to the brand trio so document
// cards never drift off the cyan/violet palette.
const AVATAR_TINTS = ['var(--cyan)', 'var(--blue)', 'var(--violet)'];
function companyColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_TINTS.length;
  return AVATAR_TINTS[h];
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface ResumeDoc {
  application: ApplicationOut;
  resumeUrl?: string;
  coverLetterUrl?: string;
}

export default function ResumesPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<ApplicationOut[]>({
    queryKey: TRACKER_KEY,
    queryFn: () => api.tracker.list(),
    // Poll while focused so freshly-tailored resumes appear; React Query already
    // pauses the interval when the tab is backgrounded.
    refetchInterval: 15_000,
  });

  const docs: ResumeDoc[] = useMemo(
    () =>
      (data ?? [])
        .filter((a) => Boolean(a.resume_pdf_url) || Boolean(a.cover_letter_pdf_url))
        .map((application) => ({
          application,
          resumeUrl: application.resume_pdf_url ?? undefined,
          coverLetterUrl: application.cover_letter_pdf_url ?? undefined,
        }))
        .sort(
          (a, b) =>
            new Date(b.application.applied_at ?? b.application.created_at).getTime() -
            new Date(a.application.applied_at ?? a.application.created_at).getTime(),
        ),
    [data],
  );

  const coverLetterCount = useMemo(
    () => docs.filter((d) => Boolean(d.coverLetterUrl)).length,
    [docs],
  );

  return (
    <div className="space-y-6">
      {/* ── Chrome bar ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_94%,white_2%),var(--surface))] shadow-[0_18px_80px_rgba(0,0,0,0.24)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
            </div>
            <span className="text-[11px] uppercase tracking-[1.8px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
              DOCUMENT.STUDIO
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {!isLoading && docs.length > 0 && (
              <span className="text-[11px] tabular-nums text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {docs.length} {docs.length === 1 ? 'resume' : 'resumes'}
                {coverLetterCount > 0 && ` · ${coverLetterCount} cover ${coverLetterCount === 1 ? 'letter' : 'letters'}`}
              </span>
            )}
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted2)] transition-colors hover:border-[var(--border-bright)] hover:text-[var(--text)] disabled:opacity-40"
            >
              <RotateCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Page header */}
        <div className="px-5 py-5">
          <h1 className="text-xl font-extrabold tracking-[-0.8px] text-[var(--text)]">
            Document Studio
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[var(--muted)]">
            Every resume runs through a rigorous ATS pipeline, one tailored DOCX per role. Your real experience, ethically reframed. Nothing is ever fabricated.
          </p>
        </div>

        {/* Pipeline steps */}
        <div className="border-t border-[var(--border)] px-5 py-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {PIPELINE_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.key}
                  className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_70%,transparent)] p-3"
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      color: step.accent,
                      backgroundColor: `color-mix(in srgb, ${step.accent} 14%, transparent)`,
                    }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[12px] font-semibold text-[var(--text)]">{step.title}</p>
                      <span className="text-[10px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">{step.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Documents ──────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2 px-1">
          <h2 className="text-[12px] uppercase tracking-[1.6px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
            Generated Documents
          </h2>
        </div>

        {isError ? (
          <ErrorState
            variant="banner"
            title="Couldn't load documents"
            onRetry={() => void refetch()}
          />
        ) : isLoading ? (
          <SkeletonGrid />
        ) : docs.length === 0 ? (
          <EmptyDocuments />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {docs.map((doc) => (
              <ResumeCard key={doc.application.id} doc={doc} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Document card ─────────────────────────────────────────────────────────────

function ResumeCard({ doc }: { doc: ResumeDoc }) {
  const { application, resumeUrl, coverLetterUrl } = doc;
  const color = companyColor(application.company || 'Z');
  const initial = (application.company || '?')[0].toUpperCase();

  // Downloads go through an auth-bearing fetch (the routes are token-gated), not
  // a plain link — see lib/download.ts.
  const [docErr, setDocErr] = useState<string | null>(null);
  const grab = async (url: string, name: string) => {
    setDocErr(null);
    try {
      await downloadDoc(url, name);
    } catch (e) {
      setDocErr(e instanceof Error ? e.message : 'Download failed');
    }
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-bright)] bg-[color-mix(in_srgb,var(--card)_82%,transparent)] transition-all duration-200 hover:border-[color-mix(in_srgb,var(--cyan)_40%,var(--border-bright))] hover:shadow-[0_0_32px_color-mix(in_srgb,var(--cyan)_8%,transparent)]">
      {/* Top accent */}
      <div className="h-[2px] w-full" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />

      <div className="flex flex-col gap-3 p-4">
        {/* Company badge + info */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
            style={{ backgroundColor: color, color: 'var(--bg)' }}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-[var(--text)]">
              {application.job_title || 'Untitled role'}
            </p>
            <p className="truncate text-[11px] text-[var(--muted)]">
              {application.company || 'Unknown company'}
            </p>
          </div>
          <GradeBadge grade={application.grade} score={application.overall_score} />
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--border)]" />

        {/* Download links */}
        <div className="flex flex-wrap gap-2">
          {resumeUrl ? (
            <button
              type="button"
              onClick={() => grab(resumeUrl, 'Resume.docx')}
              className="group/link inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--text)] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
            >
              <FileText className="h-3.5 w-3.5 text-[var(--muted2)] transition-colors group-hover/link:text-[var(--cyan)]" />
              Resume
              <ExternalLink className="h-3 w-3 text-[var(--muted)] transition-colors group-hover/link:text-[var(--cyan)]" />
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--muted)]">
              <FileText className="h-3.5 w-3.5" />
              No resume yet
            </span>
          )}

          {coverLetterUrl && (
            <button
              type="button"
              onClick={() => grab(coverLetterUrl, 'CoverLetter.docx')}
              className="group/link inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--text)] transition-colors hover:border-[var(--violet)] hover:text-[var(--violet)]"
            >
              <FileSignature className="h-3.5 w-3.5 text-[var(--muted2)] transition-colors group-hover/link:text-[var(--violet)]" />
              Cover letter
              <ExternalLink className="h-3 w-3 text-[var(--muted)] transition-colors group-hover/link:text-[var(--violet)]" />
            </button>
          )}
        </div>
        {docErr && (
          <p className="text-[11px] text-[var(--red)]">{docErr}</p>
        )}

        {/* Footer */}
        <p className="text-[11px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
          Tailored {relativeTime(application.applied_at ?? application.created_at)}
        </p>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyDocuments() {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_94%,white_2%),var(--surface))]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[11px] uppercase tracking-[1.8px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
            waiting for first resume
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted2)]">
            <span className="size-1.5 rounded-full bg-[var(--amber)] mission-node-active" />
            Idle
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-6 md:grid-cols-3">
        {['Go to Matches → find a job', 'Click "Tailor Resume"', 'Download appears here'].map((msg, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] p-4 opacity-60">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)]">
              <span className="text-[11px] font-bold text-[var(--cyan)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
            </div>
            <p className="text-[12px] text-[var(--muted)]">{msg}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border)] px-6 pb-6 pt-4 text-center">
        <AgentOrb state="idle" size={12} />
        <p className="mt-3 text-[13px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
          No documents generated yet
        </p>
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          Tailor a resume from the Match board and it will land here ready to download.
        </p>
        <div className="mt-4">
          <Link href="/matches">
            <Button variant="primary">
              Go to Matches
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Loading / error ───────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_70%,transparent)] p-4">
          <div className="flex items-center gap-3">
            <Skeleton tone="surface" className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton tone="surface" className="h-3.5 w-3/4" />
              <Skeleton tone="surface" className="h-3 w-1/2" />
            </div>
          </div>
          <div className="h-px bg-[var(--border)]" />
          <div className="flex gap-2">
            <Skeleton tone="surface" className="h-8 w-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
