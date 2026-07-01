// Defensive parsers for the trust / repost records that arrive inside the
// freeform `company_research` payload. Old matches won't have these keys, so
// every accessor narrows at runtime and returns null on any shape mismatch.

export interface TrustInfo {
  score: number;
  level: 'high' | 'medium' | 'low';
  flags: string[];
}

export interface RepostInfo {
  isRepost: boolean;
  lastSeenDays: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseTrust(
  research: Record<string, unknown> | undefined,
): TrustInfo | null {
  if (!isRecord(research)) return null;
  const raw = research.trust;
  if (!isRecord(raw)) return null;

  const level = raw.level;
  if (level !== 'high' && level !== 'medium' && level !== 'low') return null;

  const score =
    typeof raw.score === 'number' && Number.isFinite(raw.score)
      ? Math.min(100, Math.max(0, Math.round(raw.score)))
      : 0;

  const flags = Array.isArray(raw.flags)
    ? raw.flags.filter(
        (f): f is string => typeof f === 'string' && f.trim().length > 0,
      )
    : [];

  return { score, level, flags };
}

export function parseRepost(
  research: Record<string, unknown> | undefined,
): RepostInfo | null {
  if (!isRecord(research)) return null;
  const raw = research.repost;
  if (!isRecord(raw)) return null;
  if (typeof raw.is_repost !== 'boolean') return null;

  const days = raw.last_seen_days;
  return {
    isRepost: raw.is_repost,
    lastSeenDays:
      typeof days === 'number' && Number.isFinite(days)
        ? Math.max(0, Math.round(days))
        : null,
  };
}
