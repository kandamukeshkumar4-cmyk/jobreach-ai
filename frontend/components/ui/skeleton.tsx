import { cn } from '@/lib/format';

/**
 * A single shimmering placeholder block. Compose these into page-specific
 * skeleton layouts — the atom owns the pulse + radius, the caller owns size.
 * `tone` picks the fill so blocks read against either surface.
 */
export function Skeleton({
  className,
  tone = 'card',
}: {
  className?: string;
  tone?: 'card' | 'surface';
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded',
        tone === 'surface' ? 'bg-[var(--surface)]' : 'bg-[var(--card)]',
        className,
      )}
    />
  );
}

export default Skeleton;
