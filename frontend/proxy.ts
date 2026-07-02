import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Next 16: this is the `proxy` convention (formerly `middleware`). Runs on the
// server before render, so it can read the Supabase session from cookies and
// gate routes BEFORE any client JS — no logged-out flash, no client-only guard
// that a user could outrun. Pairs with the cookie-backed client in lib/supabase.ts.

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

// Every route inside the (app) group, plus onboarding (needs a session too).
const PROTECTED_PATHS = [
  '/dashboard', '/missions', '/matches', '/tracker', '/resumes', '/answers', '/profile', '/onboarding',
];
// Auth screens a logged-in user shouldn't sit on.
const AUTH_PATHS = ['/login', '/signup'];

const matches = (pathname: string, paths: string[]) =>
  paths.some((p) => pathname === p || pathname.startsWith(p + '/'));

export async function proxy(request: NextRequest) {
  // Auth not configured (e.g. preview without env) → don't gate anything so the
  // app still runs. Mirrors the null-client guard in lib/supabase.ts.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let res = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        res = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  // Do NOT put code between createServerClient and getUser — the session
  // refresh must run so cookies stay fresh on the response.
  // DELIBERATE fail-open: getUser() makes a network call to validate the JWT.
  // If Supabase is briefly unreachable we must NOT lock out an authenticated
  // user, so when the request carries an auth cookie we let a thrown/errored
  // getUser through. This is SAFE because this proxy is only a UX gate — the
  // HARD security boundary is the backend (app/security.py:get_current_user_id
  // verifies every data request's Bearer token with Supabase and enforces
  // per-row ownership). A let-through here still can't read another user's data.
  // Only a definitive no-session (no auth cookie) gates below.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.includes('-auth-token'));
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  } catch {
    if (hasAuthCookie) return res;
  }

  const { pathname } = request.nextUrl;

  // Logged-out user hitting a protected route → bounce to /login, remembering
  // where they wanted to go.
  if (matches(pathname, PROTECTED_PATHS) && !user) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // Logged-in user on a sign-in/up screen → send them into the app.
  if (matches(pathname, AUTH_PATHS) && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return res;
}

export const config = {
  // Run on everything except static assets and image files. /auth/callback is
  // intentionally NOT in PROTECTED/AUTH lists, so it passes through untouched —
  // that's where the OAuth code exchange sets the session cookie.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
