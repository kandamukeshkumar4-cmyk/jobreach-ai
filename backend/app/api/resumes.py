import base64
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from app.database import get_db
from app.models.schemas import ResumeGenRequest

router = APIRouter()


@router.post("/generate", response_model=dict, status_code=202)
async def generate_resume(payload: ResumeGenRequest, db=Depends(get_db)):
    """Enqueue resume generation. Returns Celery task ID immediately."""
    from app.workers.resume import generate_resume_task

    task = generate_resume_task.delay(
        payload.match_id,
        payload.include_cover_letter,
        payload.tone,
    )
    return {"task_id": task.id, "status": "queued", "match_id": payload.match_id}


@router.get("/status/{task_id}")
async def resume_status(task_id: str):
    from app.workers.celery_app import celery_app
    result = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }


@router.get("/match/{match_id}", response_model=list)
async def list_resumes_for_match(match_id: str, db=Depends(get_db)):
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
        base = f"https://jobreach-api.azurewebsites.net/api/v1/resumes/{row['id']}"
        rows.append({
            "id": row["id"],
            "match_id": row["match_id"],
            "download_url": f"{base}/download",
            "cover_letter_url": (f"{base}/cover-letter/download"
                                 if row.get("cover_letter_pdf_url") else None),
            "keywords_injected": row.get("keywords_injected", []),
            "created_at": row["created_at"],
        })
    return rows


@router.get("/{resume_id}/download")
async def download_resume(resume_id: str, db=Depends(get_db)):
    """Return the DOCX file as a binary download."""
    result = (
        db.table("resumes")
        .select("pdf_url, tailored_markdown")
        .eq("id", resume_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Resume not found")

    pdf_url = result.data[0].get("pdf_url", "")
    if not pdf_url:
        raise HTTPException(404, "Resume file not generated yet")

    if pdf_url.startswith("data:"):
        # Extract base64 payload
        _, b64 = pdf_url.split(",", 1)
        docx_bytes = base64.b64decode(b64)
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="Mukesh_Kandada_Resume_{resume_id[:8]}.docx"'},
        )
    else:
        # It's an external URL — redirect
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=pdf_url)


@router.get("/{resume_id}/cover-letter/download")
async def download_cover_letter(resume_id: str, db=Depends(get_db)):
    """Return the tailored cover letter DOCX as a binary download."""
    result = (
        db.table("resumes")
        .select("cover_letter_pdf_url")
        .eq("id", resume_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Resume not found")

    cl_url = result.data[0].get("cover_letter_pdf_url", "")
    if not cl_url:
        raise HTTPException(404, "No cover letter generated for this resume")

    if cl_url.startswith("data:"):
        _, b64 = cl_url.split(",", 1)
        docx_bytes = base64.b64decode(b64)
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="Mukesh_Kandada_CoverLetter_{resume_id[:8]}.docx"'},
        )
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=cl_url)
