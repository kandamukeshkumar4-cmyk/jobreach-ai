'use client';

import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react';
import Link from 'next/link';
import { MetalFx, type MetalFxPreset } from 'metal-fx';
import { cn } from '@/lib/format';

// Shared pill layout (no color).
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] font-semibold tracking-[-0.2px] transition-[transform,filter] duration-100 focus-visible:outline-none';

// Enabled skin — brighter, higher-contrast brand fill + persistent glow so the
// key CTA (e.g. Launch Mission) is unmistakable on the near-black background.
// Literal values (not var() tokens) so Tailwind always emits them.
const ENABLED =
  'bg-[linear-gradient(120deg,#7cf3ff,#37b6ff_45%,#a689ff)] shadow-[0_0_26px_rgba(94,198,255,0.55),0_0_4px_rgba(124,243,255,0.5)] text-[#04121a] hover:brightness-110 active:scale-[0.96]';

// Disabled skin — a clean, flat, still-legible pill. NO gradient/glow (which,
// dimmed, read as a broken dark blob) and no metal-fx ring (see MetalButton).
const DISABLED =
  'bg-[#1b1b21] text-[#8b8b96] border border-[rgba(255,255,255,0.12)] cursor-not-allowed';

// Kept for MetalLink (links are never disabled).
const PILL = `${BASE} ${ENABLED}`;

type MetalFxOpts = { preset?: MetalFxPreset; strength?: number };

// Link variant
export type MetalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> &
  MetalFxOpts & { href: string; size?: 'sm' | 'md' };

export function MetalLink({
  preset = 'chromatic',
  strength = 1,
  href,
  className,
  size = 'md',
  children,
  ...props
}: MetalLinkProps) {
  const sizeClass = size === 'sm' ? 'px-5 py-2 text-sm' : 'px-7 py-3.5 text-[15px]';
  return (
    <MetalFx preset={preset} theme="dark" strength={strength} variant="button">
      <Link href={href} className={cn(PILL, sizeClass, className)} {...(props as object)}>
        {children}
      </Link>
    </MetalFx>
  );
}

// Button variant
export type MetalButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & MetalFxOpts & { size?: 'sm' | 'md' };

/**
 * Key-CTA button with metal-fx animated chromatic ring.
 * Use MetalLink for href-based CTAs, MetalButton for form submits / click handlers.
 * Reserved for the highest-intent actions — not for everyday UI.
 */
export function MetalButton({
  preset = 'chromatic',
  strength = 1,
  className,
  type,
  size = 'md',
  children,
  disabled,
  ...props
}: MetalButtonProps) {
  const sizeClass = size === 'sm' ? 'px-5 py-2 text-sm' : 'px-7 py-3.5 text-[15px]';

  const button = (
    <button
      type={type ?? 'button'}
      disabled={disabled}
      className={cn(BASE, disabled ? DISABLED : ENABLED, sizeClass, className)}
      {...props}
    >
      {children}
    </button>
  );

  // No metal-fx ring/glow when disabled — a dark pill with a ghost chromatic
  // ring underneath reads as broken. Render the flat disabled pill on its own.
  if (disabled) return button;

  return (
    <MetalFx preset={preset} theme="dark" strength={strength} variant="button">
      {button}
    </MetalFx>
  );
}

export default MetalButton;
