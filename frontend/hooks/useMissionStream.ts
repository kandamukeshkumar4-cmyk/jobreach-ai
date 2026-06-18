'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import type { MissionEventOut } from '@/lib/types';

export type MissionStreamStatus = 'connecting' | 'running' | 'done';

interface MissionStreamResult {
  events: MissionEventOut[];
  status: MissionStreamStatus;
}

/**
 * Subscribes to a mission's SSE stream. The backend replays historical events
 * then streams live ones; each `data:` line is a JSON-encoded MissionEventOut.
 *
 * - status starts 'connecting', flips to 'running' on the first event.
 * - status becomes 'done' on a completion event (message contains
 *   "Mission complete", or a terminal event_type), and on stream error.
 * - The EventSource is closed on unmount.
 */
export function useMissionStream(missionId: string): MissionStreamResult {
  const [events, setEvents] = useState<MissionEventOut[]>([]);
  const [status, setStatus] = useState<MissionStreamStatus>('connecting');

  useEffect(() => {
    if (!missionId) return;

    // Reset state when the mission changes.
    setEvents([]);
    setStatus('connecting');

    const es = new EventSource(`${API_BASE}/missions/${missionId}/stream`);

    const isCompletion = (evt: MissionEventOut): boolean => {
      const msg = (evt.message ?? '').toLowerCase();
      if (msg.includes('mission complete')) return true;
      if (msg.includes('mission failed')) return true;
      // Some streams emit a synthetic terminal event_type.
      const type = evt.event_type as string;
      return type === 'done' || type === 'complete' || type === 'end';
    };

    es.onmessage = (e: MessageEvent) => {
      if (!e.data) return;

      let parsed: MissionEventOut;
      try {
        parsed = JSON.parse(e.data) as MissionEventOut;
      } catch {
        return; // ignore malformed lines (e.g. keep-alive comments)
      }

      setEvents((prev) => [...prev, parsed]);
      setStatus((prev) => (prev === 'done' ? prev : 'running'));

      if (isCompletion(parsed)) {
        setStatus('done');
        es.close();
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects on transient errors, but for our purposes a
      // stream error after history replay signals the mission is finished (or
      // the server closed the connection). Treat as done and stop.
      setStatus('done');
      es.close();
    };

    return () => {
      es.close();
    };
  }, [missionId]);

  return { events, status };
}
