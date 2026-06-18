'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  FileSignature,
  Target,
  ExternalLink,
  AlertTriangle,
  RotateCw,
  ShieldCheck,
  ScanLine,
  ListOrdered,
  Printer,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { ApplicationOut } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { GradeBadge } from '@/components/ui/grade-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

// The four pipeline phases that summarise the 16-step ATS build, in order.
const PIPELINE_STEPS: ReadonlyArray<{
  icon: LucideIcon;
  title: string;
  detail: string;
  accent: string;
}> = [
  {
    icon: ScanLine,
    title: 'Keyword extraction',
    detail:
      'Parses the job description for hard skills, tools and seniority signals an ATS scans for.',
    accent: 'var(--cyan)',
  },
  {
    icon: ListOrdered,
    title: 'Content reorder',
    detail:
      'Reframes and re-ranks your real experience so the most relevant proof leads — never fabricated.',
    accent: 'var(--violet)',
  },
  {
    icon: ShieldCheck,
    title: 'ATS compliance',
    detail:
      'Strips tables, columns and graphics, normalises headings, and verifies clean machine-readable structure.',
    accent: 'var(--green)',
  },
  {
    icon: Printer,
    title: 'PDF render',
    detail:
      'Typesets one tailored document per role into a selectable-text, parser-safe PDF.',
    accent: 'var(--amber)',
  },
];

interface ResumeDoc {
  application: ApplicationOut;
  resumeUrl?: string;
  coverLetterUrl?: string;
}

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="p-6">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--red)_12%,transparent)] text-[var(--red)]">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-bold tracking-[-0.3px] text-[var(--text)]">
            Couldn&apos;t load your documents
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            The backend may be cold-starting (this can take up to 30 seconds).
            Give it a moment, then retry.
          </p>
        </div>
        <Button variant="secondary" onClick={onRetry} className="shrink-0">
          <RotateCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    </Card>
  );
}

function ResumeCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-[var(--card)]" />
          <div className="h-3 w-2/5 rounded bg-[var(--card)]" />
        </div>
        <div className="h-6 w-12 rounded-full bg-[var(--card)]" />
      </div>
      <div className="mt-5 flex gap-2">
        <div className="h-9 w-28 rounded-[7px] bg-[var(--card)]" />
        <div className="h-9 w-28 rounded-[7px] bg-[var(--card)]" />
      </div>
    </Card>
  );
}

function DocLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-2 rounded-[7px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium tracking-[-0.2px] text-[var(--text)] transition-colors hover:border-[var(--border-bright)] hover:text-[var(--cyan)]"
    >
      <Icon className="h-4 w-4 text-[var(--muted2)] transition-colors group-hover:text-[var(--cyan)]" />
      {label}
      <ExternalLink className="h-3.5 w-3.5 text-[var(--muted)] transition-colors group-hover:text-[var(--cyan)]" />
    </a>
  );
}

function ResumeCard({ doc }: { doc: ResumeDoc }) {
  const { application, resumeUrl, coverLetterUrl } = doc;
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold tracking-[-0.2px] text-[var(--text)]">
            {application.job_title || 'Untitled role'}
          </h3>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
            {application.company || 'Unknown company'}
          </p>
        </div>
        <GradeBadge grade={application.grade} score={application.overall_score} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {resumeUrl ? (
          <DocLink href={resumeUrl} icon={FileText} label="Open resume" />
        ) : (
          <span className="inline-flex items-center gap-2 rounded-[7px] border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
            <FileText className="h-4 w-4" />
            No resume PDF
          </span>
        )}
        {coverLetterUrl && (
          <DocLink
            href={coverLetterUrl}
            icon={FileSignature}
            label="Cover letter"
          />
        )}
      </div>

      <div className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
        Tailored {relativeTime(application.applied_at ?? application.created_at)}
      </div>
    </Card>
  );
}

export default function ResumesPage() {
  const trackerQuery = useQuery<ApplicationOut[]>({
    queryKey: ['tracker', 'list'],
    queryFn: () => api.tracker.list(),
  });

  const docs: ResumeDoc[] = (trackerQuery.data ?? [])
    .filter((a) => Boolean(a.resume_pdf_url) || Boolean(a.cover_letter_pdf_url))
    .map((application) => ({
      application,
      resumeUrl: application.resume_pdf_url,
      coverLetterUrl: application.cover_letter_pdf_url,
    }))
    .sort(
      (a, b) =>
        new Date(
          b.application.applied_at ?? b.application.created_at,
        ).getTime() -
        new Date(a.application.applied_at ?? a.application.created_at).getTime(),
    );

  const coverLetterCount = docs.filter((d) => Boolean(d.coverLetterUrl)).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-extrabold tracking-[-1.2px] text-[var(--text)]">
          Document Studio
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--muted2)]">
          Every resume is built through a 16-step ATS pipeline — one tailored
          document per role. Your real experience, ethically reframed for the
          job at hand. Nothing is ever fabricated.
        </p>
      </header>

      {/* Pipeline explainer */}
      <section>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PIPELINE_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="p-4">
                <div className="flex items-center justify-between">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{
                      color: step.accent,
                      backgroundColor: `color-mix(in srgb, ${step.accent} 12%, transparent)`,
                    }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-bold tracking-[-0.3px] text-[var(--text)]">
                  {step.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                  {step.detail}
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Documents */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-[-0.8px] text-[var(--text)]">
            Generated Documents
          </h2>
          {!trackerQuery.isLoading && !trackerQuery.isError && docs.length > 0 && (
            <span className="font-mono text-xs text-[var(--muted)]">
              {docs.length} {docs.length === 1 ? 'resume' : 'resumes'}
              {coverLetterCount > 0 && (
                <span className="text-[var(--muted2)]">
                  {' '}
                  · {coverLetterCount} cover{' '}
                  {coverLetterCount === 1 ? 'letter' : 'letters'}
                </span>
              )}
            </span>
          )}
        </div>

        {trackerQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ResumeCardSkeleton />
            <ResumeCardSkeleton />
            <ResumeCardSkeleton />
          </div>
        ) : trackerQuery.isError ? (
          <ErrorBanner onRetry={() => trackerQuery.refetch()} />
        ) : docs.length === 0 ? (
          <Card>
            <EmptyState
              title="No documents yet"
              description="Tailor a resume from the Match board and your generated PDFs will land here, ready to open and send."
              action={
                <Link href="/missions">
                  <Button variant="primary">
                    <Target className="h-4 w-4" />
                    Go to the Match board
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              }
            />
          </Card>
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
