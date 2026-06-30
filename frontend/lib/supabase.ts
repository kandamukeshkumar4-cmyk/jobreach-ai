import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Supabase is optional / UI-only for now. If env vars are missing the app must
// still build and run — so we guard at import time and never throw.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          // Persist the session in localStorage and keep it fresh so the app
          // layout authenticates after an OAuth redirect or a page refresh.
          persistSession: true,
          autoRefreshToken: true,
          // Use PKCE so the OAuth return carries a `?code=` we exchange
          // ourselves in /auth/callback. Turning OFF automatic URL detection
          // makes that exchange deterministic — no double-exchange race when
          // the code lands on the landing page (Site URL fallback) first.
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
