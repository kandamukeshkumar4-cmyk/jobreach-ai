import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/format';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-prismatic text-[#050506] font-semibold shadow-[var(--glow-blue)] hover:brightness-105 active:scale-[0.96]',
  secondary:
    'bg-[var(--card)] text-[var(--text)] border border-[var(--border-bright)] hover:border-white/25 active:scale-[0.96]',
  ghost:
    'bg-transparent text-[var(--muted2)] hover:text-[var(--text)] hover:bg-white/[0.06] active:scale-[0.96]',
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
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] px-5 py-2.5 text-sm tracking-[-0.2px] transition-[transform,filter,background-color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}

export default Button;
