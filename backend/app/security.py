"""Backend auth + ownership enforcement — the HARD security boundary.

The Next.js proxy is a UX gate (it can fail open on a Supabase blip); these
dependencies are the real boundary. Every route that exposes or mutates a
user's data must depend on `get_current_user_id` and verify ownership.
"""
import time
import threading
from fastapi import Header, HTTPException
import requests
from app.config import get_settings

# ── Short-lived token-verification cache ──────────────────────────────────────
# Verifying every request against Supabase /auth/v1/user is a network hop per
# call. Cache the (verified) token→user_id for a SHORT window so a burst of polls
# from one client doesn't hammer the auth service. Bounded by _TOKEN_TTL and a
# size cap; failures are NEVER cached (fail closed). Keyed by token (process-
# local memory only — never persisted, never logged).
_TOKEN_TTL = 60  # seconds
_TOKEN_CACHE_MAX = 2000
_token_cache: dict[str, tuple[str, float]] = {}
_token_cache_lock = threading.Lock()


def _cache_get(token: str) -> str | None:
    now = time.time()
    with _token_cache_lock:
        hit = _token_cache.get(token)
        if hit and hit[1] > now:
            return hit[0]
        if hit:
            _token_cache.pop(token, None)
    return None


def _cache_put(token: str, uid: str) -> None:
    with _token_cache_lock:
        if len(_token_cache) >= _TOKEN_CACHE_MAX:
            _token_cache.clear()  # simple bound; cache is just a perf hint
        _token_cache[token] = (uid, time.time() + _TOKEN_TTL)


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    """Verify the `Authorization: Bearer <jwt>` against Supabase and return the
    user_id. Raises 401 on a missing/invalid/expired token.

    Uses a stateless HTTP call to Supabase's /auth/v1/user (not the shared
    supabase-py client, whose auth state would race under concurrent requests),
    fronted by a 60s verified-token cache. Fails CLOSED on any error."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    cached = _cache_get(token)
    if cached:
        return cached

    s = get_settings()
    try:
        resp = requests.get(
            f"{s.supabase_url}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": s.supabase_anon_key},
            timeout=10,
        )
    except Exception:
        # Can't reach the auth service — fail CLOSED (this is the hard boundary).
        raise HTTPException(status_code=503, detail="Auth service unavailable")
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    uid = (resp.json() or {}).get("id")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    _cache_put(token, uid)
    return uid


# ── Ownership helpers ─────────────────────────────────────────────────────────

def owned_profile_ids(db, user_id: str) -> list[str]:
    """All profile ids owned by this user."""
    rows = db.table("profiles").select("id").eq("user_id", user_id).execute().data or []
    return [r["id"] for r in rows]


def require_owned_mission(db, mission_id: str, user_id: str) -> dict:
    """Return the mission iff the user owns it (by missions.user_id OR by its
    profile's user_id, so older rows without user_id still resolve). Else 404 —
    we 404 rather than 403 so the API doesn't confirm the existence of other
    users' resources."""
    try:
        m = db.table("missions").select("*").eq("id", mission_id).single().execute().data
    except Exception:
        m = None
    if not m:
        raise HTTPException(status_code=404, detail="Mission not found")
    if m.get("user_id") == user_id:
        return m
    if m.get("profile_id") and m["profile_id"] in owned_profile_ids(db, user_id):
        return m
    raise HTTPException(status_code=404, detail="Mission not found")


def require_owned_match(db, match_id: str, user_id: str) -> dict:
    """Return the match iff its mission belongs to the user, else 404."""
    try:
        match = db.table("matches").select("*").eq("id", match_id).single().execute().data
    except Exception:
        match = None
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    require_owned_mission(db, match["mission_id"], user_id)  # raises 404 if not owned
    return match


def require_owned_profile(db, profile_id: str, user_id: str) -> dict:
    """Return the profile iff owned by the user, else 404.

    DELIBERATELY no legacy fallback for NULL-user_id profiles (unlike missions,
    which fall back to their profile's owner): the only inferable link would be
    the row's email, and email is user-supplied at profile creation — matching
    on it would let anyone claim a legacy profile by registering its email.
    Legacy profiles must be stamped via scripts/backfill_user_id.py (manual
    resolution) before their owner can see them again."""
    try:
        p = db.table("profiles").select("*").eq("id", profile_id).single().execute().data
    except Exception:
        p = None
    if not p or p.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Profile not found")
    return p


# ── Per-user mission concurrency lock ─────────────────────────────────────────
# The lock VALUE is the holding mission_id. Release is compare-and-delete (Lua,
# atomic) so a stale mission completing late can't delete a NEWER mission's lock
# (e.g. mission A's 600s TTL expired, the user started mission B which acquired
# the same per-user key, then A's worker finally finishes — A must NOT release
# B's lock). The 600s TTL is a deliberate stale-release: a mission still holding
# the lock after 10 min is treated as dead so the user isn't blocked forever
# (missions target <2 min); the compare-and-delete is what makes that safe.

def mission_lock_key(user_id: str) -> str:
    return f"mission_active:{user_id}"


# KEYS[1]=lock key, ARGV[1]=our mission_id. Delete only if we still hold it.
_RELEASE_LOCK_LUA = (
    "if redis.call('get', KEYS[1]) == ARGV[1] then "
    "return redis.call('del', KEYS[1]) else return 0 end"
)


def release_mission_lock(r, user_id: str, mission_id: str) -> None:
    """Atomically release the lock ONLY if it still holds this mission_id."""
    if not user_id or not mission_id:
        return
    try:
        r.eval(_RELEASE_LOCK_LUA, 1, mission_lock_key(user_id), str(mission_id))
    except Exception:
        pass
