'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ExternalLink,
  FileText,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ApplicationOut,
  ApplicationStatus,
  ApplicationUpdate,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ScoreRing } from '@/components/ui/score-ring';
import { Spinner } from '@/components/ui/spinner';
import { STATUS_OPTIONS } from '@/components/tracker/constants';

export interface AppDrawerProps {
  application: ApplicationOut;
  onClose: () => void;
  onSave: (id: string, payload: ApplicationUpdate) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/** Normalizes an ISO/date string into the yyyy-mm-dd value an <input type=date> wants. */
function toDateInputValue(value?: string): string {
  if (!value) return '';
  // Already in yyyy-mm-dd shape.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

          {/* Status */}
          <Field label="Status">
            <select
              value={status}
              disabled={busy}
              onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
              className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)] transition-colors hover:border-[var(--border-bright)] focus:border-[var(--cyan)] focus:outline-none disabled:opacity-50"
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
            <input
              type="text"
              value={nextAction}
              disabled={busy}
              placeholder="e.g. Follow up with recruiter"
              onChange={(e) => setNextAction(e.target.value)}
              className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] transition-colors hover:border-[var(--border-bright)] focus:border-[var(--cyan)] focus:outline-none disabled:opacity-50"
            />
          </Field>

          {/* Next action date */}
          <Field label="Next action date">
            <input
              type="date"
              value={nextActionDate}
              disabled={busy}
              onChange={(e) => setNextActionDate(e.target.value)}
              className="w-full rounded-[7px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)] transition-colors [color-scheme:dark] hover:border-[var(--border-bright)] focus:border-[var(--cyan)] focus:outline-none disabled:opacity-50"
            />
          </Field>

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={notes}
              disabled={busy}
              rows={5}
              placeholder="Interview prep, contacts, salary expectations…"
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-y rounded-[7px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm leading-relaxed text-[var(--text)] placeholder:text-[var(--muted)] transition-colors hover:border-[var(--border-bright)] focus:border-[var(--cyan)] focus:outline-none disabled:opacity-50"
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
                  {saving && <Spinner size={14} className="text-[#07071a]" />}
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
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted2)] transition-colors hover:border-[var(--border-bright)] hover:text-[var(--cyan)]"
    >
      <FileText className="h-3.5 w-3.5" />
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
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
