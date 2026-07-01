from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import List, AsyncGenerator
from datetime import datetime, timezone
import asyncio
import json
import redis.asyncio as aioredis

from app.config import get_settings
from app.database import get_db
from app.models.schemas import MissionCreate, MissionOut, MissionEventOut
from app.workers.celery_app import _redis_url_with_ssl
from app.security import (
    get_current_user_id, require_owned_mission, owned_profile_ids, mission_lock_key,
)

router = APIRouter()

# Self-heal thresholds. Completion normally fires from the Redis `attempted`
# counter in score._check_mission_complete, but a hard-killed worker (OOM /
# SIGKILL) never increments it, stranding the mission on 'running' forever.
# These let a read finalize a mission whose worker clearly died.
MISSION_MIN_AGE_SECONDS = 90        # never touch a just-started mission
# A real mission finishes in well under 10 min; only declare death after a long
# quiet window so a slow company-research fetch or a backlogged-but-alive worker
# is NOT mislabelled failed. (The worker is now supervised + auto-restarting, so
# genuine deaths are rare; this is a last-resort net, not the primary mechanism.)
MISSION_STALL_QUIET_SECONDS = 1800  # 30 min with no event AND no new match = dead


def _redis_client():
    s = get_settings()
    return aioredis.from_url(_redis_url_with_ssl(s.redis_url), decode_responses=True)


def _sync_redis():
    import redis as _r
    s = get_settings()
    return _r.from_url(_redis_url_with_ssl(s.redis_url), decode_responses=True)


def _parse_ts(ts: str) -> datetime:
    """Parse a Supabase ISO timestamp into a tz-aware datetime."""
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    dt = datetime.fromisoformat(ts)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _newest_ts(db, table: str, mission_id: str):
    rows = (
        db.table(table).select("created_at").eq("mission_id", mission_id)
        .order("created_at", desc=True).limit(1).execute().data
    )
    if rows and rows[0].get("created_at"):
        return _parse_ts(rows[0]["created_at"])
    return None


def _finalize(db, mission: dict, update: dict, event: dict) -> dict:
    mid = mission["id"]
    db.table("missions").update(update).eq("id", mid).execute()
    db.table("mission_events").insert({"mission_id": mid, **event}).execute()
    return {**mission, **update}


def _reconcile_if_stalled(db, mission: dict) -> dict:
    """Finalize a mission whose worker died so the UI never hangs forever.

    Two stuck states, both caused by a Celery worker dying (OOM/SIGKILL):
      - 'pending'  : the worker never picked the mission up → nothing was done.
      - 'running'  : the worker started then died mid-scoring.

    For 'running', heartbeat = newest of (last mission_event, last match row).
    Scoring inserts a match row for EVERY graded job (A-F) and failures emit a
    warn event, so this advances on real progress even though only A/B grades
    emit a 'star' event. Safe to call on every read: it only acts once the
    mission is old enough AND silent past the stall window.
    """
    if not mission or mission.get("status") not in ("pending", "running"):
        return mission
    try:
        now = datetime.now(timezone.utc)
        created = _parse_ts(mission["created_at"])
        age = (now - created).total_seconds()
        if age < MISSION_MIN_AGE_SECONDS:
            return mission

        mid = mission["id"]

        # 'pending' past the grace window = the worker never started it. No work
        # exists to salvage, so fail it. (A healthy queue picks a mission up in
        # seconds; only a dead/missing worker leaves it pending this long.)
        if mission["status"] == "pending":
            if age < MISSION_STALL_QUIET_SECONDS:
                return mission
            return _finalize(db, mission, {"status": "failed"}, {
                "event_type": "error",
                "message": "Mission failed: no worker picked it up",
            })

        # 'running': check the heartbeat.
        heartbeats = [created]
        for table in ("mission_events", "matches"):
            ts = _newest_ts(db, table, mid)
            if ts:
                heartbeats.append(ts)
        if (now - max(heartbeats)).total_seconds() < MISSION_STALL_QUIET_SECONDS:
            return mission  # still progressing

        matches = (
            db.table("matches").select("id, grade").eq("mission_id", mid).execute().data
            or []
        )
        strong = sum(1 for m in matches if m.get("grade") in ("A", "B"))
        if matches:
            return _finalize(db, mission, {"status": "completed", "total_matches": strong}, {
                "event_type": "ok",
                "message": "Mission complete (recovered after worker stall)",
            })
        return _finalize(db, mission, {"status": "failed"}, {
            "event_type": "error",
            "message": "Mission failed: worker stalled before producing matches",
        })
    except Exception:
        # Never let self-heal break a normal read.
        return mission


@router.post("/", response_model=MissionOut, status_code=201)
async def create_mission(
    payload: MissionCreate,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Create and immediately queue a new agent mission."""
    from app.workers.search import run_mission
    from datetime import datetime, timezone, timedelta

    # Ownership: the client-supplied profile_id MUST belong to the caller — else
    # a user could launch missions against another user's profile.
    if payload.profile_id not in owned_profile_ids(db, user_id):
        raise HTTPException(403, "That profile does not belong to you")

    # One mission at a time (per profile): refuse to start a new one while the
    # previous is still in flight. A mission older than 5 min still marked
    # running/pending is treated as stale (dead worker) and does NOT block —
    # otherwise a crash would lock the user out permanently. Missions now target
    # <2 min, so 5 min is a safe staleness cutoff.
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    pids = owned_profile_ids(db, user_id)
    q = (
        db.table("missions")
        .select("id")
        .in_("status", ["pending", "running"])
        .gte("created_at", cutoff)
    )
    # Match by user_id OR by an owned profile_id, so a LEGACY running mission
    # (created before user_id was stamped, NULL user_id) still blocks a new one.
    if pids:
        q = q.or_(f"user_id.eq.{user_id},profile_id.in.({','.join(pids)})")
    else:
        q = q.eq("user_id", user_id)
    active = q.execute().data or []
    if active:
        # Legacy fallback: a running mission from before locks existed (its
        # profile is owned by this user) still blocks. The atomic guard below
        # handles all NEW missions race-free.
        raise HTTPException(
            409,
            "A mission is already running — let it finish before starting another.",
        )

    # ATOMIC per-user concurrency guard: SETNX wins the race between two
    # simultaneous creates, so exactly ONE proceeds (the read-check above can't —
    # two requests can both read "no active mission" before either inserts).
    # Released on completion/failure by the score worker; 600s TTL is the crash
    # safety net (missions target <2 min).
    rds = _sync_redis()
    lock_key = mission_lock_key(user_id)
    if not rds.set(lock_key, "pending", nx=True, ex=600):
        raise HTTPException(
            409,
            "A mission is already running — let it finish before starting another.",
        )

    row = {
        "user_id": user_id,
        "profile_id": payload.profile_id,
        "title": payload.title,
        "search_query": payload.search_query,
        "location_filter": payload.location_filter,
        "salary_min": payload.salary_min,
        "salary_currency": payload.salary_currency,
        "sources": payload.sources,
        "status": "pending",
    }

    try:
        result = db.table("missions").insert(row).execute()
        mission = result.data[0]
    except Exception:
        rds.delete(lock_key)  # never strand the lock on a failed insert
        raise

    rds.set(lock_key, mission["id"], ex=600)  # tag the lock with the mission id

    # Dispatch the orchestrator task
    run_mission.delay(mission["id"])

    return mission


@router.get("/", response_model=List[MissionOut])
async def list_missions(
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    # Only the caller's own missions. Match by user_id OR by an owned profile_id
    # so older rows (created before user_id was stamped) still surface.
    pids = owned_profile_ids(db, user_id)
    q = db.table("missions").select("*").order("created_at", desc=True).limit(50)
    if pids:
        q = q.or_(f"user_id.eq.{user_id},profile_id.in.({','.join(pids)})")
    else:
        q = q.eq("user_id", user_id)
    result = q.execute()
    return result.data or []


@router.get("/{mission_id}", response_model=MissionOut)
async def get_mission(
    mission_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    mission = require_owned_mission(db, mission_id, user_id)
    return _reconcile_if_stalled(db, mission)


@router.get("/{mission_id}/events", response_model=List[MissionEventOut])
async def get_mission_events(
    mission_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    require_owned_mission(db, mission_id, user_id)  # 404 if not owned
    result = (
        db.table("mission_events")
        .select("*")
        .eq("mission_id", mission_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.get("/{mission_id}/stream")
async def stream_mission_events(
    mission_id: str,
    request: Request,
    user_id: str = Depends(get_current_user_id),
):
    """
    SSE endpoint — frontend connects here to receive live agent telemetry.
    Publishes events from Redis pub/sub channel mission:{mission_id}.
    """
    require_owned_mission(get_db(), mission_id, user_id)  # 401 if unauth, 404 if not owned

    async def event_generator() -> AsyncGenerator[str, None]:
        r = _redis_client()
        pubsub = r.pubsub()
        await pubsub.subscribe(f"mission:{mission_id}")

        try:
            # First send all existing events (replay)
            db = get_db()
            existing = (
                db.table("mission_events")
                .select("*")
                .eq("mission_id", mission_id)
                .order("created_at")
                .execute()
            )
            for ev in existing.data:
                yield f"data: {json.dumps(ev)}\n\n"

            # Then stream new ones from pub/sub
            async for message in pubsub.listen():
                if await request.is_disconnected():
                    break
                if message["type"] == "message":
                    yield f"data: {message['data']}\n\n"
                await asyncio.sleep(0.05)
        finally:
            await pubsub.unsubscribe(f"mission:{mission_id}")
            await r.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
