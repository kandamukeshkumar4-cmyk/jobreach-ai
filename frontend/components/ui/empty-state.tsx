import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <h3 className="text-base font-bold tracking-[-0.5px] text-[var(--text)]">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-[var(--muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default EmptyState;
