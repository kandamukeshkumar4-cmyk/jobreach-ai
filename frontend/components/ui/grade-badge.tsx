import type { Grade } from '@/lib/types';

const GRADE_COLOR: Record<Grade, string> = {
  A: 'var(--green)',
  B: 'var(--cyan)',
  C: 'var(--amber)',
  D: 'var(--muted)',
  F: 'var(--muted)',
};

export interface GradeBadgeProps {
  grade: Grade;
  score?: number;
}

export function GradeBadge({ grade, score }: GradeBadgeProps) {
  const color = GRADE_COLOR[grade] ?? 'var(--muted)';

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-[-0.2px]"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      <span>{grade}</span>
      {score !== undefined && (
        <span className="font-mono text-[10px] text-[var(--muted2)]">
          {score.toFixed(1)}
        </span>
      )}
    </span>
  );
}

export default GradeBadge;
