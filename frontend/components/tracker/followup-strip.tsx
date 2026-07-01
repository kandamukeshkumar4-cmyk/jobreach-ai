'use client';

import { useMemo } from 'react';
import { BellRing, Building2 } from 'lucide-react';
import type { ApplicationOut, ApplicationStatus } from '@/lib/types';
import { STATUS_OPTIONS } from '@/components/tracker/constants';

// Career-ops cadence: first follow-up 7 days after applying, one more +7d,
// max 2 total. Applies only while you're waiting on the company.
const CADENCE_DAYS = 7;
const MAX_FOLLOWUPS = 2;
const MS_PER_DAY = 86_400_000;

// Statuses that mean "applied and waiting" — picked from the canonical
// STATUS_OPTIONS list so a renamed/removed status can't silently drift.
const FOLLOWUP_STATUSES = new Set<ApplicationStatus>(
  STATUS_OPTIONS.filter((s) => ['applied', 'responded'].includes(s.value)).map(
    (s) => s.value,
  ),
);

interface DueFollowup {
  application: ApplicationOut;
  daysOverdue: number;
}

function dayStart(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

function parseDay(value?: string): number | null {
  if (!value) return null;
  // Date-only strings (the drawer saves next_action_date as yyyy-mm-dd) must
  // parse as LOCAL midnight — new Date("yyyy-mm-dd") is UTC midnight, which
  // lands a day EARLY in UTC-negative timezones (i.e. all US users). Same
  // gotcha toDateInputValue guards in app-drawer.tsx.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return dayStart(d);
}

/**
 * Derives due/overdue follow-ups purely from existing ApplicationOut fields.
 * An explicit next_action_date wins; otherwise the 7d cadence runs from
 * applied_at (falling back to created_at), capped at 2 follow-ups.
 */
function deriveDueFollowups(
  applications: ApplicationOut[],
  now: Date,
): DueFollowup[] {
  const today = dayStart(now);
  const due: DueFollowup[] = [];

  for (const app of applications) {
    if (!FOLLOWUP_STATUSES.has(app.status)) continue;

    let dueDay: number | null = null;
    const explicit = parseDay(app.next_action_date);
    if (explicit != null) {
      if (explicit <= today) dueDay = explicit;
    } else {
      const base = parseDay(app.applied_at) ?? parseDay(app.created_at);
      if (base == null) continue;
      const first = base + CADENCE_DAYS * MS_PER_DAY;
      if (today >= first) {
        const last = base + CADENCE_DAYS * MAX_FOLLOWUPS * MS_PER_DAY;
        dueDay = today >= last ? last : first;
      }
    }

    if (dueDay == null) continue;
    due.push({
      application: app,
      daysOverdue: Math.round((today - dueDay) / MS_PER_DAY),
    });
  }

  due.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return due;
}

export interface FollowupStripProps {
  applications: ApplicationOut[];
  onOpen: (application: ApplicationOut) => void;
}

/**
 * Horizontal 'Follow-ups due' strip shown above the tracker board.
 * Renders nothing when no follow-up is due or overdue.
 */
export function FollowupStrip({ applications, onOpen }: FollowupStripProps) {
  const dueItems = useMemo(
    () => deriveDueFollowups(applications, new Date()),
    [applications],
  );

  if (dueItems.length === 0) return null;

  return (
    <section
      aria-label="Follow-ups due"
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
    >
      <div className="mb-3 flex items-center gap-2 px-1">
        <BellRing className="h-3.5 w-3.5 text-[var(--amber)]" />
        <h3 className="text-xs font-semibold uppercase tracking-[0.6px] text-[var(--muted2)]">
          Follow-ups due
        </h3>
        <span className="ml-auto font-mono text-xs tabular-nums text-[var(--muted)]">
          {dueItems.length}
        </span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {dueItems.map(({ application, daysOverdue }) => {
          const accent = daysOverdue > 3 ? 'var(--red)' : 'var(--amber)';
          return (
            <button
              key={application.id}
              type="button"
              onClick={() => onOpen(application)}
              className="group flex shrink-0 items-center gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--border-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)]"
            >
              <div className="min-w-0 max-w-[220px]">
                <div className="truncate text-[13px] font-semibold tracking-[-0.2px] text-[var(--text)] transition-colors group-hover:text-[var(--cyan)]">
                  {application.job_title || 'Untitled role'}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {application.company || 'Unknown company'}
                  </span>
                </div>
              </div>
              <span
                className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-medium leading-none tabular-nums"
                style={{
                  color: accent,
                  backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${accent} 24%, transparent)`,
                }}
              >
                {daysOverdue === 0 ? 'Due today' : `${daysOverdue}d overdue`}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default FollowupStrip;
