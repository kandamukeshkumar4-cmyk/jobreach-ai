import type { Grade } from '@/lib/types';

const GRADE_COLOR: Record<Grade, string> = {
  A: 'var(--green)',
  B: 'var(--cyan)',
  C: 'var(--amber)',
  D: 'var(--muted)',
  F: 'var(--muted)',
};

export interface ScoreRingProps {
  score: number;
  grade: Grade;
  size?: number;
}

export function ScoreRing({ score, grade, size = 52 }: ScoreRingProps) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius; // ≈ 125.66
  const clamped = Math.max(0, Math.min(5, score));
  const filled = (clamped / 5) * circumference;
  const color = GRADE_COLOR[grade] ?? 'var(--muted)';

  // viewBox is fixed at 52x52 so geometry stays consistent; the SVG scales via width/height.
  const center = 26;

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 52 52"
        role="img"
        aria-label={`Grade ${grade}, score ${clamped.toFixed(1)} out of 5`}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--card)"
          strokeWidth={4}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          className="font-bold tracking-[-0.5px]"
          style={{ color, fontSize: size * 0.32 }}
        >
          {grade}
        </span>
        <span
          className="mt-[1px] text-[var(--muted2)]"
          style={{ fontSize: size * 0.17 }}
        >
          {clamped.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export default ScoreRing;
