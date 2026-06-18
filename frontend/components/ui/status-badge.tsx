export interface StatusBadgeProps {
  status: string;
}

// Map known mission + application statuses to a color token.
const STATUS_COLOR: Record<string, string> = {
  // missions
  running: 'var(--cyan)',
  completed: 'var(--green)',
  failed: 'var(--red)',
  pending: 'var(--muted)',
  // applications
  evaluated: 'var(--muted)',
  applied: 'var(--violet)',
  responded: 'var(--violet)',
  interview: 'var(--cyan)',
  offer: 'var(--green)',
  rejected: 'var(--red)',
  discarded: 'var(--muted)',
  skip: 'var(--muted)',
};

function labelFor(status: string): string {
  if (!status) return '—';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const key = status?.toLowerCase?.() ?? '';
  const color = STATUS_COLOR[key] ?? 'var(--muted)';

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tracking-[-0.2px]"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 26%, transparent)`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {labelFor(status)}
    </span>
  );
}

export default StatusBadge;
