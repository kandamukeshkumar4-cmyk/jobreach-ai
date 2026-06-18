export interface DimensionBarProps {
  label: string;
  score: number;
}

function colorForScore(score: number): string {
  if (score >= 4.5) return 'var(--green)';
  if (score >= 3.5) return 'var(--cyan)';
  if (score >= 2.5) return 'var(--amber)';
  return 'var(--muted)';
}

export function DimensionBar({ label, score }: DimensionBarProps) {
  const clamped = Math.max(0, Math.min(5, score));
  const pct = (clamped / 5) * 100;
  const color = colorForScore(clamped);

  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-[12px] text-[var(--muted2)]">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--card)]">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-[12px] text-[var(--text)]">
        {clamped.toFixed(1)}
      </span>
    </div>
  );
}

export default DimensionBar;
