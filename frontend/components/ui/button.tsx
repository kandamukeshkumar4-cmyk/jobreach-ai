import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/format';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--cyan)] text-[#07071a] font-semibold hover:brightness-110 active:brightness-95',
  secondary:
    'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-bright)]',
  ghost:
    'bg-transparent text-[var(--muted2)] hover:text-[var(--text)] hover:bg-[var(--card)]',
};

export function Button({
  variant = 'primary',
  className,
  type,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[7px] px-4 py-2 text-sm tracking-[-0.2px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}

export default Button;
