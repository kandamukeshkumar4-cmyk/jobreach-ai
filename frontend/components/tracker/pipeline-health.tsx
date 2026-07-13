'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ApplicationOut } from '@/lib/types';
import { LiquidGlassCard as Card } from '@/components/ui/liquid-glass';
import { statusAccent } from '@/components/tracker/constants';

/**
 * Cumulative funnel over the application pipeline, counted by the highest
 * stage each application EVER reached (peak_status, trigger-maintained), so
 * an app rejected after interviewing still counts as an interview. Falls
 * back to the current status for rows from older API responses; a rejection
 * implies the employer responded to an application.
 */
const RANK: Record<string, number> = {
  applied: 1,
  rejected: 2,
  responded: 2,
  interview: 3,
  offer: 4,
};

function rankOf(a: ApplicationOut): number {
  return RANK[a.peak_status ?? ''] ?? RANK[a.status] ?? 0;
}

const STAGES = [
  { key: 'applied', label: 'Applied', minRank: 1 },
  { key: 'responded', label: 'Responded', minRank: 2 },
  { key: 'interview', label: 'Interview', minRank: 3 },
  { key: 'offer', label: 'Offer', minRank: 4 },
] as const;

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

export function PipelineHealth({
  applications,
}: {
  applications: ApplicationOut[];
}) {
  const ranks = applications.map(rankOf);
  const counts = STAGES.map((stage) => ({
    ...stage,
    count: ranks.filter((r) => r >= stage.minRank).length,
  }));

  const applied = counts[0].count;
  if (applied === 0) return null; // nothing applied yet — no funnel to show

  const responded = counts[1].count;
  const interviews = counts[2].count;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--cyan)]">
          Pipeline Health
        </h2>
        <Link
          href="/tracker"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted2)] transition-colors hover:text-[var(--cyan)]"
        >
          Open tracker
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <Card className="p-5 elevation-product">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
          {/* Funnel stages */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {counts.map((stage) => {
              const accent = statusAccent(stage.key);
              return (
                <div key={stage.key} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium tracking-[-0.2px] text-[var(--muted)]">
                      {stage.label}
                    </span>
                    <span className="font-display text-xl font-bold tracking-[-0.5px] text-[var(--text)]">
                      {stage.count}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: pct(stage.count, applied),
                        backgroundColor: accent,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Conversion rates */}
          <div className="flex items-center gap-6 border-t border-[var(--border)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div>
              <div className="font-display text-2xl font-bold tracking-[-0.5px] text-[var(--text)]">
                {pct(responded, applied)}
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                Response rate
              </div>
            </div>
            <div>
              <div className="font-display text-2xl font-bold tracking-[-0.5px] text-[var(--text)]">
                {pct(interviews, applied)}
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                Interview rate
              </div>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}

export default PipelineHealth;
