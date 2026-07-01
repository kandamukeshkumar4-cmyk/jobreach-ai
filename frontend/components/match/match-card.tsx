'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  MapPin,
  ExternalLink,
  FileText,
  Check,
  Plus,
  Download,
  AlertTriangle,
  Loader2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { downloadDoc } from '@/lib/download';
import { formatSalary } from '@/lib/format';
import { parseTrust, parseRepost, type TrustInfo } from '@/lib/research';
import type { MatchOut, ResumeTask } from '@/lib/types';
import { LiquidGlassCard } from '@/components/ui/liquid-glass';
import { ScoreRing } from '@/components/ui/score-ring';
import { DimensionBar } from '@/components/ui/dimension-bar';
import { Chip, type ChipTone } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';

const POLL_INTERVAL_MS = 3000;
// Hard cap on status polls (~30s at 3s). Without it, a lost task record
// (Redis flush, pre-deploy task) spins the "Tailoring..." state too long.
const MAX_POLLS = 10;
const MAX_DIMENSIONS = 5;

// Celery task states surfaced by the resume pipeline.
type ResumeState = 'idle' | 'working' | 'success' | 'failure';

interface ResearchChip {
  label: string;
  tone: ChipTone;
}

const TRUST_META: Record<
  TrustInfo['level'],
  { label: string; tone: ChipTone; icon: LucideIcon }
> = {
  high: { label: 'Trusted', tone: 'good', icon: ShieldCheck },
  medium: { label: 'Check listing', tone: 'warn', icon: Shield },
  low: { label: 'Caution', tone: 'flag', icon: ShieldAlert },
};

/** Shield-style listing-trust chip; tooltip lists the trust flags. */
function TrustBadge({ trust }: { trust: TrustInfo }) {
  const meta = TRUST_META[trust.level];
  const Icon = meta.icon;
  return (
    <span
      title={
        trust.flags.length > 0
          ? trust.flags.join(' · ')
          : `Trust score ${trust.score}/100`
      }
    >
      <Chip tone={meta.tone}>
        <Icon className="h-3 w-3 shrink-0" />
        {meta.label}
      </Chip>
    </span>
  );
}

/**
 * `company_research` is a freeform Record from the backend, so we read known
 * keys defensively and fall back to rendering a few primitive entries. We never
 * assume a key exists or has a particular shape.
 */
function buildResearchChips(
  research: Record<string, unknown> | undefined,
): ResearchChip[] {
  if (!research || typeof research !== 'object') return [];

  const chips: ResearchChip[] = [];
  const seen = new Set<string>();

  const push = (label: string | null | undefined, tone: ChipTone) => {
    const text = (label ?? '').toString().trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    chips.push({ label: text, tone });
  };

  const get = (key: string): unknown => research[key];

  // funding_stage -> neutral
  const funding = get('funding_stage');
  if (typeof funding === 'string') push(prettyValue(funding), 'neutral');

  // remote_policy -> good when it reads as remote-friendly
  const remote = get('remote_policy');
  if (typeof remote === 'string') {
    const isRemote = /remote|distributed|anywhere|hybrid/i.test(remote);
    push(prettyValue(remote), isRemote ? 'good' : 'neutral');
  }

  // layoffs_24mo -> flag when truthy
  const layoffs = get('layoffs_24mo');
  if (layoffs === true) push('Layoffs (24mo)', 'flag');
  else if (typeof layoffs === 'number' && layoffs > 0)
    push(`Layoffs: ${layoffs}`, 'flag');
  else if (typeof layoffs === 'string' && layoffs.trim()) {
    const negative = /yes|true|recent|\d/i.test(layoffs);
    if (negative) push(`Layoffs: ${prettyValue(layoffs)}`, 'flag');
  }

  // tech_stack -> neutral (array or comma string)
  const stack = get('tech_stack');
  if (Array.isArray(stack)) {
    stack.slice(0, 4).forEach((s) => push(String(s), 'neutral'));
  } else if (typeof stack === 'string') {
    stack
      .split(/[,/]/)
      .slice(0, 4)
      .forEach((s) => push(s, 'neutral'));
  }

  // A couple of other commonly-useful, well-known keys, defensively typed.
  const headcount = get('headcount') ?? get('employee_count') ?? get('size');
  if (typeof headcount === 'number') push(`${headcount} employees`, 'neutral');
  else if (typeof headcount === 'string') push(prettyValue(headcount), 'neutral');

  const glassdoor = get('glassdoor_rating') ?? get('rating');
  if (typeof glassdoor === 'number')
    push(`${glassdoor.toFixed(1)}★`, glassdoor >= 4 ? 'good' : 'neutral');

  // If nothing matched the known keys, surface a few primitive entries so the
  // research isn't silently dropped.
  if (chips.length === 0) {
    for (const [key, value] of Object.entries(research)) {
      if (chips.length >= 4) break;
      if (value == null) continue;
      if (typeof value === 'string' && value.trim())
        push(`${prettyKey(key)}: ${value}`, 'neutral');
      else if (typeof value === 'number')
        push(`${prettyKey(key)}: ${value}`, 'neutral');
      else if (typeof value === 'boolean' && value)
        push(prettyKey(key), 'neutral');
    }
  }

  return chips.slice(0, 6);
}

function prettyValue(value: string): string {
  const v = value.replace(/[_-]+/g, ' ').trim();
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function prettyKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Best-effort extraction of resume download URL from the freeform task result. */
function extractPdfUrl(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  const candidates = [
    r.pdf_url,
    r.download_url,
    r.resume_pdf_url,
    r.url,
    r.resume_url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return null;
}

function normalizeState(status: string | undefined): ResumeState {
  const s = (status ?? '').toUpperCase();
  if (s === 'SUCCESS') return 'success';
  if (s === 'FAILURE' || s === 'REVOKED') return 'failure';
  if (s === 'PENDING' || s === 'STARTED' || s === 'RETRY' || s === 'PROGRESS')
    return 'working';
  return 'working';
}

export interface MatchCardProps {
  match: MatchOut;
}

export function MatchCard({ match }: MatchCardProps) {
  const { job } = match;

  // --- Resume generation state ---
  const [resumeState, setResumeState] = useState<ResumeState>('idle');
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const autoDownloadedRef = useRef(false);

  // --- Tracker state ---
  const [trackState, setTrackState] = useState<'idle' | 'saving' | 'done'>(
    'idle',
  );
  const [trackError, setTrackError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const [downloading, setDownloading] = useState(false);
  const pollCountRef = useRef(0);

  const handleDownload = useCallback(async () => {
    if (!resumeUrl || downloading) return;
    setDownloading(true);
    setResumeError(null);
    try {
      await downloadDoc(resumeUrl, 'Resume.docx');
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }, [downloading, resumeUrl]);

  useEffect(() => {
    if (resumeState !== 'success' || !resumeUrl || autoDownloadedRef.current) {
      return;
    }
    autoDownloadedRef.current = true;
    void handleDownload();
  }, [handleDownload, resumeState, resumeUrl]);

  const pollStatus = async (taskId: string) => {
    // Cap the loop: a task whose status can never resolve (lost ownership
    // record, evicted result) must not spin forever.
    pollCountRef.current += 1;
    if (pollCountRef.current > MAX_POLLS) {
      stopPolling();
      if (mountedRef.current) {
        setResumeError('Timed out waiting for the resume — try again.');
        setResumeState('failure');
      }
      return;
    }
    try {
      const task = await api.resumes.status(taskId);
      if (!mountedRef.current) return;
      const state = normalizeState(task.status);
      if (state === 'success') {
        stopPolling();
        const url = extractPdfUrl(task.result);
        if (!url) {
          setResumeError('Resume generated but no download URL was returned.');
          setResumeState('failure');
          return;
        }
        setResumeError(null);
        setResumeUrl(url);
        setResumeState('success');
      } else if (state === 'failure') {
        stopPolling();
        const message =
          task.result && typeof task.result === 'object' && 'error' in task.result
            ? String((task.result as Record<string, unknown>).error)
            : 'Generation failed. Try again.';
        setResumeError(message);
        setResumeState('failure');
      }
      // else keep polling
    } catch (err) {
      // 404 = the task's ownership record is gone (server restart / expired
      // record) — it will NEVER resolve, so stop instead of spinning forever.
      if (err instanceof Error && err.message.startsWith('404')) {
        stopPolling();
        if (mountedRef.current) {
          setResumeError('Lost track of this generation — please regenerate.');
          setResumeState('failure');
        }
        return;
      }
      // Other transient errors (e.g. cold start) shouldn't kill the poll loop;
      // we keep trying on the next tick.
    }
  };

  const handleTailorResume = async () => {
    if (resumeState === 'working') return;
    setResumeState('working');
    setResumeError(null);
    setResumeUrl(null);
    autoDownloadedRef.current = false;
    stopPolling();
    pollCountRef.current = 0;

    let task: ResumeTask;
    try {
      task = await api.resumes.generate({ match_id: match.id });
    } catch {
      if (!mountedRef.current) return;
      setResumeError('Could not start generation.');
      setResumeState('failure');
      return;
    }

    if (!mountedRef.current) return;

    // The generate call may already resolve to a terminal state.
    const immediate = normalizeState(task.status);
    if (immediate === 'success') {
      const url = extractPdfUrl(task.result);
      if (!url) {
        setResumeError('Resume generated but no download URL was returned.');
        setResumeState('failure');
        return;
      }
      setResumeUrl(url);
      setResumeState('success');
      return;
    }
    if (immediate === 'failure') {
      setResumeError('Generation failed. Try again.');
      setResumeState('failure');
      return;
    }

    if (!task.task_id) {
      setResumeError('No task id returned.');
      setResumeState('failure');
      return;
    }

    // Poll every 3s until SUCCESS / FAILURE, capped at roughly 30s.
    void pollStatus(task.task_id);
    pollRef.current = setInterval(() => {
      void pollStatus(task.task_id);
    }, POLL_INTERVAL_MS);
  };

  const handleTrack = async () => {
    if (trackState !== 'idle') return;
    setTrackState('saving');
    setTrackError(null);
    try {
      await api.tracker.create({ match_id: match.id });
      if (!mountedRef.current) return;
      setTrackState('done');
    } catch {
      if (!mountedRef.current) return;
      setTrackError('Could not add to tracker.');
      setTrackState('idle');
    }
  };

  const salary = formatSalary(
    job?.salary_min,
    job?.salary_max,
    job?.salary_currency,
  );

  const dimensions = Array.isArray(match.dimensions) ? match.dimensions : [];
  const topDimensions = [...dimensions]
    .sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))
    .slice(0, MAX_DIMENSIONS);

  const researchChips = buildResearchChips(match.company_research);
  const trust = parseTrust(match.company_research);
  const repost = parseRepost(match.company_research);
  const showChipRow =
    trust !== null || repost?.isRepost === true || researchChips.length > 0;

  return (
    <LiquidGlassCard className="flex h-full flex-col p-5">
      {/* Header: company / title / location + score ring */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted2)]">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{job?.company || 'Unknown company'}</span>
          </div>
          <h3
            className="font-display mt-1.5 line-clamp-2 text-[15px] font-bold leading-snug tracking-[-0.4px] text-[var(--text)]"
            title={job?.title}
          >
            {job?.title || 'Untitled role'}
          </h3>
          {job?.location && (
            <div className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)]">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{job.location}</span>
            </div>
          )}
        </div>
        <ScoreRing score={match.overall_score} grade={match.grade} size={56} />
      </div>

      {/* Salary */}
      {salary && (
        <div className="mt-3">
          <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-0.5 font-mono text-xs text-[var(--muted2)]">
            {salary}
          </span>
        </div>
      )}

      {/* Dimensions */}
      {topDimensions.length > 0 && (
        <div className="mt-4 space-y-2">
          {topDimensions.map((dim, i) => (
            <DimensionBar
              key={`${dim.label}-${i}`}
              label={dim.label}
              score={dim.score}
            />
          ))}
        </div>
      )}

      {/* Why fit */}
      {match.why_fit && (
        <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-[var(--muted2)]">
          {match.why_fit}
        </p>
      )}

      {/* Company research chips (trust + repost first, then freeform research) */}
      {showChipRow && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {trust && <TrustBadge trust={trust} />}
          {repost?.isRepost && (
            <Chip tone="warn">
              Reposted
              {repost.lastSeenDays != null && (
                <>
                  {' · seen '}
                  <span className="font-mono">{repost.lastSeenDays}d</span>
                  {' ago'}
                </>
              )}
            </Chip>
          )}
          {researchChips.map((chip, i) => (
            <Chip key={`${chip.label}-${i}`} tone={chip.tone}>
              {chip.label}
            </Chip>
          ))}
        </div>
      )}

      {/* Spacer pushes footer to the bottom for equal-height cards */}
      <div className="flex-1" />

      {/* Inline status messages */}
      {resumeState === 'success' && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--green)_30%,transparent)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)] px-3 py-2 text-xs text-[var(--green)]">
          <Check className="h-3.5 w-3.5 shrink-0" />
          {resumeUrl ? (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline disabled:opacity-60"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {downloading ? 'Downloading...' : 'Download again (.docx)'}
            </button>
          ) : (
            <span className="font-medium">Resume ready</span>
          )}
        </div>
      )}

      {/* Rendered in ANY state (a failed DOWNLOAD sets this while state is
          still 'success' — it must not be silently swallowed). */}
      {resumeError && resumeState !== 'failure' && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--red)_30%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-3 py-2 text-xs text-[var(--red)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{resumeError}</span>
        </div>
      )}

      {resumeState === 'failure' && resumeError && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--red)_30%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-3 py-2 text-xs text-[var(--red)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{resumeError}</span>
        </div>
      )}

      {trackError && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--red)_30%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-3 py-2 text-xs text-[var(--red)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{trackError}</span>
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2 border-t border-[var(--border)] pt-4">
        <Button
          variant="primary"
          onClick={handleTailorResume}
          disabled={resumeState === 'working'}
          className="px-3"
        >
          {resumeState === 'working' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Tailoring…
            </>
          ) : resumeState === 'success' ? (
            <>
              <FileText className="h-4 w-4" />
              Regenerate
            </>
          ) : resumeState === 'failure' ? (
            <>
              <FileText className="h-4 w-4" />
              Retry resume
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Tailor Resume
            </>
          )}
        </Button>

        {job?.url ? (
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" className="px-3">
              <ExternalLink className="h-4 w-4" />
              View
            </Button>
          </a>
        ) : (
          <Button variant="secondary" className="px-3" disabled>
            <ExternalLink className="h-4 w-4" />
            View
          </Button>
        )}

        {trackState === 'done' ? (
          <Link href="/tracker">
            <Button variant="secondary" className="px-3">
              <Check className="h-4 w-4 text-[var(--green)]" />
              View
            </Button>
          </Link>
        ) : (
          <Button
            variant="secondary"
            onClick={handleTrack}
            disabled={trackState === 'saving'}
            className="px-3"
          >
            {trackState === 'saving' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Track
              </>
            )}
          </Button>
        )}
      </div>
    </LiquidGlassCard>
  );
}

export default MatchCard;
