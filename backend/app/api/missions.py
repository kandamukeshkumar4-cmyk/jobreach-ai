from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import List, AsyncGenerator
import asyncio
import json
import redis.asyncio as aioredis

from app.config import get_settings
from app.database import get_db
from app.models.schemas import MissionCreate, MissionOut, MissionEventOut
from app.workers.celery_app import _redis_url_with_ssl

router = APIRouter()


def _redis_client():
    s = get_settings()
    return aioredis.from_url(_redis_url_with_ssl(s.redis_url), decode_responses=True)


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
    return result.data


@router.get("/{mission_id}", response_model=MissionOut)
async def get_mission(mission_id: str, db=Depends(get_db)):
    result = db.table("missions").select("*").eq("id", mission_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Mission not found")
    return result.data


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
