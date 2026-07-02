'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Building2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  MessageSquareText,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ApplicationOut,
  ApplicationStatus,
  ApplicationUpdate,
  InterviewPrepOut,
  PostingArchiveOut,
} from '@/lib/types';
import { api } from '@/lib/api';
import { downloadDoc } from '@/lib/download';
import { relativeTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ScoreRing } from '@/components/ui/score-ring';
import { Spinner } from '@/components/ui/spinner';
import { STATUS_OPTIONS } from '@/components/tracker/constants';
import { SmoothInput } from '@/components/ui/smooth-input';

export interface AppDrawerProps {
  application: ApplicationOut;
  onClose: () => void;
  onSave: (id: string, payload: ApplicationUpdate) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/** Formats a Date as the local yyyy-mm-dd value an <input type=date> wants. */
function toDateValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Normalizes an ISO/date string into the yyyy-mm-dd value an <input type=date> wants. */
function toDateInputValue(value?: string): string {
  if (!value) return '';
  // Already in yyyy-mm-dd shape.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return toDateValue(d);
}

/**
 * Right-side editing panel for a tracked application.
 * Edits status, notes, next action + date; saves via PATCH or deletes the row.
 * Closes on backdrop click, the close button, or Escape.
 */
export function AppDrawer({
  application,
  onClose,
  onSave,
  onDelete,
}: AppDrawerProps) {
  const [status, setStatus] = useState<ApplicationStatus>(application.status);
  const [notes, setNotes] = useState(application.notes ?? '');
  const [nextAction, setNextAction] = useState(application.next_action ?? '');
  const [nextActionDate, setNextActionDate] = useState(
    toDateInputValue(application.next_action_date),
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const busy = saving || deleting;

  // NOTE: form state is initialized from props above. The parent mounts this
  // component with key={application.id}, so opening a different application
  // remounts the drawer and resets the form — no reset effect needed.

  // Close on Escape. Lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, busy]);

  const dirty =
    status !== application.status ||
    notes !== (application.notes ?? '') ||
    nextAction !== (application.next_action ?? '') ||
    nextActionDate !== toDateInputValue(application.next_action_date);

  // Career-ops cadence: suggest a follow-up 7 days after applying, or 7 days
  // from today when that date has already passed (or applied_at is missing).
  const handleSuggest = () => {
    const applied = application.applied_at
      ? new Date(application.applied_at)
      : null;
    const base =
      applied && !Number.isNaN(applied.getTime()) ? applied : new Date();
    const target = new Date(base);
    target.setDate(target.getDate() + 7);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (target.getTime() < today.getTime()) {
      target.setTime(today.getTime());
      target.setDate(target.getDate() + 7);
    }
    setNextActionDate(toDateValue(target));
    if (!nextAction.trim()) setNextAction('Follow up with recruiter');
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload: ApplicationUpdate = {
        status,
        notes: notes.trim() ? notes.trim() : undefined,
        next_action: nextAction.trim() ? nextAction.trim() : undefined,
        next_action_date: nextActionDate ? nextActionDate : undefined,
      };
      await onSave(application.id, payload);
      onClose();
    } catch (err) {
      setErrorMsg(extractMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setErrorMsg(null);
    try {
      await onDelete(application.id);
      onClose();
    } catch (err) {
      setErrorMsg(extractMessage(err));
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close panel"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Application: ${application.job_title}`}
        className="relative flex h-full w-full max-w-[440px] flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-6 py-5">
          <ScoreRing
            size={48}
            score={application.overall_score}
            grade={application.grade}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold tracking-[-0.5px] text-[var(--text)]">
              {application.job_title || 'Untitled role'}
            </h2>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-[var(--muted)]">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {application.company || 'Unknown company'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* Documents */}
          {(application.resume_pdf_url || application.cover_letter_pdf_url) && (
            <div className="flex flex-wrap gap-2">
              {application.resume_pdf_url && (
                <DocLink href={application.resume_pdf_url} label="Resume" />
              )}
              {application.cover_letter_pdf_url && (
                <DocLink
                  href={application.cover_letter_pdf_url}
                  label="Cover letter"
                />
              )}
            </div>
          )}

          {/* Prep & Proof */}
          <PrepAndProof applicationId={application.id} />

          {/* Status */}
          <Field label="Status">
            <select
              value={status}
              disabled={busy}
              onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
              className="w-full px-3 py-2 text-sm disabled:opacity-50 huly-input"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          {/* Next action */}
          <Field label="Next action">
            <SmoothInput
              type="text"
              value={nextAction}
              disabled={busy}
              placeholder="e.g. Follow up with recruiter"
              onChange={(e) => setNextAction(e.target.value)}
              className="px-3 py-2 text-sm"
            />
          </Field>

          {/* Next action date */}
          <div>
            <Field label="Next action date">
              <input
                type="date"
                value={nextActionDate}
                disabled={busy}
                onChange={(e) => setNextActionDate(e.target.value)}
                className="w-full px-3 py-2 text-sm [color-scheme:dark] disabled:opacity-50 huly-input"
              />
            </Field>
            <button
              type="button"
              disabled={busy}
              onClick={handleSuggest}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--muted2)] transition-colors hover:text-[var(--cyan)] focus-visible:outline-none focus-visible:text-[var(--cyan)] disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" />
              Suggest
            </button>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={notes}
              disabled={busy}
              rows={5}
              placeholder="Interview prep, contacts, salary expectations…"
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-y px-3 py-2 text-sm leading-relaxed disabled:opacity-50 huly-input"
            />
          </Field>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-[8px] border border-[color-mix(in_srgb,var(--red)_30%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-3 py-2.5 text-xs text-[var(--red)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="break-words">{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-[var(--border)] px-6 py-4">
          {confirmDelete ? (
            <div className="flex w-full items-center gap-2">
              <span className="flex-1 text-xs text-[var(--muted2)]">
                Delete this application?
              </span>
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={handleDelete}
                disabled={busy}
                className="border-[color-mix(in_srgb,var(--red)_40%,transparent)] text-[var(--red)] hover:border-[var(--red)]"
              >
                {deleting ? <Spinner size={14} /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="text-[var(--muted2)] hover:text-[var(--red)]"
                aria-label="Delete application"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="secondary" onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={busy || !dirty}
                >
                  {saving && <Spinner size={14} className="text-[var(--bg)]" />}
                  Save changes
                </Button>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/**
 * "Prep & Proof" — interview prep generation + job-posting snapshot for one
 * tracked application. Both sub-features probe for cached server state on
 * mount (404 = nothing yet, silently swallowed).
 */
function PrepAndProof({ applicationId }: { applicationId: string }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.5px] text-[var(--muted)]">
        Prep &amp; Proof
      </span>
      <div className="space-y-3">
        <InterviewPrepBlock applicationId={applicationId} />
        <ArchiveBlock applicationId={applicationId} />
      </div>
    </div>
  );
}

function InterviewPrepBlock({ applicationId }: { applicationId: string }) {
  const [prep, setPrep] = useState<InterviewPrepOut | null>(null);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.interview
      .get(applicationId)
      .then((data) => {
        if (!cancelled) setPrep(data);
      })
      .catch((err: unknown) => {
        // 404 = no prep generated yet; anything else stays silent on mount —
        // the user hasn't asked for anything, so no error artifact.
        void err;
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await api.interview.generate(applicationId);
      setPrep(data);
      setOpen(true);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('503')) {
        setError('Prep engine is busy — try again in a moment.');
      } else {
        setError(extractMessage(err));
      }
    } finally {
      setGenerating(false);
    }
  };

  const downloadMd = () => {
    if (!prep) return;
    const blob = new Blob([prep.content_md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'InterviewPrep.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-[var(--violet)]" />
        <span className="text-xs font-medium text-[var(--text)]">Interview prep</span>
        {prep && (
          <span
            className="ml-auto text-[10px] text-[var(--muted2)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {relativeTime(prep.created_at)}
          </span>
        )}
      </div>

      {!prep ? (
        <div className="mt-2">
          <Button
            variant="secondary"
            onClick={() => void generate()}
            disabled={generating}
            className="px-3 py-1.5 text-xs"
          >
            {generating ? (
              <>
                <Spinner size={13} />
                Generating… ~20s
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Generate prep
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--muted2)] transition-colors hover:text-[var(--cyan)]"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {open ? 'Hide prep notes' : 'Show prep notes'}
          </button>

          {open && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
              <PrepContent content={prep.content_md} />
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadMd}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted2)] transition-colors hover:border-[var(--border-bright)] hover:text-[var(--cyan)]"
            >
              <Download className="h-3 w-3" />
              Download .md
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted2)] transition-colors hover:border-[var(--border-bright)] hover:text-[var(--violet)] disabled:opacity-50"
            >
              {generating ? <Spinner size={12} /> : <Sparkles className="h-3 w-3" />}
              {generating ? 'Generating… ~20s' : 'Regenerate'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-[var(--red)]">{error}</p>}
    </div>
  );
}

/**
 * Renders markdown as SAFE plain text (no HTML): heading lines become mono
 * captions, everything else keeps its whitespace.
 */
function PrepContent({ content }: { content: string }) {
  const blocks = content.split('\n');
  return (
    <div className="space-y-0.5">
      {blocks.map((line, i) => {
        const heading = /^#{1,6}\s+/.exec(line);
        if (heading) {
          return (
            <p
              key={i}
              className="pt-2 text-[10px] uppercase tracking-[1.4px] text-[var(--muted2)] first:pt-0"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {line.slice(heading[0].length)}
            </p>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--muted)]">
            {line || ' '}
          </p>
        );
      })}
    </div>
  );
}

function ArchiveBlock({ applicationId }: { applicationId: string }) {
  const [archive, setArchive] = useState<PostingArchiveOut | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.archive
      .get(applicationId)
      .then((data) => {
        if (!cancelled) setArchive(data);
      })
      .catch((err: unknown) => {
        // 404 = not archived yet; silent on mount.
        void err;
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const archiveNow = async () => {
    setArchiving(true);
    setError(null);
    try {
      const data = await api.archive.create(applicationId);
      setArchive(data);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('422')) {
        setError('Posting unreachable — may be taken down');
      } else {
        setError(extractMessage(err));
      }
    } finally {
      setArchiving(false);
    }
  };

  const downloadSnapshot = async () => {
    if (!archive) return;
    setError(null);
    try {
      await downloadDoc(`/api/v1/archive/item/${archive.id}/download`, 'Posting.html');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex items-center gap-2">
        <Archive className="h-3.5 w-3.5 shrink-0 text-[var(--cyan)]" />
        <span className="text-xs font-medium text-[var(--text)]">Posting snapshot</span>
        {archive && (
          <span
            className="ml-auto text-[10px] text-[var(--muted2)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Archived {relativeTime(archive.archived_at)}
          </span>
        )}
      </div>

      <div className="mt-2">
        {!archive ? (
          <Button
            variant="secondary"
            onClick={() => void archiveNow()}
            disabled={archiving}
            className="px-3 py-1.5 text-xs"
          >
            {archiving ? (
              <>
                <Spinner size={13} />
                Archiving…
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5" />
                Archive posting
              </>
            )}
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => void downloadSnapshot()}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted2)] transition-colors hover:border-[var(--border-bright)] hover:text-[var(--cyan)]"
          >
            <Download className="h-3 w-3" />
            Download snapshot
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-[11px] text-[var(--red)]">{error}</p>}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.5px] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function DocLink({ href, label }: { href: string; label: string }) {
  // Auth-gated download via fetch→blob (lib/download.ts), not a plain link.
  const [err, setErr] = useState<string | null>(null);
  const filename = label.toLowerCase().includes('cover') ? 'CoverLetter.docx' : 'Resume.docx';
  return (
    <button
      type="button"
      title={err ?? undefined}
      onClick={async () => {
        setErr(null);
        try {
          await downloadDoc(href, filename);
        } catch (e) {
          setErr(e instanceof Error ? e.message : 'Download failed');
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border bg-[var(--card)] px-3 py-1 text-xs font-medium transition-colors hover:border-[var(--border-bright)] hover:text-[var(--cyan)] ${err ? 'border-[var(--red)]/50 text-[var(--red)]' : 'border-[var(--border)] text-[var(--muted2)]'}`}
    >
      <FileText className="h-3.5 w-3.5" />
      {label}
      <ExternalLink className="h-3 w-3" />
    </button>
  );
}

function extractMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message.length > 160
      ? `${err.message.slice(0, 160)}…`
      : err.message;
  }
  return 'Something went wrong. Please try again.';
}

export default AppDrawer;
