import base64
import json
import time
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from app.database import get_db
from app.models.schemas import ResumeDocumentOut, ResumeGenRequest
from app.security import get_current_user_id, owned_profile_ids, require_owned_match
from app.workers.celery_app import get_sync_redis

router = APIRouter()

# task_id → owner mapping is stored in Redis (TTL) because a Celery task_id is
# NOT authorization on its own. /status verifies the caller owns the task. This
# is the documented stopgap; a durable resume_tasks DB table would survive a
# Redis flush, but Redis is already the task backend so the TTL window matches
# the task lifetime.
_RESUME_TASK_TTL = 86400  # 24h
_RESUME_TASK_DEAD_SECONDS = 35


# Shared pooled sync client — a per-request from_url() would TLS-handshake on
# every /status poll and leak pool connections.
_redis = get_sync_redis


def _resume_task_key(task_id: str) -> str:
    return f"resume_task_owner:{task_id}"


def _require_owned_resume(db, resume_id: str, user_id: str) -> dict:
    """Resume → match → mission → user. 404 if the resume isn't the caller's."""
    try:
        r = db.table("resumes").select("*").eq("id", resume_id).single().execute().data
    except Exception:
        r = None
    if not r:
        raise HTTPException(404, "Resume not found")
    require_owned_match(db, r["match_id"], user_id)  # 404 if not owned
    return r


def _resume_urls(row: dict) -> dict:
    # RELATIVE paths only — never a hardcoded prod host. The frontend joins
    # these with its configured API base and fetches them WITH the bearer
    # token (the download routes are auth-gated).
    base = f"/api/v1/resumes/{row['id']}"
    return {
        "download_url": f"{base}/download",
        "cover_letter_url": (
            f"{base}/cover-letter/download"
            if row.get("cover_letter_pdf_url") else None
        ),
    }


def _owned_mission_ids(db, user_id: str) -> list[str]:
    ids: set[str] = set()
    rows = db.table("missions").select("id").eq("user_id", user_id).execute().data or []
    ids.update(r["id"] for r in rows)

    profiles = owned_profile_ids(db, user_id)
    if profiles:
        legacy_rows = (
            db.table("missions")
            .select("id")
            .in_("profile_id", profiles)
            .execute()
            .data
            or []
        )
        ids.update(r["id"] for r in legacy_rows)
    return list(ids)


@router.post("/generate", response_model=dict, status_code=202)
async def generate_resume(
    payload: ResumeGenRequest,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Enqueue resume generation. Returns Celery task ID immediately."""
    from app.workers.resume import generate_resume_task

    require_owned_match(db, payload.match_id, user_id)  # 401 if unauth, 404 if not owned
    task = generate_resume_task.delay(
        payload.match_id,
        payload.include_cover_letter,
        payload.tone,
    )
    # Bind the task to its owner BEFORE returning so /status can't be read by
    # another user who obtains the task_id (a task_id is NOT authorization). If
    # we can't persist the mapping, the task would be UNPOLLABLE (every /status
    # 404s) — so revoke it and fail the request rather than hand back a broken
    # "queued" task.
    try:
        _redis().setex(
            _resume_task_key(task.id),
            _RESUME_TASK_TTL,
            json.dumps({
                "user_id": user_id,
                "match_id": payload.match_id,
                "created_at": time.time(),
            }),
        )
    except Exception:
        try:
            from app.workers.celery_app import celery_app
            celery_app.control.revoke(task.id)
        except Exception:
            pass
        raise HTTPException(503, "Could not start resume generation — please retry.")
    return {"task_id": task.id, "status": "queued", "match_id": payload.match_id}


@router.get("/status/{task_id}")
async def resume_status(task_id: str, user_id: str = Depends(get_current_user_id)):
    from app.workers.celery_app import celery_app

    # Ownership: a task_id alone is not authorization — the caller must own it.
    try:
        raw = _redis().get(_resume_task_key(task_id))
    except Exception:
        # State store unreachable — controlled error, not a silent 200/404.
        raise HTTPException(503, "Could not check task status — please retry.")
    if not raw:
        raise HTTPException(404, "Task not found")
    try:
        owner = json.loads(raw)
    except Exception:
        # Corrupt mapping — controlled error, never a 500 or broken poll loop.
        raise HTTPException(503, "Task ownership record is unreadable — please retry.")
    if not isinstance(owner, dict) or owner.get("user_id") != user_id:
        raise HTTPException(404, "Task not found")  # 404, don't confirm existence

    result = celery_app.AsyncResult(task_id)
    try:
        age = time.time() - float(owner.get("created_at") or time.time())
    except (TypeError, ValueError):
        age = 0
    if not result.ready() and age > _RESUME_TASK_DEAD_SECONDS:
        return {
            "task_id": task_id,
            "status": "FAILURE",
            "result": {"error": "Resume generation timed out. Please retry."},
        }
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }


@router.get("/", response_model=list[ResumeDocumentOut])
async def list_resumes(
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    mission_ids = _owned_mission_ids(db, user_id)
    if not mission_ids:
        return []

    match_result = (
        db.table("matches")
        .select("id, mission_id, overall_score, grade, jobs(title, company)")
        .in_("mission_id", mission_ids)
        .execute()
    )
    matches = {m["id"]: m for m in (match_result.data or [])}
    if not matches:
        return []

    resume_result = (
        db.table("resumes")
        .select("id, match_id, cover_letter_pdf_url, keywords_injected, created_at")
        .in_("match_id", list(matches.keys()))
        .order("created_at", desc=True)
        .execute()
    )

    docs = []
    for row in (resume_result.data or []):
        match = matches.get(row["match_id"])
        if not match:
            continue
        job = match.get("jobs") or {}
        docs.append({
            "id": row["id"],
            "match_id": row["match_id"],
            "job_title": job.get("title") or "Untitled role",
            "company": job.get("company") or "Unknown company",
            "overall_score": match.get("overall_score") or 0,
            "grade": match.get("grade") or "C",
            **_resume_urls(row),
            "keywords_injected": row.get("keywords_injected") or [],
            "created_at": row["created_at"],
        })
    return docs


@router.get("/match/{match_id}", response_model=list)
async def list_resumes_for_match(
    match_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    require_owned_match(db, match_id, user_id)  # 401 if unauth, 404 if not owned
    result = (
        db.table("resumes")
        .select("id, match_id, pdf_url, cover_letter_pdf_url, keywords_injected, created_at")
        .eq("match_id", match_id)
        .order("created_at", desc=True)
        .execute()
    )
    # Don't return the raw base64 in the list — just metadata + download URL
    rows = []
    for row in (result.data or []):
        rows.append({
            "id": row["id"],
            "match_id": row["match_id"],
            **_resume_urls(row),
            "keywords_injected": row.get("keywords_injected", []),
            "created_at": row["created_at"],
        })
    return rows


@router.get("/{resume_id}/download")
async def download_resume(
    resume_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Return the DOCX file as a binary download."""
    # _require_owned_resume already fetched the full row — no second query.
    row = _require_owned_resume(db, resume_id, user_id)  # 401 if unauth, 404 if not owned

    pdf_url = row.get("pdf_url", "")
    if not pdf_url:
        raise HTTPException(404, "Resume file not generated yet")

    if pdf_url.startswith("data:"):
        # Extract base64 payload
        _, b64 = pdf_url.split(",", 1)
        docx_bytes = base64.b64decode(b64)
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="Resume_{resume_id[:8]}.docx"'},
        )
    else:
        # It's an external URL — redirect
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=pdf_url)


@router.get("/{resume_id}/cover-letter/download")
async def download_cover_letter(
    resume_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Return the tailored cover letter DOCX as a binary download."""
    # _require_owned_resume already fetched the full row — no second query.
    row = _require_owned_resume(db, resume_id, user_id)  # 401 if unauth, 404 if not owned

    cl_url = row.get("cover_letter_pdf_url", "")
    if not cl_url:
        raise HTTPException(404, "No cover letter generated for this resume")

    if cl_url.startswith("data:"):
        _, b64 = cl_url.split(",", 1)
        docx_bytes = base64.b64decode(b64)
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="CoverLetter_{resume_id[:8]}.docx"'},
        )
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=cl_url)
