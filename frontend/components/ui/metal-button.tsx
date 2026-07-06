'use client';

import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/format';

// Key-CTA button. We deliberately do NOT use the metal-fx effect: it paints a
// dark metallic fill over the button, which hid the brand color and made the
// "Launch Mission" CTA look near-black / invisible on the dark background. This
// is a bright gradient fill with a chromatic (cyan→violet) glow instead —
// clearly visible AND still glowing.

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] font-semibold tracking-[-0.2px] transition-[transform,filter,box-shadow] duration-150 focus-visible:outline-none';

// Enabled skin — bright brand gradient + layered chromatic glow. Literal values
// (not var() tokens) so Tailwind always emits them.
const ENABLED =
  'bg-[linear-gradient(120deg,#7cf3ff,#38b6ff_48%,#a689ff)] text-[#04121a] ' +
  'shadow-[0_0_22px_rgba(94,198,255,0.55),0_0_40px_rgba(139,107,255,0.35),0_1px_0_rgba(255,255,255,0.4)_inset] ' +
  'hover:brightness-110 hover:shadow-[0_0_28px_rgba(94,198,255,0.7),0_0_54px_rgba(139,107,255,0.45)] active:scale-[0.96]';

// Disabled skin — a clean, flat, still-legible pill. No gradient/glow (which,
// dimmed, read as a broken dark blob).
const DISABLED =
  'bg-[#1b1b21] text-[#8b8b96] border border-[rgba(255,255,255,0.12)] cursor-not-allowed';

type SizeOpts = { size?: 'sm' | 'md' };

function sizeClass(size: 'sm' | 'md') {
  return size === 'sm' ? 'px-5 py-2 text-sm' : 'px-7 py-3.5 text-[15px]';
}

// Link variant (never disabled).
export type MetalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> &
  SizeOpts & { href: string };

export function MetalLink({ href, className, size = 'md', children, ...props }: MetalLinkProps) {
  return (
    <Link href={href} className={cn(BASE, ENABLED, sizeClass(size), className)} {...(props as object)}>
      {children}
    </Link>
  );
}

// Button variant.
export type MetalButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & SizeOpts;

/**
 * Bright, glowing key-CTA button. Use MetalLink for href-based CTAs,
 * MetalButton for form submits / click handlers. Reserved for the
 * highest-intent actions — not for everyday UI.
 */
export function MetalButton({ className, type, size = 'md', children, disabled, ...props }: MetalButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled}
      className={cn(BASE, disabled ? DISABLED : ENABLED, sizeClass(size), className)}
      {...props}
    >
      {children}
    </button>
  );
}

export default MetalButton;
