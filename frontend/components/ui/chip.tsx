import type { ReactNode } from 'react';

export type ChipTone = 'good' | 'flag' | 'neutral';

export interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
}

const TONE_COLOR: Record<ChipTone, string> = {
  good: 'var(--green)',
  flag: 'var(--red)',
  neutral: 'var(--muted2)',
};

export function Chip({ children, tone = 'neutral' }: ChipProps) {
  const color = TONE_COLOR[tone];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export default Chip;
