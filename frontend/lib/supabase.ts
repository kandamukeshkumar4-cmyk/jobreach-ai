import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Supabase is optional / UI-only for now. If env vars are missing the app must
// still build and run — so we guard at import time and never throw.
//
// Cookie-backed browser client (via @supabase/ssr): the session lives in
// cookies, NOT localStorage, so the server-side `proxy.ts` route guard can read
// it. (localStorage is invisible to the server, which would make middleware see
// "no user" for everyone and loop logged-in users back to /login.) The browser
// API surface is identical to supabase-js, so every existing `supabase.auth.*`
// call site keeps working unchanged — only the storage backend moves to cookies.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createBrowserClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          // PKCE so the OAuth return carries a `?code=` we exchange ourselves in
          // /auth/callback. detectSessionInUrl:false keeps that exchange
          // deterministic — no double-exchange race when the code lands on the
          // landing page (Site URL fallback) first.
          flowType: 'pkce',
          detectSessionInUrl: false,
        },
      })
    : null;

/**
 * Best-effort access-token retrieval. Returns null when Supabase is not
 * configured or when there is no active session. Never throws.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
