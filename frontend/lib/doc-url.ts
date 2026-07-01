/**
 * Pure resolution of a backend-produced document URL into (a) the concrete URL
 * to fetch/save and (b) whether our Supabase bearer token may be attached.
 *
 * No imports, no side effects — so it is unit-testable in isolation
 * (see doc-url.test.mjs).
 *
 * The backend hands us a few URL shapes, each needing different handling:
 *   - "data:..."            inline base64 → save directly, NEVER fetch, no token
 *   - "/api/v1/..."         API path that ALREADY carries the version prefix →
 *                           join to the API ORIGIN. (Joining to API_BASE would
 *                           double the prefix: ".../api/v1/api/v1/...".)
 *   - "/resumes/..." etc.   API path relative to the versioned root →
 *                           join to API_BASE.
 *   - "https://host/..."    absolute URL → ONLY our own API origin receives the
 *                           bearer token; external hosts never do.
 */

export interface ResolvedDoc {
  /** Concrete URL to fetch (or, for a data: URL, to save directly). */
  url: string;
  /** data: URL — self-contained, save without any network fetch. */
  isData: boolean;
  /** Attach the Supabase bearer token. NEVER true for external origins. */
  attachAuth: boolean;
}

/** API_BASE is "<origin>/api/v1"; strip the version suffix to get the origin. */
export function apiOrigin(apiBase: string): string {
  return apiBase.replace(/\/api\/v1\/?$/, '');
}

/** True iff an absolute URL targets the JobReach API's own origin. */
function isSameOriginAsApi(absoluteUrl: string, apiBase: string): boolean {
  const origin = apiOrigin(apiBase);
  if (!origin) return false; // origin unknown → treat every absolute URL as external
  try {
    return new URL(absoluteUrl).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

export function resolveDocUrl(rawUrl: string, apiBase: string): ResolvedDoc {
  const raw = (rawUrl ?? '').trim();
  if (!raw) throw new Error('No document available');

  // data: — inline and self-contained. Never fetched, never tokened.
  if (raw.startsWith('data:')) {
    return { url: raw, isData: true, attachAuth: false };
  }

  // Absolute URL: attach the token ONLY when it targets our own API origin.
  // External absolute URLs are fetched WITHOUT the bearer (no leakage).
  if (/^https?:\/\//i.test(raw)) {
    return { url: raw, isData: false, attachAuth: isSameOriginAsApi(raw, apiBase) };
  }

  // Root-relative path already carrying the /api/v1 prefix → join to the ORIGIN.
  if (raw.startsWith('/api/v1/')) {
    return { url: `${apiOrigin(apiBase)}${raw}`, isData: false, attachAuth: true };
  }

  // Any other root-relative path (e.g. "/resumes/..") → relative to API_BASE.
  if (raw.startsWith('/')) {
    return { url: `${apiBase}${raw}`, isData: false, attachAuth: true };
  }

  // Bare relative path we don't specifically recognise — still our own API,
  // so the token is safe to attach.
  return { url: `${apiBase}/${raw}`, isData: false, attachAuth: true };
}
