'use client';

import { useState } from 'react';
import type { ApplicationOut, ApplicationStatus } from '@/lib/types';
import { AppCard } from '@/components/tracker/app-card';
import { cn } from '@/lib/format';

export interface KanbanColumnProps {
  status: ApplicationStatus;
  label: string;
  accent: string;
  applications: ApplicationOut[];
  draggingId: string | null;
  onOpen: (application: ApplicationOut) => void;
  onDragStart: (application: ApplicationOut) => void;
  onDragEnd: () => void;
  /** Called when a card is dropped into this column (id = dropped application id). */
  onDropCard: (id: string, target: ApplicationStatus) => void;
}

/**
 * One kanban column for a single application status. Acts as an HTML5 drop
 * target: dropping a card here moves it to this column's status.
 */
export function KanbanColumn({
  status,
  label,
  accent,
  applications,
  draggingId,
  onOpen,
  onDragStart,
  onDragEnd,
  onDropCard,
}: KanbanColumnProps) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div className="flex min-w-[260px] flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <h3 className="text-xs font-semibold uppercase tracking-[0.6px] text-[var(--muted2)]">
          {label}
        </h3>
        <span className="ml-auto font-mono text-xs tabular-nums text-[var(--muted)]">
          {applications.length}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          // Allow drop only for cards not already in this column.
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!isOver) setIsOver(true);
        }}
        onDragLeave={(e) => {
          // Ignore leave events that bubble from children.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setIsOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsOver(false);
          const id = e.dataTransfer.getData('text/plain');
          if (id) onDropCard(id, status);
        }}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col gap-2.5 rounded-xl border border-dashed border-transparent p-1.5 transition-colors',
          isOver && 'border-[var(--border-bright)] bg-[var(--card)]/40',
        )}
      >
        {applications.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted)]">
            {isOver ? 'Drop here' : 'No applications'}
          </div>
        ) : (
          applications.map((application) => (
            <AppCard
              key={application.id}
              application={application}
              dragging={draggingId === application.id}
              onOpen={onOpen}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default KanbanColumn;
