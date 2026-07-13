import { AlertTriangle, RotateCw } from 'lucide-react';
import { cn } from '@/lib/format';
import { Button } from '@/components/ui/button';

const DEFAULT_HINT = 'Couldn’t reach the server. This is usually momentary — please retry.';

export interface ErrorStateProps {
  /** What failed, in the user's terms. e.g. "Couldn't load missions". */
  title: string;
  /** Optional dynamic detail (a normalised error message). */
  message?: string;
  /** Reassuring next-step line; defaults to a transient-error hint. */
  hint?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** `card` = centered full block (empty content area); `banner` = inline strip. */
  variant?: 'card' | 'banner';
}

/**
 * Shared failure state for data-backed pages. Replaces the per-page copies that
 * had drifted in copy and color across matches / tracker / resumes.
 */
export function ErrorState({
  title,
  message,
  hint = DEFAULT_HINT,
  onRetry,
  retryLabel = 'Retry',
  variant = 'card',
}: ErrorStateProps) {
  const body = message ? `${message}. ${hint}` : hint;

  const retry = onRetry && (
    <Button variant="secondary" onClick={onRetry}>
      <RotateCw className="h-4 w-4" />
      {retryLabel}
    </Button>
  );

  if (variant === 'banner') {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-[color-mix(in_srgb,var(--red)_30%,var(--border))] bg-[color-mix(in_srgb,var(--red)_6%,var(--surface))] px-5 py-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--red)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--text)]">{title}</p>
          <p className="text-[12px] text-[var(--muted)]">{body}</p>
        </div>
        {retry}
      </div>
    );
  }

  return (
    <div className={cn(
      'flex flex-col items-center justify-center rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center',
    )}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-bright)] bg-[var(--card)]">
        <AlertTriangle className="h-5 w-5 text-[var(--red)]" />
      </div>
      <h3 className="font-display mt-4 text-base font-bold tracking-[-0.5px] text-[var(--text)]">
        {title}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-[var(--muted)]">{body}</p>
      {retry && <div className="mt-5">{retry}</div>}
    </div>
  );
}

export default ErrorState;
