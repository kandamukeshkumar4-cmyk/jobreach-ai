"""Interview prep generator — per-application prep docs (career-ops port).

Mounted at /api/v1/interview. One LLM call per prep; on failure the endpoint
returns 503 (no fallback doc) so the caller can retry.
"""
import asyncio
import json

import structlog
from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI

from app.config import get_settings
from app.database import get_db
from app.models.schemas import InterviewPrepRequest, InterviewPrepOut
from app.security import get_current_user_id

router = APIRouter()
log = structlog.get_logger()

_PREP_FIELDS = "id, application_id, company, role, content_md, created_at"

_PREP_PROMPT = """\
You are an interview coach preparing a candidate for a specific job interview.

Role: {job_title} at {company}

Job description snippet:
{description}

Job URL: {url}

Why the candidate fits (from prior analysis):
{why_fit}

Fit dimensions (from prior analysis):
{dimensions}

Company research (from prior analysis):
{company_research}

Candidate resume (Markdown):
{resume}

Write a concise interview prep document in MARKDOWN with EXACTLY these sections:

## Role snapshot
3 bullets summarising what this role is and what matters most to the hiring team.

## Likely interview questions
6-8 questions, a mix of technical and behavioral. For each question add a \
one-line 'anchor' pointing to a REAL fact from the resume the candidate can \
use in their answer.

## STAR story outlines
3 outlines (Situation / Task / Action / Result) built ONLY from real facts in \
the resume above. NEVER invent employers, projects, or metrics that are not \
in the resume.

## Questions to ask them
4 sharp questions the candidate should ask the interviewers.

Output ONLY the Markdown document — no preamble, no explanation.
"""


def _require_owned_application(db, application_id: str, user_id: str) -> dict:
    try:
        app = (
            db.table("applications")
            .select("*")
            .eq("id", application_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        app = None
    if not app or app.get("user_id") != user_id:
        raise HTTPException(404, "Application not found")
    return app


def _load_match_context(db, match_id: str) -> dict:
    if not match_id:
        return {}
    try:
        match = (
            db.table("matches")
            .select("why_fit, dimensions, company_research, jobs(description_snippet, url)")
            .eq("id", match_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        match = None
    return match or {}


def _load_resume_markdown(db, user_id: str) -> str:
    try:
        result = (
            db.table("profiles")
            .select("resume_markdown")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return (rows[0].get("resume_markdown") or "") if rows else ""
    except Exception:
        return ""


def _generate_prep_md(context: dict) -> str:
    s = get_settings()
    client = OpenAI(
        api_key=s.nvidia_api_key,
        base_url="https://integrate.api.nvidia.com/v1",
        timeout=25,
    )
    resp = client.chat.completions.create(
        model="meta/llama-3.3-70b-instruct",
        max_tokens=1400,
        temperature=0.3,
        messages=[{"role": "user", "content": _PREP_PROMPT.format(**context)}],
    )
    md = (resp.choices[0].message.content or "").strip()
    if md.startswith("```"):
        lines = md.splitlines()
        md = "\n".join(lines[1:-1] if lines and lines[-1].startswith("```") else lines[1:])
        md = md.strip()
    if not md:
        raise ValueError("empty LLM response")
    return md


@router.post("/prep", response_model=InterviewPrepOut, status_code=201)
async def create_prep(
    payload: InterviewPrepRequest,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    app = _require_owned_application(db, payload.application_id, user_id)

    match = _load_match_context(db, app.get("match_id"))
    job = match.get("jobs") or {}
    resume_md = _load_resume_markdown(db, user_id)

    dimensions = match.get("dimensions")
    company_research = match.get("company_research")
    context = {
        "job_title": app.get("job_title") or "Unknown role",
        "company": app.get("company") or "Unknown company",
        "description": (job.get("description_snippet") or "Not available")[:2000],
        "url": job.get("url") or "Not available",
        "why_fit": (match.get("why_fit") or "Not available")[:1500],
        "dimensions": (json.dumps(dimensions) if dimensions else "Not available")[:1500],
        "company_research": (json.dumps(company_research) if company_research else "Not available")[:1500],
        "resume": (resume_md or "Not available")[:6000],
    }

    try:
        content_md = await asyncio.to_thread(_generate_prep_md, context)
    except Exception as exc:
        log.warning("interview_prep_llm_failed",
                    application_id=payload.application_id, error=str(exc))
        raise HTTPException(503, "Prep generation is busy — retry in a moment.")

    row = {
        "user_id": user_id,
        "application_id": payload.application_id,
        "company": app.get("company"),
        "role": app.get("job_title"),
        "content_md": content_md,
    }
    result = db.table("interview_preps").insert(row).execute()
    if not result.data:
        raise HTTPException(503, "Could not save prep — please retry.")
    saved = result.data[0]
    return {
        "id": saved["id"],
        "application_id": saved["application_id"],
        "company": saved.get("company"),
        "role": saved.get("role"),
        "content_md": saved["content_md"],
        "created_at": saved["created_at"],
    }


@router.get("/prep/{application_id}", response_model=InterviewPrepOut)
async def get_prep(
    application_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    result = (
        db.table("interview_preps")
        .select(_PREP_FIELDS)
        .eq("application_id", application_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(404, "No prep found for this application")
    return rows[0]
