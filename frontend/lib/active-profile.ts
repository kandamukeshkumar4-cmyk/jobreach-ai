import { supabase } from './supabase'

/**
 * Per-user cache for the active profile id.
 *
 * The active profile id used to live under a single global localStorage key
 * (`jobreach.activeProfileId`). That key is NOT tied to a user, so on a shared
 * browser a second account inherited the first account's profile id — the
 * layout trusted it, skipped onboarding, and the mission launch then failed
 * with `403 That profile does not belong to you`.
 *
 * The fix: namespace the cache by Supabase user id, always purge the legacy
 * global key on sight, and only ever hand back the CURRENT user's id (never
 * another user's).
 */

const BASE_KEY = 'jobreach.activeProfileId'

function keyFor(userId: string) {
  return `${BASE_KEY}:${userId}`
}

/** Delete the legacy un-namespaced key. It leaks across accounts, so we remove
 *  it whenever we touch this storage. */
function purgeLegacyKey() {
  try {
    localStorage.removeItem(BASE_KEY)
  } catch {
    // localStorage unavailable — nothing to purge.
  }
}

/** Resolve the current Supabase user id, or null when signed out / unavailable. */
export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Read the cached active profile id for the CURRENT user only. Returns null
 * when signed out, or when this user has never cached a profile — it can never
 * return another user's id.
 */
export async function readActiveProfileId(): Promise<string | null> {
  purgeLegacyKey()
  const uid = await currentUserId()
  if (!uid) return null
  try {
    return localStorage.getItem(keyFor(uid))
  } catch {
    return null
  }
}

/** Persist the active profile id under the current user's namespace. */
export async function writeActiveProfileId(id: string): Promise<void> {
  purgeLegacyKey()
  const uid = await currentUserId()
  if (!uid) return
  try {
    localStorage.setItem(keyFor(uid), id)
  } catch {
    // non-fatal
  }
}

/**
 * Clear the cached profile id for a specific user — call on sign-out, passing
 * the id from the still-live session BEFORE it is torn down. Also purges the
 * legacy global key.
 */
export function clearActiveProfileId(userId?: string | null): void {
  purgeLegacyKey()
  if (!userId) return
  try {
    localStorage.removeItem(keyFor(userId))
  } catch {
    // non-fatal
  }
}
