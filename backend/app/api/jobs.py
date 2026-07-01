from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional

from app.database import get_db
from app.models.schemas import JobOut, MatchOut
from app.security import get_current_user_id, require_owned_mission, require_owned_match

router = APIRouter()


@router.get("/matches/{mission_id}", response_model=List[MatchOut])
async def get_matches(
    mission_id: str,
    grade: Optional[str] = Query(None, description="Filter: A, B, C"),
    min_score: Optional[float] = Query(None),
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    require_owned_mission(db, mission_id, user_id)  # 401 if unauth, 404 if not owned
    query = (
        db.table("matches")
        .select("*, jobs(*)")
        .eq("mission_id", mission_id)
        .order("overall_score", desc=True)
    )
    if grade:
        query = query.eq("grade", grade)
    if min_score:
        query = query.gte("overall_score", min_score)

    result = query.execute()
    # Supabase returns joined rows with key "jobs" (table name); remap to "job"
    rows = result.data or []
    for row in rows:
        if "jobs" in row:
            row["job"] = row.pop("jobs")
    return rows


@router.get("/matches/detail/{match_id}", response_model=MatchOut)
async def get_match(
    match_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    require_owned_match(db, match_id, user_id)  # 401 if unauth, 404 if not owned
    result = (
        db.table("matches")
        .select("*, jobs(*)")
        .eq("id", match_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Match not found")
    row = result.data
    if "jobs" in row:
        row["job"] = row.pop("jobs")
    return row


@router.get("/{job_id}", response_model=JobOut)
async def get_job(
    job_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    # Jobs are shared scraped postings (not user-owned), but require a valid
    # session so the endpoint isn't an open data tap.
    result = db.table("jobs").select("*").eq("id", job_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Job not found")
    return result.data
