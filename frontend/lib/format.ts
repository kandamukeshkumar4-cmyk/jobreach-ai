import type { Grade } from '@/lib/types';

/**
 * Maps a letter grade to its design-system CSS variable.
 * A=green, B=cyan, C=amber, D/F=muted.
 */
export function gradeColorVar(grade: Grade): string {
  switch (grade) {
    case 'A':
      return 'var(--green)';
    case 'B':
      return 'var(--cyan)';
    case 'C':
      return 'var(--amber)';
    case 'D':
    case 'F':
    default:
      return 'var(--muted)';
  }
}

/**
 * Formats a salary range into a human-readable string, or null when neither
 * bound is provided. Uses compact-ish formatting with thousands separators.
 */
export function formatSalary(
  min?: number,
  max?: number,
  currency?: string,
): string | null {
  if (min == null && max == null) return null;

  const cur = (currency ?? 'USD').toUpperCase();
  const symbol = currencySymbol(cur);

  const fmt = (n: number) => `${symbol}${n.toLocaleString('en-US')}`;

  if (min != null && max != null) {
    if (min === max) return fmt(min);
    return `${fmt(min)} – ${fmt(max)}`;
  }
  if (min != null) return `From ${fmt(min)}`;
  return `Up to ${fmt(max as number)}`;
}

function currencySymbol(currency: string): string {
  switch (currency) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'INR':
      return '₹';
    case 'JPY':
      return '¥';
    case 'CAD':
      return 'CA$';
    case 'AUD':
      return 'A$';
    default:
      return `${currency} `;
  }
}

/**
 * Returns a short relative-time string for an ISO timestamp,
 * e.g. "just now", "5m ago", "3h ago", "2d ago", "Mar 4".
 */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 0) return 'just now';
  if (diffSec < 45) return 'just now';

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  const date = new Date(then);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | Record<string, boolean>
  | ClassValue[];

/**
 * Joins class names, dropping falsy values. Accepts strings, arrays, and
 * { className: boolean } maps.
 */
export function cn(...args: ClassValue[]): string {
  const out: string[] = [];

  const walk = (val: ClassValue) => {
    if (!val) return;
    if (typeof val === 'string' || typeof val === 'number') {
      out.push(String(val));
      return;
    }
    if (Array.isArray(val)) {
      val.forEach(walk);
      return;
    }
    if (typeof val === 'object') {
      for (const [key, active] of Object.entries(val)) {
        if (active) out.push(key);
      }
    }
  };

  args.forEach(walk);
  return out.join(' ');
}
