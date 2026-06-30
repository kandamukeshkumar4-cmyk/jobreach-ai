'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { getAccessToken } from '@/lib/supabase';
import type { MissionEventOut } from '@/lib/types';

export type MissionStreamStatus = 'connecting' | 'running' | 'done' | 'failed';

interface MissionStreamResult {
  events: MissionEventOut[];
  status: MissionStreamStatus;
}

export interface MissionStatusMeta {
  /** Long status word for the console header. */
  label: string;
  /** Short label for the orb / compact chips. */
  shortLabel: string;
  /** Maps to AgentOrb's `state` prop. */
  orbState: 'idle' | 'running' | 'done' | 'error';
  /** Brand token for the status dot / accent. */
  tone: string;
  /** Still working — drives meta polling and the pulsing affordance. */
  live: boolean;
}

/**
 * Single source of truth for how a mission status renders. The console header
 * and the mission page both derive their dot/label/orb from this — keep the
 * mapping here, not duplicated across components.
 */
export function statusMeta(status: MissionStreamStatus): MissionStatusMeta {
  switch (status) {
    case 'done':
      return { label: 'Complete', shortLabel: 'Done', orbState: 'done', tone: 'var(--green)', live: false };
    case 'failed':
      return { label: 'Failed', shortLabel: 'Failed', orbState: 'error', tone: 'var(--red)', live: false };
    case 'connecting':
      return { label: 'Connecting…', shortLabel: 'Connecting', orbState: 'running', tone: 'var(--cyan)', live: true };
    case 'running':
    default:
      return { label: 'Running', shortLabel: 'Running', orbState: 'running', tone: 'var(--cyan)', live: true };
  }
}

type Terminal = 'done' | 'failed' | null;

/** Classify a single event as a terminal signal (or not). */
function terminalOf(evt: MissionEventOut): Terminal {
  const msg = (evt.message ?? '').toLowerCase();
  if (msg.includes('mission failed')) return 'failed';
  if (msg.includes('mission complete')) return 'done';
  const type = evt.event_type as string;
  if (type === 'done' || type === 'complete' || type === 'end') return 'done';
  return null;
}

/** Scan the whole list (not just the tail) for the last terminal signal. */
function terminalIn(events: MissionEventOut[]): Terminal {
  let result: Terminal = null;
  for (const e of events) {
    const t = terminalOf(e);
    if (t) result = t;
  }
  return result;
}

/** Stable identity for dedup. Falls back when the backend omits `id`. */
function eventKey(e: MissionEventOut): string {
  return e.id ?? `${e.created_at ?? ''}::${e.message ?? ''}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await getAccessToken();
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // ignore
  }
  return {};
}

/**
 * Polls mission events and status — reliable on Azure App Service where SSE is
 * proxied/buffered by IIS/ARR and often cut off.
 *
 * Phase 1: immediate full fetch of all events so far
 * Phase 2: poll every 3s for new events while the mission is running, backing
 *          off to 10s once nothing new has arrived for a while
 * Phase 3: final fetch, then a definitive done/failed status when the mission
 *          row reports terminal — set AFTER the trailing fetch so a zero-event
 *          terminal mission can never get stuck on "connecting"
 */
export function useMissionStream(missionId: string): MissionStreamResult {
  const [events, setEvents] = useState<MissionEventOut[]>([]);
  const [status, setStatus] = useState<MissionStreamStatus>('connecting');

  const cancelRef = useRef(false);

  useEffect(() => {
    if (!missionId) return;

    setEvents([]);
    setStatus('connecting');
    cancelRef.current = false;

    const seen = new Set<string>();
    const idPath = encodeURIComponent(missionId);
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let idle = 0;

    /** Fetch all events, append unseen ones. Returns true if terminal reached. */
    const fetchEvents = async (): Promise<boolean> => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${API_BASE}/missions/${idPath}/events`, { headers });
        if (!res.ok || cancelRef.current) return false;

        const fetched = (await res.json()) as MissionEventOut[];
        if (cancelRef.current || !Array.isArray(fetched)) return false;

        const fresh = fetched.filter((e) => !seen.has(eventKey(e)));
        if (fresh.length > 0) {
          fresh.forEach((e) => seen.add(eventKey(e)));
          setEvents((prev) => [...prev, ...fresh]);
          setStatus((s) => (s === 'connecting' ? 'running' : s));
          idle = 0;
        }

        // Completion is determined by scanning ALL events, not just the tail —
        // a trailing info event must not hide a "mission complete" before it.
        const terminal = terminalIn(fetched);
        if (terminal) {
          setStatus(terminal);
          return true;
        }
      } catch {
        // network error — retry next tick
      }
      return false;
    };

    /** Read the mission row for an out-of-band terminal signal. */
    const fetchMissionStatus = async (): Promise<Terminal> => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${API_BASE}/missions/${idPath}`, { headers });
        if (!res.ok || cancelRef.current) return null;
        const mission = await res.json();
        if (mission?.status === 'completed') return 'done';
        if (mission?.status === 'failed') return 'failed';
        return null;
      } catch {
        return null;
      }
    };

    const poll = async () => {
      const terminal = await fetchEvents();
      if (terminal || cancelRef.current) return;

      const rowStatus = await fetchMissionStatus();
      if (cancelRef.current) return;

      if (rowStatus) {
        // Pick up any trailing events, THEN set the terminal status last so it
        // wins over a 'connecting' the trailing fetch might have written.
        await fetchEvents();
        if (!cancelRef.current) setStatus(rowStatus);
        return;
      }

      if (!cancelRef.current) {
        idle += 1;
        // Back off once the mission has gone quiet, to stop hammering the API.
        const delay = idle > 20 ? 10_000 : 3_000;
        pollTimer = setTimeout(poll, delay);
      }
    };

    poll();

    return () => {
      cancelRef.current = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [missionId]);

  return { events, status };
}
