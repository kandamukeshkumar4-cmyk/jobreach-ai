import { API_BASE } from '@/lib/api';
import { getAccessToken } from '@/lib/supabase';
import { resolveDocUrl } from '@/lib/doc-url';

/**
 * Download a generated document through an AUTH-BEARING fetch → blob → save.
 *
 * The backend download routes are token-gated, so a plain <a href> (which can't
 * send the Authorization header) just 401s. URL-shape handling AND the auth
 * decision live in resolveDocUrl (lib/doc-url.ts) so they stay unit-testable:
 *  - data: URL (inline base64)          → saved directly (self-contained, no fetch, no token)
 *  - "/api/v1/..." path                 → joined to the API ORIGIN, fetched WITH the bearer
 *  - "/resumes/..." path                → joined to API_BASE, fetched WITH the bearer
 *  - our-API absolute URL               → fetched WITH the bearer
 *  - external absolute URL              → fetched WITHOUT the bearer (never leak the token)
 *
 * Throws on failure so the caller can surface an error (no silent window.open
 * fallback — that would just open a 401 page).
 */
export async function downloadDoc(rawUrl: string, filename: string): Promise<void> {
  const { url, isData, attachAuth } = resolveDocUrl(rawUrl, API_BASE);

  if (isData) {
    triggerSave(url, filename);
    return;
  }

  const headers: Record<string, string> = {};
  // Only ever attach the bearer to our own API — never to an external origin.
  if (attachAuth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    triggerSave(blobUrl, filename);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function triggerSave(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
