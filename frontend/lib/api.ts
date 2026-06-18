import { getAccessToken } from '@/lib/supabase';
import type {
  ApplicationCreate,
  ApplicationOut,
  ApplicationUpdate,
  MatchOut,
  MissionCreate,
  MissionEventOut,
  MissionOut,
  ProfileCreate,
  ProfileOut,
  ResumeGeneratePayload,
  ResumeTask,
  TrackerStats,
} from '@/lib/types';

export const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/v1`;

interface RequestOptions {
  method?: string;
  body?: unknown;
  // When true, do not attempt to parse a JSON response body (e.g. 204).
  noContent?: boolean;
}

/**
 * Typed fetch wrapper.
 * - Builds the URL from API_BASE.
 * - Sets Content-Type: application/json.
 * - Best-effort attaches a Bearer token from getAccessToken() (never blocks).
 * - Parses JSON in/out.
 * - Throws Error(`${status} ${body}`) on non-2xx responses.
 */
async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, noContent = false } = opts;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Best-effort auth — must never block or break the request if it fails.
  try {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // ignore — auth is optional
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      detail = res.statusText;
    }
    throw new Error(`${res.status} ${detail}`);
  }

  if (noContent || res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

async function uploadFile<T>(path: string, file: File, timeoutMs = 35_000): Promise<T> {
  const headers: Record<string, string> = {};
  try {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // ignore
  }
  const body = new FormData();
  body.append('file', file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch { detail = res.statusText; }
      throw new Error(`${res.status} ${detail}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Resume parsing timed out — please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  missions: {
    list: () => request<MissionOut[]>('/missions/'),
    get: (id: string) => request<MissionOut>(`/missions/${id}`),
    create: (payload: MissionCreate) =>
      request<MissionOut>('/missions/', { method: 'POST', body: payload }),
    events: (id: string) =>
      request<MissionEventOut[]>(`/missions/${id}/events`),
  },
  matches: {
    list: (missionId: string, opts?: { grade?: string }) => {
      const qs = opts?.grade
        ? `?grade=${encodeURIComponent(opts.grade)}`
        : '';
      return request<MatchOut[]>(`/jobs/matches/${missionId}${qs}`);
    },
    get: (matchId: string) =>
      request<MatchOut>(`/jobs/matches/detail/${matchId}`),
  },
  tracker: {
    list: (status?: string) => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      return request<ApplicationOut[]>(`/tracker/${qs}`);
    },
    create: (payload: ApplicationCreate) =>
      request<ApplicationOut>('/tracker/', { method: 'POST', body: payload }),
    update: (id: string, payload: ApplicationUpdate) =>
      request<ApplicationOut>(`/tracker/${id}`, {
        method: 'PATCH',
        body: payload,
      }),
    remove: (id: string): Promise<void> =>
      request<void>(`/tracker/${id}`, { method: 'DELETE', noContent: true }),
    stats: () => request<TrackerStats>('/tracker/stats/summary'),
  },
  resumes: {
    generate: (payload: ResumeGeneratePayload) =>
      request<ResumeTask>('/resumes/generate', {
        method: 'POST',
        body: payload,
      }),
    status: (taskId: string) =>
      request<ResumeTask>(`/resumes/status/${taskId}`),
    forMatch: (matchId: string) =>
      request<unknown[]>(`/resumes/match/${matchId}`),
  },
  profile: {
    get: (id: string) => request<ProfileOut>(`/profile/${id}`),
    create: (payload: ProfileCreate) =>
      request<ProfileOut>('/profile/', { method: 'POST', body: payload }),
    update: (id: string, payload: ProfileCreate) =>
      request<ProfileOut>(`/profile/${id}`, { method: 'PUT', body: payload }),
    parseResume: (file: File) =>
      uploadFile<{ text: string; filename: string }>('/profile/parse-resume/', file),
  },
};
