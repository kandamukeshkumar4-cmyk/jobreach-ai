import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/format';

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-colors duration-150 hover:border-[var(--border-bright)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
