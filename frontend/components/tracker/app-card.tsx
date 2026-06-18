'use client';

import { CalendarClock } from 'lucide-react';
import type { ApplicationOut } from '@/lib/types';
import { ScoreRing } from '@/components/ui/score-ring';
import { cn } from '@/lib/format';

export interface AppCardProps {
  application: ApplicationOut;
  onOpen: (application: ApplicationOut) => void;
  dragging?: boolean;
  onDragStart?: (application: ApplicationOut) => void;
  onDragEnd?: () => void;
}

/**
 * A single application card in the kanban board.
 * Shows job title, company, a compact ScoreRing, and a next-action badge.
 * Click (or Enter/Space) opens the drawer; supports HTML5 drag to move columns.
 */
export function AppCard({
  application,
  onOpen,
  dragging = false,
  onDragStart,
  onDragEnd,
}: AppCardProps) {
  const hasNextAction = Boolean(application.next_action);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={Boolean(onDragStart)}
      onDragStart={(e) => {
        // Carry the id so column drop handlers can identify the card.
        e.dataTransfer.setData('text/plain', application.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(application);
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => onOpen(application)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(application);
        }
      }}
      className={cn(
        'group flex cursor-pointer flex-col gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3.5 text-left transition-colors hover:border-[var(--border-bright)] focus-visible:border-[var(--border-bright)] focus-visible:outline-none',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-[-0.2px] text-[var(--text)] transition-colors group-hover:text-[var(--cyan)]">
            {application.job_title || 'Untitled role'}
          </div>
          <div className="mt-0.5 truncate text-xs text-[var(--muted)]">
            {application.company || 'Unknown company'}
          </div>
        </div>
        <ScoreRing
          size={32}
          score={application.overall_score}
          grade={application.grade}
        />
      </div>

      {hasNextAction && (
        <div
          className="inline-flex items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-[11px] font-medium leading-none"
          style={{
            color: 'var(--amber)',
            backgroundColor: 'color-mix(in srgb, var(--amber) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--amber) 24%, transparent)',
          }}
          title={
            application.next_action_date
              ? `${application.next_action} · ${formatDateBadge(application.next_action_date)}`
              : application.next_action
          }
        >
          <CalendarClock className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[160px]">
            {application.next_action}
            {application.next_action_date
              ? ` · ${formatDateBadge(application.next_action_date)}`
              : ''}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDateBadge(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default AppCard;
