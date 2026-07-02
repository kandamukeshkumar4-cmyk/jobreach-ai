from fastapi import APIRouter, Depends, HTTPException, Response
from typing import List, Optional

from app.database import get_db
from app.models.schemas import (
    ApplicationCreate, ApplicationUpdate, ApplicationOut, ApplicationStatus
)
from app.security import get_current_user_id, require_owned_match

router = APIRouter()


def _require_owned_application(db, application_id: str, user_id: str) -> dict:
    try:
        app = db.table("applications").select("*").eq("id", application_id).single().execute().data
    except Exception:
        app = None
    if not app or app.get("user_id") != user_id:
        raise HTTPException(404, "Application not found")
    return app


@router.get("/", response_model=List[ApplicationOut])
async def list_applications(
    status: Optional[ApplicationStatus] = None,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    query = db.table("applications").select(
        "*, matches(overall_score, grade, jobs(title, company))"
    ).eq("user_id", user_id).order("created_at", desc=True)
    if status:
        query = query.eq("status", status.value)
    result = query.execute()
    return result.data


@router.post("/", response_model=ApplicationOut, status_code=201)
async def create_application(
    payload: ApplicationCreate,
    response: Response,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    # Ownership: the match must belong to one of the caller's missions.
    require_owned_match(db, payload.match_id, user_id)
    existing = (
        db.table("applications")
        .select("*")
        .eq("user_id", user_id)
        .eq("match_id", payload.match_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        response.status_code = 200
        return existing[0]

    match = (
        db.table("matches")
        .select("*, jobs(title, company)")
        .eq("id", payload.match_id)
        .single()
        .execute()
    )
    if not match.data:
        raise HTTPException(404, "Match not found")

    m = match.data
    row = {
        "user_id": user_id,
        "match_id": payload.match_id,
        "job_title": m["jobs"]["title"],
        "company": m["jobs"]["company"],
        "overall_score": m["overall_score"],
        "grade": m["grade"],
        "status": "evaluated",
        "notes": payload.notes,
    }
    result = db.table("applications").insert(row).execute()
    return result.data[0]


@router.patch("/{application_id}", response_model=ApplicationOut)
async def update_application(
    application_id: str,
    payload: ApplicationUpdate,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    _require_owned_application(db, application_id, user_id)
    update = payload.model_dump(exclude_none=True)
    result = (
        db.table("applications")
        .update(update)
        .eq("id", application_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Application not found")
    return result.data[0]


@router.delete("/{application_id}", status_code=204)
async def delete_application(
    application_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    _require_owned_application(db, application_id, user_id)
    db.table("applications").delete().eq("id", application_id).eq("user_id", user_id).execute()


@router.get("/stats/summary")
async def tracker_stats(
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    result = db.table("applications").select("status").eq("user_id", user_id).execute()
    rows = result.data
    counts = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    return {"total": len(rows), "by_status": counts}
