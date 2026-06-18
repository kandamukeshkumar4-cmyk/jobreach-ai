from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional

from app.database import get_db
from app.models.schemas import (
    ApplicationCreate, ApplicationUpdate, ApplicationOut, ApplicationStatus
)

router = APIRouter()


@router.get("/", response_model=List[ApplicationOut])
async def list_applications(
    status: Optional[ApplicationStatus] = None,
    db=Depends(get_db),
):
    query = db.table("applications").select(
        "*, matches(overall_score, grade, jobs(title, company))"
    ).order("created_at", desc=True)
    if status:
        query = query.eq("status", status.value)
    result = query.execute()
    return result.data


@router.post("/", response_model=ApplicationOut, status_code=201)
async def create_application(payload: ApplicationCreate, db=Depends(get_db)):
    # Pull match + job info to denormalise onto application row
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
):
    update = payload.model_dump(exclude_none=True)
    result = (
        db.table("applications")
        .update(update)
        .eq("id", application_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Application not found")
    return result.data[0]


@router.delete("/{application_id}", status_code=204)
async def delete_application(application_id: str, db=Depends(get_db)):
    db.table("applications").delete().eq("id", application_id).execute()


@router.get("/stats/summary")
async def tracker_stats(db=Depends(get_db)):
    result = db.table("applications").select("status").execute()
    rows = result.data
    counts = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    return {"total": len(rows), "by_status": counts}
