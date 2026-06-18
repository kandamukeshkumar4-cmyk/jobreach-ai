"""
Scoring worker — wraps career-ops A-F evaluation logic.
Calls Claude to score each job across 10 dimensions.
"""
import json
import redis
from celery import Task
from app.workers.celery_app import celery_app, _redis_url_with_ssl
from app.database import get_db
from app.config import get_settings
from app.workers.research import run_company_research
from openai import OpenAI
import structlog

log = structlog.get_logger()

DIMENSIONS = [
    ("cv_match",       "CV & Skills Match",         0.25),
    ("archetype_fit",  "Archetype Alignment",        0.20),
    ("level_fit",      "Seniority & Level",          0.15),
    ("compensation",   "Compensation Research",      0.15),
    ("culture",        "Cultural Signals",           0.15),
    ("legitimacy",     "Posting Legitimacy",         0.10),
]

SCORE_PROMPT = """You are a senior career advisor evaluating a job posting against a candidate profile.

## Candidate Profile
{profile}

## Job Posting
Title: {title}
Company: {company}
Location: {location}
Description:
{description}

## Company Research
{research}

## Task
Score this job across these dimensions (1.0–5.0 each, one decimal):
1. CV & Skills Match (0.25 weight): How well does the JD match the candidate's skills and experience?
2. Archetype Alignment (0.20 weight): Does this role match the candidate's target archetypes?
3. Seniority & Level (0.15 weight): Is this the right level? Flag if downlevel.
4. Compensation Research (0.15 weight): Based on company size/stage/market data, is comp likely competitive?
5. Cultural Signals (0.15 weight): Remote policy, growth trajectory, stability, culture fit.
6. Posting Legitimacy (0.10 weight): Is this a real, active, specific posting? Flag ghost jobs.

Respond ONLY with valid JSON:
{{
  "dimensions": [
    {{"key": "cv_match", "label": "CV & Skills Match", "score": 4.5, "grade": "A", "evidence": "one sentence"}},
    {{"key": "archetype_fit", "label": "Archetype Alignment", "score": 4.2, "grade": "B", "evidence": "one sentence"}},
    {{"key": "level_fit", "label": "Seniority & Level", "score": 4.8, "grade": "A", "evidence": "one sentence"}},
    {{"key": "compensation", "label": "Compensation Research", "score": 3.9, "grade": "C", "evidence": "one sentence"}},
    {{"key": "culture", "label": "Cultural Signals", "score": 4.5, "grade": "A", "evidence": "one sentence"}},
    {{"key": "legitimacy", "label": "Posting Legitimacy", "score": 4.7, "grade": "A", "evidence": "one sentence"}}
  ],
  "overall_score": 4.3,
  "grade": "B",
  "why_fit": "2-3 sentence summary of why this is a strong match",
  "why_gap": "1-2 sentence honest gap assessment, or null if minimal gaps"
}}"""


def score_to_grade(score: float) -> str:
    if score >= 4.5: return "A"
    if score >= 4.0: return "B"
    if score >= 3.5: return "C"
    if score >= 3.0: return "D"
    return "F"


@celery_app.task(bind=True, queue="score", name="app.workers.score.score_job")
def score_job(self: Task, mission_id: str, job_id: str, profile: dict):
    s = get_settings()
    r = redis.from_url(_redis_url_with_ssl(s.redis_url), decode_responses=True)
    db = get_db()

    try:
        job = db.table("jobs").select("*").eq("id", job_id).single().execute().data
        if not job:
            return

        # Call research directly — avoids Celery subtask restrictions
        research = run_company_research(job["company"], job.get("url", ""))

        client = OpenAI(
            api_key=s.nvidia_api_key,
            base_url="https://integrate.api.nvidia.com/v1",
        )

        profile_str = json.dumps({
            "name": profile.get("full_name"),
            "skills": profile.get("skills", []),
            "years_experience": profile.get("years_experience"),
            "target_roles": profile.get("target_roles", []),
            "archetypes": profile.get("archetypes", []),
            "resume_snippet": (profile.get("resume_markdown") or "")[:2000],
        }, indent=2)

        research_str = json.dumps(research or {}, indent=2)[:1000]

        message = client.chat.completions.create(
            model="meta/llama-3.3-70b-instruct",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": SCORE_PROMPT.format(
                    profile=profile_str,
                    title=job.get("title", ""),
                    company=job.get("company", ""),
                    location=job.get("location", ""),
                    description=(job.get("description_snippet") or "")[:3000],
                    research=research_str,
                ),
            }],
        )

        raw = message.choices[0].message.content.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        scored = json.loads(raw)

        # Persist match
        match_row = {
            "mission_id": mission_id,
            "job_id": job_id,
            "overall_score": scored["overall_score"],
            "grade": scored["grade"],
            "dimensions": scored["dimensions"],
            "why_fit": scored["why_fit"],
            "why_gap": scored.get("why_gap"),
            "company_research": research,
        }
        db.table("matches").insert(match_row).execute()

        # Only emit SSE event for strong matches
        if scored["grade"] in ("A", "B"):
            from app.workers.search import _pub
            _pub(r, mission_id, "star",
                 f"<strong>{scored['grade']} match</strong>: {job['title']} at {job['company']} — {scored['overall_score']}/5.0",
                 detail=scored["why_fit"])

        # Check if all jobs for this mission are scored → mark complete
        _check_mission_complete(db, r, mission_id)

    except Exception as exc:
        log.error("score_job_failed", job_id=job_id, error=str(exc))
        try:
            from app.workers.search import _pub
            _pub(r, mission_id, "warn", f"Scoring skipped for job {job_id}: {exc}")
            _check_mission_complete(db, r, mission_id)
        except Exception:
            pass


def _check_mission_complete(db, r, mission_id: str):
    """Close the mission when all filtered jobs have been scored (success or failure)."""
    mission = db.table("missions").select("total_filtered, status").eq("id", mission_id).single().execute().data
    if not mission or mission["status"] != "running":
        return

    match_count = len(db.table("matches").select("id").eq("mission_id", mission_id).execute().data or [])
    warn_count = len(db.table("mission_events").select("id").eq("mission_id", mission_id).eq("event_type", "warn").execute().data or [])
    attempted = match_count + warn_count
    total_filtered = mission["total_filtered"] or 0

    if total_filtered and attempted >= total_filtered:
        strong = len(db.table("matches").select("id").eq("mission_id", mission_id).in_("grade", ["A", "B"]).execute().data or [])

        db.table("missions").update({
            "status": "completed",
            "total_matches": strong or 0,
        }).eq("id", mission_id).execute()

        from app.workers.search import _pub
        _pub(r, mission_id, "star",
             f"<strong>{strong} strong matches found</strong> (A/B grade) out of {match_count} scored",
             meta={"strong_matches": strong, "total_scored": match_count})
        _pub(r, mission_id, "ok", "Mission complete")
