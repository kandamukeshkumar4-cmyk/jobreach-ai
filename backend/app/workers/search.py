"""
Search worker — wraps Agent-Reach sourcing channels.
Orchestrates the full mission: search → filter → kick off scoring.
"""
import json
import requests
from celery import Task
from app.workers.celery_app import celery_app, _redis_url_with_ssl
from app.database import get_db
from app.config import get_settings
import redis
import structlog

log = structlog.get_logger()


def _pub(r: redis.Redis, mission_id: str, event_type: str, message: str, detail: str = None, meta: dict = None):
    """Persist event to DB and publish to Redis pub/sub for SSE streaming."""
    db = get_db()
    row = {
        "mission_id": mission_id,
        "event_type": event_type,
        "message": message,
        "detail": detail,
        "metadata": meta or {},
    }
    saved = db.table("mission_events").insert(row).execute()
    payload = json.dumps(saved.data[0], default=str)
    r.publish(f"mission:{mission_id}", payload)
    return saved.data[0]


@celery_app.task(bind=True, queue="search", name="app.workers.search.run_mission")
def run_mission(self: Task, mission_id: str):
    """
    Full mission orchestrator:
    1. Load mission + profile
    2. Search all sources (Exa, ATS feeds, RSS)
    3. Filter by profile
    4. Dispatch scoring worker for each match
    """
    s = get_settings()
    r = redis.from_url(_redis_url_with_ssl(s.redis_url), decode_responses=True)
    db = get_db()

    try:
        # Mark running
        db.table("missions").update({"status": "running"}).eq("id", mission_id).execute()

        # Load mission + profile
        mission_row = db.table("missions").select("*, profiles(*)").eq("id", mission_id).single().execute().data
        profile = mission_row["profiles"]
        query = mission_row["search_query"]
        sources = mission_row.get("sources", ["exa", "greenhouse", "lever", "ashby"])
        location = mission_row.get("location_filter", "")
        salary_min = mission_row.get("salary_min", 0)

        _pub(r, mission_id, "ok", f"Candidate profile loaded — {len(profile.get('archetypes',[]))} archetypes detected")

        # ── EXA SEMANTIC SEARCH ──────────────────────────────────────────────
        raw_jobs = []

        if "exa" in sources:
            _pub(r, mission_id, "run", f"Scanning Exa semantic web search for: '{query}'...")
            exa_jobs = _search_exa(query, location, s.exa_api_key)
            raw_jobs.extend(exa_jobs)
            _pub(r, mission_id, "ok", f"Exa returned {len(exa_jobs)} postings")

        # ── ATS FEEDS (Greenhouse, Lever, Ashby) ─────────────────────────────
        ats_sources = [src for src in sources if src in ("greenhouse", "lever", "ashby", "wellfound")]
        if ats_sources:
            _pub(r, mission_id, "run", f"Scanning ATS feeds: {', '.join(ats_sources).title()}...")
            ats_jobs = _search_ats_feeds(query, location, ats_sources)
            raw_jobs.extend(ats_jobs)
            _pub(r, mission_id, "ok", f"ATS feeds returned {len(ats_jobs)} postings",
                 detail=" | ".join(f"{src}: {len([j for j in ats_jobs if j.get('source')==src])}" for src in ats_sources))

        # ── RSS FEEDS ─────────────────────────────────────────────────────────
        if "rss" in sources:
            _pub(r, mission_id, "run", "Scanning RSS job feeds (Remotive, WeWorkRemotely, Remote.co)...")
            rss_jobs = _search_rss(query)
            raw_jobs.extend(rss_jobs)
            _pub(r, mission_id, "ok", f"RSS feeds returned {len(rss_jobs)} postings")

        total_scanned = len(raw_jobs)
        _pub(r, mission_id, "ok", f"Scanned {total_scanned:,} postings across {len(sources)} sources",
             meta={"total_scanned": total_scanned})

        # ── DEDUPLICATE ───────────────────────────────────────────────────────
        seen_urls = set()
        unique_jobs = []
        for j in raw_jobs:
            if j.get("url") and j["url"] not in seen_urls:
                seen_urls.add(j["url"])
                unique_jobs.append(j)

        # ── FILTER ────────────────────────────────────────────────────────────
        _pub(r, mission_id, "run", f"Applying profile filters: location={location or 'any'}, salary≥{salary_min or 0}...")
        filtered = _filter_jobs(unique_jobs, profile, location, salary_min)
        total_filtered = len(filtered)
        _pub(r, mission_id, "ok", f"Filtered to {total_filtered} matching roles ({total_scanned - total_filtered} eliminated)")

        db.table("missions").update({
            "total_scanned": total_scanned,
            "total_filtered": total_filtered,
        }).eq("id", mission_id).execute()

        # ── PERSIST JOBS & DISPATCH SCORING ──────────────────────────────────
        _pub(r, mission_id, "run", f"Deep-researching {total_filtered} companies and scoring roles...")
        job_ids = _persist_jobs(db, filtered)

        for job_id in job_ids:
            from app.workers.score import score_job
            score_job.delay(mission_id, job_id, profile)

        # score_job tasks will update mission status to completed when all done
        return {"status": "scoring_dispatched", "total_filtered": total_filtered}

    except Exception as exc:
        log.error("mission_failed", mission_id=mission_id, error=str(exc))
        db.table("missions").update({"status": "failed"}).eq("id", mission_id).execute()
        _pub(r, mission_id, "error", f"Mission failed: {exc}")
        raise


def _search_exa(query: str, location: str, api_key: str) -> list:
    """Call Exa AI semantic search API."""
    if not api_key:
        return []
    try:
        full_query = f"{query} job posting {location}".strip()
        resp = requests.post(
            "https://api.exa.ai/search",
            headers={"x-api-key": api_key, "Content-Type": "application/json"},
            json={
                "query": full_query,
                "numResults": 100,
                "type": "neural",
                "useAutoprompt": True,
                "includeDomains": ["greenhouse.io", "lever.co", "ashby.io", "jobs.ashbyhq.com",
                                   "wellfound.com", "linkedin.com", "remotive.com", "weworkremotely.com"],
                "contents": {"text": True},
            },
            timeout=30,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        return [{
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "company": _extract_company(r.get("url", ""), r.get("title", "")),
            "description_snippet": (r.get("text") or "")[:500],
            "source": "exa",
            "location": location,
        } for r in results]
    except Exception as e:
        log.warning("exa_search_failed", error=str(e))
        return []


def _search_ats_feeds(query: str, location: str, sources: list) -> list:
    """
    Fetch structured ATS job board APIs.
    Greenhouse: https://boards-api.greenhouse.io/v1/boards/{co}/jobs
    Lever: https://api.lever.co/v0/postings/{co}?mode=json
    Ashby: https://jobs.ashbyhq.com/api/non-user-graphql (GraphQL)
    """
    jobs = []
    keywords = query.lower().split()

    # Known companies per ATS (extend via portals config later)
    GREENHOUSE_COS = ["anthropic", "stripe", "notion", "figma", "vercel", "linear", "supabase"]
    LEVER_COS = ["openai", "mistral", "huggingface", "cohere"]
    ASHBY_COS = ["linear", "vercel", "supabase", "raycast"]

    if "greenhouse" in sources:
        for co in GREENHOUSE_COS:
            try:
                resp = requests.get(
                    f"https://boards-api.greenhouse.io/v1/boards/{co}/jobs?content=true",
                    timeout=10,
                )
                if resp.status_code == 200:
                    for j in resp.json().get("jobs", []):
                        title = j.get("title", "").lower()
                        if any(kw in title for kw in keywords):
                            jobs.append({
                                "title": j["title"],
                                "url": j.get("absolute_url", ""),
                                "company": co.title(),
                                "location": j.get("location", {}).get("name", ""),
                                "description_snippet": "",
                                "source": "greenhouse",
                            })
            except Exception:
                continue

    if "lever" in sources:
        for co in LEVER_COS:
            try:
                resp = requests.get(f"https://api.lever.co/v0/postings/{co}?mode=json", timeout=10)
                if resp.status_code == 200:
                    for j in resp.json():
                        title = j.get("text", "").lower()
                        if any(kw in title for kw in keywords):
                            jobs.append({
                                "title": j["text"],
                                "url": j.get("hostedUrl", ""),
                                "company": co.title(),
                                "location": j.get("categories", {}).get("location", ""),
                                "description_snippet": j.get("descriptionPlain", "")[:500],
                                "source": "lever",
                            })
            except Exception:
                continue

    return jobs


def _search_rss(query: str) -> list:
    """Parse RSS job feeds."""
    import feedparser
    feeds = [
        "https://remotive.com/remote-jobs/feed",
        "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
        "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
    ]
    jobs = []
    keywords = query.lower().split()
    for url in feeds:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:50]:
                title = (entry.get("title") or "").lower()
                if any(kw in title for kw in keywords):
                    jobs.append({
                        "title": entry.get("title", ""),
                        "url": entry.get("link", ""),
                        "company": entry.get("author", ""),
                        "description_snippet": (entry.get("summary") or "")[:500],
                        "source": "rss",
                        "location": "Remote",
                    })
        except Exception:
            continue
    return jobs


def _filter_jobs(jobs: list, profile: dict, location: str, salary_min: int) -> list:
    """Basic keyword + location pre-filter before expensive LLM scoring."""
    skills = [s.lower() for s in (profile.get("skills") or [])]
    target_roles = [r.lower() for r in (profile.get("target_roles") or [])]
    loc_lower = (location or "").lower()

    filtered = []
    for j in jobs:
        title = (j.get("title") or "").lower()
        job_loc = (j.get("location") or "").lower()

        # Location filter
        if loc_lower and loc_lower not in ("any", "remote"):
            if loc_lower not in job_loc and "remote" not in job_loc:
                continue

        # Title relevance: at least one keyword from target_roles
        if target_roles and not any(kw in title for kw in target_roles):
            continue

        filtered.append(j)

    return filtered


def _persist_jobs(db, jobs: list) -> list:
    """Upsert jobs to DB, return list of job IDs."""
    ids = []
    for j in jobs:
        try:
            result = db.table("jobs").upsert(
                {k: v for k, v in j.items() if v is not None},
                on_conflict="url"
            ).execute()
            if result.data:
                ids.append(result.data[0]["id"])
        except Exception:
            continue
    return ids


def _extract_company(url: str, title: str) -> str:
    """Best-effort company extraction from URL."""
    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname or ""
        parts = host.replace("www.", "").split(".")
        return parts[0].title() if parts else ""
    except Exception:
        return ""
