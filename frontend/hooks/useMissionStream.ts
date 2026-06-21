'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import type { MissionEventOut } from '@/lib/types';

export type MissionStreamStatus = 'connecting' | 'running' | 'done';

interface MissionStreamResult {
  events: MissionEventOut[];
  status: MissionStreamStatus;
}

const isCompletion = (evt: MissionEventOut): boolean => {
  const msg = (evt.message ?? '').toLowerCase();
  if (msg.includes('mission complete')) return true;
  if (msg.includes('mission failed')) return true;
  const type = evt.event_type as string;
  return type === 'done' || type === 'complete' || type === 'end';
};

/**
 * Loads mission events in two phases:
 * 1. REST pre-fetch  → shows events instantly, no "Connecting..." wait
 * 2. SSE stream      → live events for running missions (deduped by id)
 *
 * For completed missions the REST call shows all history immediately and
 * the SSE connection is skipped entirely.
 */
export function useMissionStream(missionId: string): MissionStreamResult {
  const [events, setEvents] = useState<MissionEventOut[]>([]);
  const [status, setStatus] = useState<MissionStreamStatus>('connecting');

  useEffect(() => {
    if (!missionId) return;

    setEvents([]);
    setStatus('connecting');

    let cancelled = false;
    let es: EventSource | null = null;

    const cleanup = () => {
      cancelled = true;
      es?.close();
    };

    (async () => {
      // ── Phase 1: REST pre-fetch ────────────────────────────────────────────
      let historical: MissionEventOut[] = [];
      try {
        const res = await fetch(`${API_BASE}/missions/${missionId}/events`);
        if (res.ok) historical = (await res.json()) as MissionEventOut[];
      } catch {
        // network error — fall through to SSE only
      }

      if (cancelled) return;

      if (historical.length > 0) {
        setEvents(historical);
        setStatus('running');

        // If the last event is a completion marker, we're already done.
        if (isCompletion(historical[historical.length - 1])) {
          setStatus('done');
          return; // skip SSE entirely for completed missions
        }
      }

      // ── Phase 2: SSE for live events ──────────────────────────────────────
      const seenIds = new Set(historical.map((e) => e.id));

      es = new EventSource(`${API_BASE}/missions/${missionId}/stream`);

      es.onmessage = (e: MessageEvent) => {
        if (!e.data || cancelled) return;
        let parsed: MissionEventOut;
        try {
          parsed = JSON.parse(e.data) as MissionEventOut;
        } catch {
          return;
        }
        // Skip events already loaded via REST pre-fetch
        if (seenIds.has(parsed.id)) return;
        seenIds.add(parsed.id);

        setEvents((prev) => [...prev, parsed]);
        setStatus((prev) => (prev === 'done' ? prev : 'running'));

        if (isCompletion(parsed)) {
          setStatus('done');
          es?.close();
        }
      };

      es.onerror = () => {
        // Stream closed (mission finished or server dropped connection).
        setStatus('done');
        es?.close();
      };
    })();

    return cleanup;
  }, [missionId]);

  return { events, status };
}
