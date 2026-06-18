export type AgentOrbState = 'idle' | 'running' | 'done';

export interface AgentOrbProps {
  state: AgentOrbState;
  label?: string;
  size?: number;
}

const STATE_COLOR: Record<AgentOrbState, string> = {
  idle: 'var(--muted)',
  running: 'var(--cyan)',
  done: 'var(--green)',
};

export function AgentOrb({ state, label, size = 12 }: AgentOrbProps) {
  const color = STATE_COLOR[state];
  const running = state === 'running';

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="relative inline-flex shrink-0 items-center justify-center"
        style={{ width: size, height: size }}
      >
        {running && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ backgroundColor: color }}
          />
        )}
        <span
          className="relative inline-flex rounded-full"
          style={{
            width: size,
            height: size,
            backgroundColor: color,
            boxShadow: running
              ? `0 0 8px color-mix(in srgb, ${color} 60%, transparent)`
              : 'none',
          }}
        />
      </span>
      {label && (
        <span className="text-[12px] font-medium" style={{ color }}>
          {label}
        </span>
      )}
    </span>
  );
}

export default AgentOrb;
