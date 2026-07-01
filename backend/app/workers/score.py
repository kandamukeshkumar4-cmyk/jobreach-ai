"""
Scoring worker — wraps career-ops A-F evaluation logic.
Calls Claude to score each job across 10 dimensions.

Emits a throttled heartbeat during the (long) research+LLM call per job so the
mission console never goes silent for 30+ seconds. Persists only meaningful
milestones to the DB (one heartbeat row every ~8s, capped) — the per-second
visual pulse is rendered client-side from the elapsed clock.
"""
import json
import threading
import time
import redis
from celery import Task
from app.workers.celery_app import celery_app, _redis_url_with_ssl
from app.database import new_db
from app.config import get_settings
from app.workers.research import run_company_research
from app.services.trust import score_trust, detect_repost
from openai import OpenAI
import structlog

log = structlog.get_logger()

# Heartbeat cadence during a single job's research+LLM call. Frontend stall
# threshold is 15s, so an 8s cadence keeps it well clear without DB spam.
_HB_INTERVAL = 8
_HB_MAX_PER_JOB = 8  # 64s window; after this the frontend's stall UI takes over

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
    db = new_db()  # per-thread client — the shared singleton races under the threads pool

    try:
        job = db.table("jobs").select("*").eq("id", job_id).single().execute().data
        if not job:
            return

        company = job["company"]
        role = job["title"]
        total = _scoring_total(r, db, mission_id)

        # Stream a per-job heartbeat so the (longest) scoring phase never looks
        # stalled: one "researching" event as each role's deep-dive begins.
        from app.workers.search import _pub
        _pub(r, mission_id, "run",
             f"Researching {company} — {role}…",
             meta={"kind": "research", "stage": "score", "company": company,
                   "role": role, "url": job.get("url", ""), "total": total})

        # Start a throttled heartbeat that publishes a DB row every ~8s while the
        # blocking research+LLM call is in flight. The frontend polls DB events,
        # so these rows are what keep the console visibly alive between the
        # "Researching" and "Scored" milestones.
        # Heartbeat now wraps the ENTIRE blocking section — research AND the LLM
        # call AND JSON parse — so the feed can't go silent during either phase
        # (the LLM call is the longest). subphase tells the UI which step we're in
        # without exposing any chain-of-thought.
        phase = {"sub": "research"}
        stop_hb = _start_scoring_heartbeat(r, mission_id, company, role, total, phase)
        try:
            # run_company_research caches per company (24h) and is now a single
            # fast Exa call (no separate LLM), so repeat companies skip the network.
            research = run_company_research(company, job.get("url", ""))

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

            research_str = json.dumps(research or {}, indent=2)[:1200]

            phase["sub"] = "llm"
            message = client.chat.completions.create(
                model="meta/llama-3.3-70b-instruct",
                max_tokens=1024,
                messages=[{
                    "role": "user",
                    "content": SCORE_PROMPT.format(
                        profile=profile_str,
                        title=role,
                        company=company,
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
        finally:
            stop_hb()

        # Stamp trust + repost signals into company_research (no schema change —
        # both live under existing JSON keys). Copy first so the 24h research
        # cache never carries per-job stamps. Flag-only: a failure here must
        # never sink the mission, so each stamp is individually guarded.
        research = dict(research or {})
        try:
            research["trust"] = score_trust(job)
        except Exception as exc:
            log.warning("trust_score_failed", job_id=job_id, error=str(exc))
        try:
            research["repost"] = detect_repost(
                db, job, _user_profile_ids(db, profile),
                exclude_mission_id=mission_id,
            )
        except Exception as exc:
            log.warning("repost_detect_failed", job_id=job_id, error=str(exc))

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

        # Advance the atomic progress counter first so the streamed event can
        # carry an honest "n of total" position. Parallel score_job tasks each
        # bump this, so n is monotonic across the whole scoring phase.
        n = r.incr(f"mission:{mission_id}:attempted")
        eta = _scoring_eta(r, mission_id, n, total)
        progress = {
            "kind": "score", "stage": "score", "index": n, "total": total,
            "company": company, "role": role, "url": job.get("url", ""),
            "score": scored["overall_score"], "grade": scored["grade"],
            "scored": n, "eta_seconds": eta,
        }
        # A/B keep the celebratory match event (with why_fit); every other grade
        # streams a compact "scored" line so the user sees each role land.
        if scored["grade"] in ("A", "B"):
            _pub(r, mission_id, "star",
                 f"<strong>{scored['grade']} match</strong>: {role} at {company} — {scored['overall_score']}/5.0",
                 detail=scored["why_fit"], meta=progress)
        else:
            _pub(r, mission_id, "info",
                 f"Scored {role} at {company} — {scored['overall_score']}/5.0",
                 meta=progress)

        _check_mission_complete(db, r, mission_id)

    except Exception as exc:
        log.error("score_job_failed", job_id=job_id, error=str(exc))
        try:
            from app.workers.search import _pub
            n = r.incr(f"mission:{mission_id}:attempted")
            eta = _scoring_eta(r, mission_id, n, _scoring_total(r, db, mission_id))
            _pub(r, mission_id, "warn", f"Scoring skipped for {job_id}: {exc}",
                 meta={"kind": "score", "stage": "score", "index": n,
                       "total": _scoring_total(r, db, mission_id),
                       "scored": n, "eta_seconds": eta, "error": str(exc)})
            _check_mission_complete(db, r, mission_id)
        except Exception:
            pass


def _user_profile_ids(db, profile: dict) -> list:
    """All profile ids owned by this user — the repost lookback spans every
    profile the user has (matches career-ops' per-user scan history). Falls
    back to the mission's own profile id if the lookup fails."""
    try:
        uid = profile.get("user_id")
        if uid:
            rows = db.table("profiles").select("id").eq("user_id", uid).execute().data or []
            ids = [row["id"] for row in rows if row.get("id")]
            if ids:
                return ids
    except Exception:
        pass
    return [pid for pid in [profile.get("id")] if pid]


def _scoring_total(r: redis.Redis, db, mission_id: str) -> int:
    """Dispatched-job count for 'n of total'. Redis first (no DB round-trip),
    fall back to the mission row."""
    try:
        cached = r.hget(f"mission:{mission_id}:rate", "total")
        if cached:
            return int(cached)
    except Exception:
        pass
    return _total_filtered(db, mission_id)


def _scoring_eta(r: redis.Redis, mission_id: str, done: int, total: int):
    """Live ETA (seconds) for the scoring phase, from the rolling rate.

    done=0 → no ETA yet. Uses a Redis-setnx start timestamp so the first job to
    complete records the phase start; subsequent jobs compute remaining/rate.
    """
    if total <= 0 or done <= 0 or done >= total:
        return None
    try:
        now_ms = int(time.time() * 1000)
        # setnx records the phase start on the first job to complete; later jobs
        # read the same timestamp so the rolling rate is consistent.
        r.setnx(f"mission:{mission_id}:score_start_ms", now_ms)
        start_ms = int(r.get(f"mission:{mission_id}:score_start_ms") or now_ms)
        elapsed_sec = max(1, (now_ms - start_ms) / 1000)
        rate = done / elapsed_sec  # jobs/sec
        if rate <= 0:
            return None
        remaining = total - done
        eta = remaining / rate
        # Cap at 30min so a slow first job doesn't show an absurd ETA.
        return int(min(max(eta, 1), 60 * 30))
    except Exception:
        return None


def _start_scoring_heartbeat(r: redis.Redis, mission_id: str, company: str, role: str, total: int, phase: dict = None):
    """Publish a throttled 'still working' DB event every ~8s while the calling
    job's research+LLM call is in flight. Returns a `stop()` callable.

    Rows are capped at _HB_MAX_PER_JOB per job so a hung job can't emit forever —
    past that window the frontend's 60s stall detection takes over and surfaces a
    retry affordance. The DB write is the right channel here because the frontend
    polls the events table (SSE is buffered out on Azure App Service)."""
    stop_event = threading.Event()
    start_ms = time.time() * 1000

    def _loop():
        from app.workers.search import _pub
        for _ in range(_HB_MAX_PER_JOB):
            if stop_event.wait(_HB_INTERVAL):
                return
            try:
                done = int(r.get(f"mission:{mission_id}:attempted") or 0)
                eta = _scoring_eta(r, mission_id, done, total)
                elapsed = int((time.time() * 1000 - start_ms) / 1000)
                sub = (phase or {}).get("sub")
                verb = "Reading company signals for" if sub == "research" else "Scoring"
                _pub(r, mission_id, "info",
                     f"{verb} {company} — {role}… ({elapsed}s in this role)",
                     meta={"kind": "heartbeat", "stage": "score", "subphase": sub,
                           "company": company, "role": role, "elapsed_job_sec": elapsed,
                           "index": done, "total": total, "scored": done,
                           "eta_seconds": eta})
            except Exception:
                # Heartbeat must never break the scoring task.
                return

    t = threading.Thread(target=_loop, daemon=True)
    t.start()
    return stop_event.set


def _total_filtered(db, mission_id: str) -> int:
    """Best-effort read of the dispatched-job count for 'n of total' progress."""
    try:
        row = db.table("missions").select("total_filtered").eq("id", mission_id).single().execute().data
        return int((row or {}).get("total_filtered") or 0)
    except Exception:
        return 0


def _check_mission_complete(db, r, mission_id: str):
    """Close the mission when all filtered jobs have been scored (success or failure).

    Uses a Redis INCR counter (reset in run_mission before dispatch) instead of counting
    warn DB events, so stale events from prior runs cannot cause early completion.
    """
    mission = db.table("missions").select("total_filtered, status, user_id").eq("id", mission_id).single().execute().data
    if not mission or mission["status"] != "running":
        return

    attempted = int(r.get(f"mission:{mission_id}:attempted") or 0)
    total_filtered = mission["total_filtered"] or 0

    if total_filtered and attempted >= total_filtered:
        # Atomic guard: only the FIRST thread to claim completion flips status and
        # emits the terminal events. Without it, several near-simultaneous final
        # score threads each pass the gate → duplicate "Mission complete".
        if not r.setnx(f"mission:{mission_id}:completed_lock", 1):
            return
        try:
            r.expire(f"mission:{mission_id}:completed_lock", 3600)
        except Exception:
            pass
        match_count = len(db.table("matches").select("id").eq("mission_id", mission_id).execute().data or [])
        strong = len(db.table("matches").select("id").eq("mission_id", mission_id).in_("grade", ["A", "B"]).execute().data or [])

        db.table("missions").update({
            "status": "completed",
            "total_matches": strong or 0,
        }).eq("id", mission_id).execute()

        from app.workers.search import _pub
        _pub(r, mission_id, "star",
             f"<strong>{strong} strong matches found</strong> (A/B grade) out of {match_count} scored",
             meta={"stage": "complete", "strong_matches": strong, "total_scored": match_count,
                   "scored": match_count, "queued": total_filtered})
        _pub(r, mission_id, "ok", "Mission complete", meta={"stage": "complete"})

        # Release the per-user concurrency lock so the user can start the next
        # mission immediately (the 600s TTL is only the crash safety net). Uses
        # compare-and-delete so a late-finishing stale mission can't drop a newer
        # mission's lock.
        from app.security import release_mission_lock
        release_mission_lock(r, mission.get("user_id"), mission_id)
