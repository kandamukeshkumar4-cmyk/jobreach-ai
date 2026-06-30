import type { ApplicationStatus } from '@/lib/types';

/** React Query key for the tracker application list. Shared so every page that
 *  reads or invalidates the list hits the same cache entry. */
export const TRACKER_KEY = ['tracker', 'list'] as const;

export interface StatusDef {
  value: ApplicationStatus;
  label: string;
  accent: string;
}

/**
 * All application statuses with their display label and accent color.
 * Order here is the canonical pipeline order.
 */
export const STATUS_OPTIONS: StatusDef[] = [
  { value: 'evaluated', label: 'Evaluated', accent: 'var(--muted)' },
  { value: 'applied', label: 'Applied', accent: 'var(--violet)' },
  { value: 'responded', label: 'Responded', accent: 'var(--violet)' },
  { value: 'interview', label: 'Interview', accent: 'var(--cyan)' },
  { value: 'offer', label: 'Offer', accent: 'var(--green)' },
  { value: 'rejected', label: 'Rejected', accent: 'var(--red)' },
  { value: 'discarded', label: 'Discarded', accent: 'var(--muted)' },
  { value: 'skip', label: 'Skip', accent: 'var(--muted)' },
];

/** The main kanban pipeline columns (left to right). */
export const PIPELINE_STATUSES: StatusDef[] = STATUS_OPTIONS.filter((s) =>
  ['evaluated', 'applied', 'responded', 'interview', 'offer'].includes(s.value),
);

/** Closed-out statuses shown in the side rail. */
export const ARCHIVED_STATUSES: StatusDef[] = STATUS_OPTIONS.filter((s) =>
  ['rejected', 'discarded'].includes(s.value),
);

const STATUS_LABEL = new Map(STATUS_OPTIONS.map((s) => [s.value, s.label]));
const STATUS_ACCENT = new Map(STATUS_OPTIONS.map((s) => [s.value, s.accent]));

export function statusLabel(status: string): string {
  return (
    STATUS_LABEL.get(status as ApplicationStatus) ??
    status.charAt(0).toUpperCase() + status.slice(1)
  );
}

export function statusAccent(status: string): string {
  return STATUS_ACCENT.get(status as ApplicationStatus) ?? 'var(--muted)';
}
