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

router = APIRouter()

# Self-heal thresholds. Completion normally fires from the Redis `attempted`
# counter in score._check_mission_complete, but a hard-killed worker (OOM /
# SIGKILL) never increments it, stranding the mission on 'running' forever.
# These let a read finalize a mission whose worker clearly died.
MISSION_MIN_AGE_SECONDS = 90        # never touch a just-started mission
MISSION_STALL_QUIET_SECONDS = 300   # no event AND no new match for 5 min = dead


def _redis_client():
    s = get_settings()
    return aioredis.from_url(_redis_url_with_ssl(s.redis_url), decode_responses=True)


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
async def create_mission(payload: MissionCreate, db=Depends(get_db)):
    """Create and immediately queue a new agent mission."""
    from app.workers.search import run_mission

    row = {
        "profile_id": payload.profile_id,
        "title": payload.title,
        "search_query": payload.search_query,
        "location_filter": payload.location_filter,
        "salary_min": payload.salary_min,
        "salary_currency": payload.salary_currency,
        "sources": payload.sources,
        "status": "pending",
    }

    result = db.table("missions").insert(row).execute()
    mission = result.data[0]

    # Dispatch the orchestrator task
    run_mission.delay(mission["id"])

    return mission


@router.get("/", response_model=List[MissionOut])
async def list_missions(db=Depends(get_db)):
    result = db.table("missions").select("*").order("created_at", desc=True).limit(50).execute()
    return [_reconcile_if_stalled(db, m) for m in (result.data or [])]


@router.get("/{mission_id}", response_model=MissionOut)
async def get_mission(mission_id: str, db=Depends(get_db)):
    result = db.table("missions").select("*").eq("id", mission_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Mission not found")
    return _reconcile_if_stalled(db, result.data)


@router.get("/{mission_id}/events", response_model=List[MissionEventOut])
async def get_mission_events(mission_id: str, db=Depends(get_db)):
    result = (
        db.table("mission_events")
        .select("*")
        .eq("mission_id", mission_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.get("/{mission_id}/stream")
async def stream_mission_events(mission_id: str, request: Request):
    """
    SSE endpoint — frontend connects here to receive live agent telemetry.
    Publishes events from Redis pub/sub channel mission:{mission_id}.
    """
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
