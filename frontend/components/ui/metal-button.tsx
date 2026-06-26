'use client';

import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react';
import Link from 'next/link';
import { MetalFx, type MetalFxPreset } from 'metal-fx';
import { cn } from '@/lib/format';

const PILL =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-prismatic text-[#050506] font-semibold tracking-[-0.2px] transition-transform duration-100 active:scale-[0.96] focus-visible:outline-none';

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
  ...props
}: MetalButtonProps) {
  const sizeClass = size === 'sm' ? 'px-5 py-2 text-sm' : 'px-7 py-3.5 text-[15px]';
  return (
    <MetalFx preset={preset} theme="dark" strength={strength} variant="button">
      <button
        type={type ?? 'button'}
        className={cn(PILL, sizeClass, 'disabled:cursor-not-allowed disabled:opacity-40', className)}
        {...props}
      >
        {children}
      </button>
    </MetalFx>
  );
}

export default MetalButton;
