"""Application answers bank — reusable ATS-form answers (career-ops port).

Mounted at /api/v1/answers. Match ranking tries the LLM first and falls back
to deterministic token-overlap scoring on ANY failure — never a 500.
"""
import asyncio
import json
import re
from datetime import datetime, timezone
from typing import List

import structlog
from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI

from app.config import get_settings
from app.database import get_db
from app.models.schemas import (
    AnswerCreate, AnswerUpdate, AnswerMatchRequest, AnswerOut
)
from app.security import get_current_user_id

router = APIRouter()
log = structlog.get_logger()

_ANSWER_FIELDS = "id, question, answer, tags, times_used, created_at, updated_at"
_MATCH_CANDIDATE_CAP = 30
_MATCH_TOP_N = 5

_MATCH_PROMPT = """\
You rank stored Q/A pairs by how well each stored question matches a new ATS \
application question.

New ATS question:
{question}

Stored questions (id | question):
{candidates}

Score each stored question 0-100 for how well its saved answer would fit the \
new ATS question (100 = same question, 0 = unrelated). Respond with ONLY a \
JSON array like [{{"id": "...", "score": 87}}] — no prose, no markdown.
"""


def _require_owned_answer(db, answer_id: str, user_id: str) -> dict:
    try:
        row = (
            db.table("application_answers")
            .select("*")
            .eq("id", answer_id)
            .single()
            .execute()
            .data
        )
    except Exception:
        row = None
    if not row or row.get("user_id") != user_id:
        raise HTTPException(404, "Answer not found")
    return row


def _extract_json_array(raw: str) -> list:
    """Parse a model JSON array robustly: strip fences, isolate outermost array,
    repair trailing commas. Minimal port of app.workers.resume._extract_json."""
    if not raw:
        raise ValueError("empty LLM response")
    text = raw.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end != -1 and end > start:
        text = text[start:end + 1]
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = json.loads(re.sub(r",(\s*[}\]])", r"\1", text))
    if not isinstance(parsed, list):
        raise ValueError("expected a JSON array")
    return parsed


def _token_overlap_score(question_a: str, question_b: str) -> int:
    """Deterministic fallback: lowercase word Jaccard, scaled to 0-100."""
    tokens_a = set(str(question_a or "").lower().split())
    tokens_b = set(str(question_b or "").lower().split())
    union = tokens_a | tokens_b
    if not union:
        return 0
    return round(100 * len(tokens_a & tokens_b) / len(union))


def _fallback_matches(question: str, rows: List[dict]) -> List[dict]:
    scored = [
        {
            "id": r.get("id"),
            "question": r.get("question", ""),
            "answer": r.get("answer", ""),
            "score": _token_overlap_score(question, r.get("question", "")),
        }
        for r in rows
    ]
    scored.sort(key=lambda m: m["score"], reverse=True)
    return scored[:_MATCH_TOP_N]


def _llm_rank(question: str, rows: List[dict]) -> List[dict]:
    """One LLM call ranking candidates. Raises on any problem — caller falls back."""
    s = get_settings()
    client = OpenAI(
        api_key=s.nvidia_api_key,
        base_url="https://integrate.api.nvidia.com/v1",
        timeout=10,
    )
    candidates = "\n".join(
        f"{r.get('id')} | {str(r.get('question', ''))[:200]}"
        for r in rows[:_MATCH_CANDIDATE_CAP]
    )
    resp = client.chat.completions.create(
        model="meta/llama-3.1-8b-instruct",
        max_tokens=600,
        temperature=0.0,
        messages=[{
            "role": "user",
            "content": _MATCH_PROMPT.format(question=question[:1000], candidates=candidates),
        }],
    )
    raw = resp.choices[0].message.content or ""
    parsed = _extract_json_array(raw)

    by_id = {str(r.get("id")): r for r in rows}
    matches = []
    seen = set()
    for item in parsed:
        if not isinstance(item, dict):
            continue
        rid = str(item.get("id") or "")
        row = by_id.get(rid)
        if not row or rid in seen:
            continue
        try:
            score = int(round(float(item.get("score"))))
        except (TypeError, ValueError):
            continue
        score = max(0, min(100, score))
        seen.add(rid)
        matches.append({
            "id": row.get("id"),
            "question": row.get("question", ""),
            "answer": row.get("answer", ""),
            "score": score,
        })
    if not matches:
        raise ValueError("LLM returned no usable matches")
    matches.sort(key=lambda m: m["score"], reverse=True)
    return matches[:_MATCH_TOP_N]


@router.get("/", response_model=List[AnswerOut])
async def list_answers(
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    result = (
        db.table("application_answers")
        .select(_ANSWER_FIELDS)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/", response_model=AnswerOut, status_code=201)
async def create_answer(
    payload: AnswerCreate,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    row = {
        "user_id": user_id,
        "question": payload.question.strip(),
        "answer": payload.answer.strip(),
        "tags": payload.tags,
    }
    result = db.table("application_answers").insert(row).execute()
    if not result.data:
        raise HTTPException(503, "Could not save answer — please retry.")
    return result.data[0]


@router.put("/{answer_id}", response_model=AnswerOut)
async def update_answer(
    answer_id: str,
    payload: AnswerUpdate,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    _require_owned_answer(db, answer_id, user_id)
    update = payload.model_dump(exclude_none=True)
    if not update:
        raise HTTPException(422, "Nothing to update")
    if "question" in update:
        update["question"] = update["question"].strip()
    if "answer" in update:
        update["answer"] = update["answer"].strip()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = (
        db.table("application_answers")
        .update(update)
        .eq("id", answer_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Answer not found")
    return result.data[0]


@router.delete("/{answer_id}", status_code=204)
async def delete_answer(
    answer_id: str,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    _require_owned_answer(db, answer_id, user_id)
    (
        db.table("application_answers")
        .delete()
        .eq("id", answer_id)
        .eq("user_id", user_id)
        .execute()
    )


@router.post("/match")
async def match_answers(
    payload: AnswerMatchRequest,
    db=Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    result = (
        db.table("application_answers")
        .select("id, question, answer")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(_MATCH_CANDIDATE_CAP)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return {"matches": []}

    question = payload.question.strip()
    try:
        matches = await asyncio.to_thread(_llm_rank, question, rows)
    except Exception as exc:
        log.warning("answers_match_llm_fallback", error=str(exc))
        matches = _fallback_matches(question, rows)

    # Only count real matches — a score-0 fallback "match" would make
    # times_used meaningless.
    if matches and matches[0].get("score", 0) >= 25:
        top = matches[0]
        try:
            full = (
                db.table("application_answers")
                .select("times_used")
                .eq("id", top["id"])
                .single()
                .execute()
                .data
            )
            times_used = (full or {}).get("times_used") or 0
            (
                db.table("application_answers")
                .update({"times_used": times_used + 1})
                .eq("id", top["id"])
                .eq("user_id", user_id)
                .execute()
            )
        except Exception as exc:
            log.warning("answers_match_times_used_skip", error=str(exc))

    return {"matches": matches}
