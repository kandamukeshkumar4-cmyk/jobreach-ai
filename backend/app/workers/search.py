"""
Search worker — wraps Agent-Reach sourcing channels.
Orchestrates the full mission: search → filter → liveness → bounded scoring.

US job market focus:
- Sources: Exa, ATS feeds (Greenhouse, Lever, Ashby, Workable, SmartRecruiters),
  RemoteOK JSON API, RSS (Remotive / WeWorkRemotely).
- Salary filtering is conservative: postings WITHOUT salary data always pass.
- Liveness verification drops postings whose URL is dead/closed (404/410/closed banner)
  before they ever reach scoring, so users never apply to a stale link.
"""
import json
import re
import requests
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from celery import Task
from app.workers.celery_app import celery_app, _redis_url_with_ssl
from app.database import get_db, new_db
from app.config import get_settings
import redis
import structlog

log = structlog.get_logger()

# Browser-ish UA — some ATS/job hosts 403 the default python-requests UA
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

# Hard wall-clock target for an end-to-end mission. This is a product contract,
# not just a UI ETA: search, liveness, scoring, match writes, and completion
# events must all fit inside this budget whenever external services respond.
MISSION_TARGET_SECONDS = 120
MISSION_FINISH_RESERVE_SECONDS = 8

# Keep enough real postings for the user to inspect. Slow LLM scoring is capped
# separately; anything beyond the LLM budget gets a deterministic fallback grade
# instead of leaving the mission running or dropping real results.
RESULT_CAP = 30

# Slow LLM scoring is intentionally disabled in the 120-second critical path:
# external rate limits/timeouts must not decide whether a mission completes.
# Keep the budgeting helper for a future post-completion refinement path.
_SCORE_RATE_SEED = 12
LLM_SCORE_CAP = 0
_FAST_SCORE_RATE_SEED = 1.0

# Back-compat for older imports that treat SCORE_CAP as the number of result rows
# a mission may produce.
SCORE_CAP = RESULT_CAP

# Definitive "this posting is closed" signals — kept narrow to avoid false positives
# from nav/footer text. Only used on the page body, lowercased.
_CLOSED_MARKERS = (
    "no longer accepting applications",
    "this job is no longer available",
    "position has been filled",
    "this position is closed",
    "job posting is no longer active",
    "applications are now closed",
    "this role is no longer open",
)

# Jobs that mention these region signals are non-US and not US-eligible.
# Used by the ALWAYS-ON US-market gate in _filter_jobs (this product serves the
# US job market only), not just the remote-role branch.
_NON_US_ONLY = frozenset([
    "europe", "emea", "uk", "united kingdom", "germany", "france", "spain",
    "italy", "netherlands", "sweden", "norway", "denmark", "poland", "austria",
    "switzerland", "belgium", "portugal", "canada", "australia", "new zealand",
    "india", "asia", "apac", "singapore", "latam", "latin america", "africa",
    "middle east", "uae", "dubai", "abu dhabi", "saudi", "qatar", "israel",
    "ireland", "finland", "estonia", "latvia", "lithuania", "romania",
    "bulgaria", "hungary", "czech", "slovakia", "slovenia", "croatia",
    "serbia", "ukraine", "greece", "turkey", "türkiye", "egypt", "nigeria",
    "kenya", "brazil", "mexico", "argentina", "colombia", "chile", "peru",
    "costa rica", "japan", "china", "korea", "hong kong", "taiwan", "vietnam",
    "philippines", "indonesia", "malaysia", "thailand", "pakistan",
])

# Major non-US hiring hubs — postings often carry only the CITY ("Paris",
# "Berlin; London; Munich"), never the country, so country tokens alone leak
# them (observed live: Mistral Paris/London roles surfaced as matches). Cities
# are matched ONLY against location+title (a US job's description legitimately
# mentions "our London office" / "customers in Tokyo"). US towns sharing these
# names ("Paris, TX", "Dublin, OH") are protected by the comma-state signal.
_NON_US_CITIES = frozenset([
    "london", "paris", "berlin", "munich", "hamburg", "frankfurt", "amsterdam",
    "rotterdam", "dublin", "madrid", "barcelona", "lisbon", "stockholm",
    "copenhagen", "oslo", "helsinki", "tallinn", "riga", "vilnius", "warsaw",
    "krakow", "prague", "vienna", "zurich", "geneva", "milan", "rome",
    "brussels", "budapest", "bucharest", "sofia", "athens", "belgrade",
    "zagreb", "bratislava", "ljubljana", "kyiv", "istanbul", "edinburgh",
    "manchester", "leeds", "glasgow", "toronto", "vancouver", "montreal",
    "ottawa", "calgary", "sydney", "melbourne", "brisbane", "auckland",
    "wellington", "bangalore", "bengaluru", "mumbai", "delhi", "hyderabad",
    "pune", "chennai", "gurgaon", "noida", "tokyo", "osaka", "seoul",
    "beijing", "shanghai", "shenzhen", "hangzhou", "taipei", "tel aviv",
    "cairo", "lagos", "nairobi", "sao paulo", "são paulo", "mexico city",
    "bogota", "bogotá", "buenos aires", "santiago", "lima", "montevideo",
    "riyadh", "doha", "manila", "jakarta", "kuala lumpur", "bangkok",
    "ho chi minh", "hanoi", "karachi", "lahore", "islamabad",
])

# Regions/countries are decisive ANYWHERE in the posting text; cities only in
# location+title. _NON_US_ONLY (the union) serves location-string checks
# (_is_us_eligible on a bare location field), where a city token IS decisive.
_NON_US_REGIONS = _NON_US_ONLY
_NON_US_ONLY = _NON_US_REGIONS | _NON_US_CITIES

# ", TX" / ", OH" style suffix — a comma-anchored US state abbreviation is a
# strong US signal and protects US towns that share a name with a foreign hub
# (Paris TX, Dublin OH, Rome GA). Comma-anchored so "Remote in Europe" ("in")
# and "Berlin; London" never match.
_US_STATE_ABBR_RE = re.compile(
    r",\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|"
    r"mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|"
    r"va|wa|wv|wi|wy|dc)(?![a-z0-9])"
)

# Explicit US markers that OVERRIDE a non-US token (e.g. "Remote — US or Europe"
# is US-eligible; "Remote — Europe" is not). STRONG phrases only — the bare
# token "us" is deliberately NOT here: job descriptions almost always contain
# "about us" / "join us" / "work with us", which would flip the gate to
# US-eligible for practically every posting (including Berlin/EMEA roles).
# Bare "US" is honored ONLY in the location field (allow_bare_us below).
_US_SIGNALS = (
    "united states", "usa", "u s", "us only", "us based",
    "us remote", "remote us", "us eligible", "north america", "americas",
)

_RESUME_SKILL_HINTS = (
    ("python", "Python"),
    ("fastapi", "FastAPI"),
    ("django", "Django"),
    ("flask", "Flask"),
    ("aws", "AWS"),
    ("azure", "Azure"),
    ("gcp", "GCP"),
    ("kubernetes", "Kubernetes"),
    ("docker", "Docker"),
    ("redis", "Redis"),
    ("postgres", "Postgres"),
    ("postgresql", "Postgres"),
    ("sql", "SQL"),
    ("react", "React"),
    ("typescript", "TypeScript"),
    ("javascript", "JavaScript"),
    ("node", "Node"),
    ("celery", "Celery"),
    ("llm", "LLM"),
    ("openai", "OpenAI"),
    ("langchain", "LangChain"),
    ("pytorch", "PyTorch"),
    ("tensorflow", "TensorFlow"),
)


def _normalize_market_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (text or "").lower())).strip()


def _has_market_phrase(text: str, phrase: str) -> bool:
    norm = _normalize_market_text(text)
    needle = _normalize_market_text(phrase)
    if not norm or not needle:
        return False
    return re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", norm) is not None


def _has_us_signal(text: str, allow_bare_us: bool = False) -> bool:
    """Strong US phrases anywhere; the bare 'us' token only when the caller is
    inspecting a LOCATION string ('Remote — US' yes; 'join us' in a JD no)."""
    if any(_has_market_phrase(text, signal) for signal in _US_SIGNALS):
        return True
    if allow_bare_us:
        # Location-only context: bare "US" token, or a comma-anchored US state
        # abbreviation ("Paris, TX" / "Dublin, OH" are US towns, not EU hubs).
        if _US_STATE_ABBR_RE.search((text or "").lower()):
            return True
        norm = _normalize_market_text(text)
        return re.search(r"(?<![a-z0-9])us(?![a-z0-9])", norm) is not None
    return False


def _has_non_us_signal(text: str) -> bool:
    return any(_has_market_phrase(text, region) for region in _NON_US_ONLY)


def _is_us_eligible(job_loc: str) -> bool:
    """ALWAYS-ON US-market gate. Empty/unknown locations pass (conservative —
    liveness+scoring still vet them); any non-US region signal without an
    explicit US marker is dropped. This runs regardless of the mission's
    location_filter — previously a 'Remote'/empty filter skipped location
    checks entirely and Abu Dhabi/EMEA/Singapore roles reached scoring."""
    loc = job_loc or ""
    if not loc.strip():
        return True
    # Token/phrase matching avoids rejecting words like "Indianapolis" because
    # they contain a non-US country token as a raw substring. Bare "US" is
    # meaningful in a location string, so it's allowed here.
    if _has_us_signal(loc, allow_bare_us=True):
        return True
    return not _has_non_us_signal(loc)


def _job_market_text(job: dict) -> str:
    return " ".join(str(job.get(k) or "") for k in ("location", "title", "description_snippet"))


def _is_us_eligible_job(job: dict) -> bool:
    """US gate over the whole posting. The location field may use a bare 'US'
    token; title/description must show a STRONG US phrase (otherwise every JD
    containing 'about us'/'join us' would pass, EMEA offices included)."""
    loc = str(job.get("location") or "")
    title = str(job.get("title") or "")
    desc = str(job.get("description_snippet") or "")
    combined = f"{loc} {title} {desc}"
    if not combined.strip():
        return True
    if _has_us_signal(loc, allow_bare_us=True) or _has_us_signal(f"{title} {desc}"):
        return True
    # Countries/regions are decisive anywhere; city names only in location or
    # title (US JDs legitimately mention foreign cities in prose).
    if any(_has_market_phrase(combined, r) for r in _NON_US_REGIONS):
        return False
    return not any(_has_market_phrase(f"{loc} {title}", c) for c in _NON_US_CITIES)


def _profile_query_skills(profile: dict) -> list:
    skills = [str(sk).strip() for sk in (profile.get("skills") or []) if str(sk).strip()]
    seen = {s.lower() for s in skills}
    resume = profile.get("resume_markdown") or ""
    for token, label in _RESUME_SKILL_HINTS:
        if len(skills) >= 8:
            break
        if label.lower() in seen:
            continue
        if _has_market_phrase(resume, token):
            skills.append(label)
            seen.add(label.lower())
    return skills


def _resume_driven_queries(query: str, profile: dict) -> list:
    """Personalize SOURCING, not just scoring: enrich the user's query with the
    top skills from their profile/resume, and add their target_roles as extra
    query variants. Previously Exa searched only the literal typed query, so
    two users with different resumes got identical candidate pools."""
    skills = _profile_query_skills(profile)
    skill_str = " ".join(skills[:3])
    queries = [f"{query} {skill_str}".strip() if skill_str else query]
    ql = query.lower().strip()
    for role in (profile.get("target_roles") or []):
        role = str(role).strip()
        if role and role.lower() != ql and len(queries) < 3:
            queries.append(f"{role} {' '.join(skills[:2])}".strip())
    return queries


def _score_slots_for_budget(remaining_seconds: float, per_job_seconds: float = _SCORE_RATE_SEED) -> int:
    """Number of slow LLM scoring slots that fit before the mission deadline.

    Always allow one slot when there is any meaningful room, then fast-score the
    rest. This keeps quality for the first result while preventing an unbounded
    queue of slow calls from breaking the 120-second mission contract.
    """
    min_llm_window = MISSION_FINISH_RESERVE_SECONDS + min(6, per_job_seconds)
    if remaining_seconds < min_llm_window or per_job_seconds <= 0:
        return 0
    slots = int((remaining_seconds - MISSION_FINISH_RESERVE_SECONDS) // per_job_seconds)
    return max(1, slots)


def _result_slots_for_budget(remaining_seconds: float, per_job_seconds: float = _FAST_SCORE_RATE_SEED) -> int:
    """Number of match rows that can be safely written before the deadline."""
    if remaining_seconds <= MISSION_FINISH_RESERVE_SECONDS or per_job_seconds <= 0:
        return 0
    slots = int((remaining_seconds - MISSION_FINISH_RESERVE_SECONDS) // per_job_seconds)
    return max(1, min(RESULT_CAP, slots))

# RemoteOK location strings that unambiguously indicate a non-US restriction.
_REMOTEOK_NON_US_SIGNALS = frozenset([
    "europe", "emea", "uk", "germany", "france", "spain", "italy", "netherlands",
    "poland", "sweden", "norway", "denmark", "belgium", "portugal", "austria",
    "switzerland", "canada", "australia", "new zealand", "india", "china",
    "japan", "korea", "singapore", "asia", "apac", "latam", "latin america",
    "africa", "middle east", "brazil", "mexico", "argentina", "pakistan",
])


def _pub(r: redis.Redis, mission_id: str, event_type: str, message: str, detail: str = None, meta: dict = None):
    """Persist event to DB and publish to Redis pub/sub for SSE streaming."""
    db = new_db()
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
    2. Search all sources (Exa, ATS feeds, RemoteOK, RSS)
    3. Filter by profile (location, role, salary)
    4. Liveness-verify surviving postings (drop dead links)
    5. Score the bounded result set and complete the mission
    """
    s = get_settings()
    r = redis.from_url(_redis_url_with_ssl(s.redis_url), decode_responses=True)
    db = new_db()
    started_monotonic = time.monotonic()
    deadline_ms = int(time.time() * 1000) + (MISSION_TARGET_SECONDS * 1000)

    try:
        # Mark running
        db.table("missions").update({"status": "running"}).eq("id", mission_id).execute()
        r.hset(f"mission:{mission_id}:rate", mapping={
            "target_seconds": MISSION_TARGET_SECONDS,
            "deadline_ms": deadline_ms,
        })

        # Load mission + profile
        mission_row = db.table("missions").select("*, profiles(*)").eq("id", mission_id).single().execute().data
        profile = mission_row["profiles"]
        query = mission_row["search_query"]
        sources = mission_row.get("sources") or ["exa", "greenhouse", "lever", "ashby",
                                                  "smartrecruiters", "workable", "remoteok", "rss"]
        location = mission_row.get("location_filter", "")
        salary_min = mission_row.get("salary_min", 0)

        _pub(r, mission_id, "ok", f"Candidate profile loaded — {len(profile.get('archetypes',[]))} archetypes detected",
             meta={"stage": "init"})

        # ── EXA SEMANTIC SEARCH ──────────────────────────────────────────────
        raw_jobs = []

        if "exa" in sources:
            # Resume-personalized sourcing: query variants built from the
            # profile's skills + target_roles, deduped by URL across variants.
            exa_queries = _resume_driven_queries(query, profile)
            _pub(r, mission_id, "run",
                 f"Scanning Exa with {len(exa_queries)} resume-personalized queries for: '{query}'...",
                 meta={"stage": "search", "provider": "exa", "source": "exa"})
            exa_jobs, _seen_exa = [], set()
            for exa_q in exa_queries:
                for j in _search_exa(exa_q, location, s.exa_api_key):
                    u = (j.get("url") or "").strip()
                    if u and u in _seen_exa:
                        continue
                    if u:
                        _seen_exa.add(u)
                    exa_jobs.append(j)
            raw_jobs.extend(exa_jobs)
            _pub(r, mission_id, "ok", f"Exa returned {len(exa_jobs)} postings",
                 meta={"stage": "search", "provider": "exa", "source": "exa", "count": len(exa_jobs),
                       "scanned": len(raw_jobs)})

        # ── ATS FEEDS (Greenhouse, Lever, Ashby, SmartRecruiters) ────────────
        ats_sources = [src for src in sources
                       if src in ("greenhouse", "lever", "ashby", "smartrecruiters")]
        if ats_sources:
            _pub(r, mission_id, "run", f"Scanning ATS feeds: {', '.join(ats_sources).title()}...",
                 meta={"stage": "boards", "provider": ",".join(ats_sources)})
            ats_jobs = _search_ats_feeds(query, location, ats_sources)
            raw_jobs.extend(ats_jobs)
            _pub(r, mission_id, "ok", f"ATS feeds returned {len(ats_jobs)} postings",
                 detail=" | ".join(f"{src}: {len([j for j in ats_jobs if j.get('source')==src])}" for src in ats_sources),
                 meta={"stage": "boards", "provider": ",".join(ats_sources), "count": len(ats_jobs),
                       "scanned": len(raw_jobs),
                       "by_source": {src: len([j for j in ats_jobs if j.get("source") == src]) for src in ats_sources}})

        # ── WORKABLE (US job board, all 35k+ Workable companies) ─────────────
        if "workable" in sources:
            _pub(r, mission_id, "run", "Scanning Workable US job board...",
                 meta={"stage": "boards", "provider": "workable", "source": "workable"})
            workable_jobs = _search_workable(query)
            raw_jobs.extend(workable_jobs)
            _pub(r, mission_id, "ok", f"Workable returned {len(workable_jobs)} postings",
                 meta={"stage": "boards", "provider": "workable", "source": "workable",
                       "count": len(workable_jobs), "scanned": len(raw_jobs)})

        # ── REMOTEOK (US-eligible remote roles, JSON API) ────────────────────
        if "remoteok" in sources:
            _pub(r, mission_id, "run", "Scanning RemoteOK for US-eligible remote roles...",
                 meta={"stage": "boards", "provider": "remoteok", "source": "remoteok"})
            remoteok_jobs = _search_remoteok(query)
            raw_jobs.extend(remoteok_jobs)
            _pub(r, mission_id, "ok", f"RemoteOK returned {len(remoteok_jobs)} postings",
                 meta={"stage": "boards", "provider": "remoteok", "source": "remoteok",
                       "count": len(remoteok_jobs), "scanned": len(raw_jobs)})

        # ── RSS FEEDS ─────────────────────────────────────────────────────────
        if "rss" in sources:
            _pub(r, mission_id, "run", "Scanning RSS job feeds (Remotive, WeWorkRemotely)...",
                 meta={"stage": "boards", "provider": "rss", "source": "rss"})
            rss_jobs = _search_rss(query)
            raw_jobs.extend(rss_jobs)
            _pub(r, mission_id, "ok", f"RSS feeds returned {len(rss_jobs)} postings",
                 meta={"stage": "boards", "provider": "rss", "source": "rss",
                       "count": len(rss_jobs), "scanned": len(raw_jobs)})

        total_scanned = len(raw_jobs)
        _pub(r, mission_id, "ok", f"Scanned {total_scanned:,} postings across {len(sources)} sources",
             meta={"stage": "search", "scanned": total_scanned, "total_scanned": total_scanned})

        # ── FILTER (location, role, conservative salary) ─────────────────────
        _pub(r, mission_id, "run", f"Applying profile filters: location={location or 'any'}, salary≥${salary_min or 0:,}...",
             meta={"stage": "filter", "scanned": total_scanned})
        filter_matches = _filter_jobs(raw_jobs, profile, location, salary_min)

        # Cross-source dedup must run AFTER the US/profile filter. If an EMEA
        # Exa copy arrives before a US ATS copy for the same company/title,
        # deduping first would keep EMEA, drop US, and then the US gate would
        # remove EMEA — losing the valid role entirely.
        before_dedupe = len(filter_matches)
        filtered = _dedupe_exact_urls(_dedupe_jobs(filter_matches))
        if before_dedupe - len(filtered) > 0:
            _pub(r, mission_id, "ok",
                 f"Removed {before_dedupe - len(filtered)} duplicate postings across sources",
                 meta={"stage": "filter", "deduped": before_dedupe - len(filtered)})

        # Round-robin interleave by source so the SCORE_CAP cap samples ACROSS
        # providers. Without this, Exa (appended first, ~100 results) fills the
        # entire front of the list and starves Ashby/SmartRecruiters/Workable/
        # RemoteOK — they get scanned but never reach scoring.
        filtered = _interleave_by_source(filtered)
        total_filtered = len(filtered)
        _pub(r, mission_id, "ok", f"Filtered to {total_filtered} matching roles ({total_scanned - total_filtered} eliminated)",
             meta={"stage": "filter", "filtered": total_filtered, "scanned": total_scanned,
                   # filtered_out = removed by profile/filter rules; distinct from
                   # dead_pruned (liveness). `pruned` kept for old-event back-compat.
                   "filtered_out": total_scanned - total_filtered,
                   "pruned": total_scanned - total_filtered})

        # ── BOUND THE CANDIDATE SET BEFORE LIVENESS ──────────────────────────
        # Liveness does one HTTP GET per posting, so verify only what could still
        # become a result row inside the 120s mission budget.
        verify_cap = RESULT_CAP + 10  # headroom for dead-link pruning
        if total_filtered > RESULT_CAP:
            _pub(r, mission_id, "info",
                 f"Prioritizing top {RESULT_CAP} of {total_filtered} matching roles for scoring",
                 meta={"stage": "filter", "capped_from": total_filtered, "cap": RESULT_CAP,
                       "queued": RESULT_CAP, "filtered": total_filtered})
        candidates = filtered[:verify_cap]

        # ── LIVENESS VERIFICATION (drop dead/closed postings) ────────────────
        _pub(r, mission_id, "run", f"Verifying {len(candidates)} postings are still live...",
             meta={"stage": "verify", "total": len(candidates), "scanned": total_scanned,
                   "filtered": total_filtered})
        live_jobs, dead_count = _verify_liveness(candidates)
        verified = len(live_jobs)
        # NOTE: use "info" (not "warn") — score worker counts "warn" events as
        # attempted jobs when deciding mission completion.
        if dead_count:
            _pub(r, mission_id, "info", f"Pruned {dead_count} dead/closed postings — {verified} verified live",
                 meta={"stage": "verify", "verified": verified,
                       # dead_pruned = removed by liveness; distinct from filtered_out.
                       "dead_pruned": dead_count, "pruned": dead_count,
                       "scanned": total_scanned, "filtered": total_filtered})
        else:
            _pub(r, mission_id, "ok", f"All {verified} postings verified live",
                 meta={"stage": "verify", "verified": verified,
                       "dead_pruned": 0, "pruned": 0,
                       "scanned": total_scanned, "filtered": total_filtered})

        remaining_after_verify = max(0, MISSION_TARGET_SECONDS - (time.monotonic() - started_monotonic))
        result_slots = min(len(live_jobs), _result_slots_for_budget(remaining_after_verify, _FAST_SCORE_RATE_SEED))
        if live_jobs and result_slots < min(len(live_jobs), RESULT_CAP):
            _pub(r, mission_id, "info",
                 f"Deadline budget allows scoring top {result_slots} live roles this run",
                 meta={"stage": "score", "queued": result_slots, "cap": RESULT_CAP,
                       "available": len(live_jobs), "remaining_seconds": int(remaining_after_verify)})
        to_score = live_jobs[:result_slots]
        queued = len(to_score)

        # ── PERSIST JOBS & DISPATCH SCORING ──────────────────────────────────
        job_ids = _persist_jobs(db, to_score)

        # total_filtered MUST equal the number of jobs actually dispatched —
        # the score worker uses it to decide when the mission is complete.
        db.table("missions").update({
            "total_scanned": total_scanned,
            "total_filtered": len(job_ids),
        }).eq("id", mission_id).execute()

        # No jobs to score → close the mission now, otherwise it hangs in "running".
        if not job_ids:
            empty_reason = ("deadline budget was exhausted before scoring"
                            if live_jobs else "no live roles passed your filters")
            db.table("missions").update({
                "status": "completed",
                "total_matches": 0,
            }).eq("id", mission_id).execute()
            _pub(r, mission_id, "star", f"<strong>0 matches found</strong> — {empty_reason}",
                 meta={"stage": "complete", "strong_matches": 0, "total_scored": 0,
                       "scanned": total_scanned, "filtered": total_filtered, "verified": verified})
            _pub(r, mission_id, "ok", "Mission complete", meta={"stage": "complete"})
            from app.security import release_mission_lock
            release_mission_lock(r, mission_row.get("user_id"), mission_id)
            return {"status": "completed_empty", "total_filtered": 0}

        # Scoring is the dominant phase. Fit slow LLM scoring into the remaining
        # mission budget, then fast-score the rest with the same persisted match
        # contract. This prevents an unbounded score queue from timing out while
        # still returning real jobs.
        elapsed = time.monotonic() - started_monotonic
        remaining = max(0, MISSION_TARGET_SECONDS - elapsed)
        llm_slots = min(LLM_SCORE_CAP, _score_slots_for_budget(remaining, _SCORE_RATE_SEED), queued)
        eta_seconds = min(remaining, max(1, llm_slots) * _SCORE_RATE_SEED)
        fast_slots = max(0, queued - llm_slots)
        _pub(r, mission_id, "run", f"Scoring {queued} roles ({llm_slots} deep, {fast_slots} fast)...",
             meta={"stage": "score", "queued": queued, "scanned": total_scanned,
                   "filtered": total_filtered, "verified": verified,
                   "total": queued, "eta_seconds": int(eta_seconds),
                   "llm_slots": llm_slots, "fast_slots": fast_slots,
                   "target_seconds": MISSION_TARGET_SECONDS})
        # Seed the scoring total in Redis so progress and ETA can be computed
        # without DB round-trips.
        r.hset(f"mission:{mission_id}:rate", mapping={
            "total": queued,
            "deadline_ms": deadline_ms,
            "target_seconds": MISSION_TARGET_SECONDS,
        })
        # Reset the atomic completion counter so stale events from any prior run
        # don't pre-inflate the "attempted" tally in _check_mission_complete.
        r.delete(f"mission:{mission_id}:attempted")
        r.delete(f"mission:{mission_id}:score_start_ms")
        from app.workers.score import score_jobs_for_mission
        score_jobs_for_mission(db, r, mission_id, job_ids, profile,
                               deadline_ms=deadline_ms, llm_limit=llm_slots)

        return {"status": "completed", "total_filtered": len(job_ids)}

    except Exception as exc:
        log.error("mission_failed", mission_id=mission_id, error=str(exc))
        db.table("missions").update({"status": "failed"}).eq("id", mission_id).execute()
        _pub(r, mission_id, "error", f"Mission failed: {exc}",
             meta={"stage": "complete", "error": str(exc)})
        # Release the per-user concurrency lock so a failed mission doesn't block
        # the user for the full 600s TTL.
        try:
            uid = (db.table("missions").select("user_id").eq("id", mission_id)
                   .single().execute().data or {}).get("user_id")
            from app.security import release_mission_lock
            release_mission_lock(r, uid, mission_id)
        except Exception:
            pass
        raise


def _search_exa(query: str, location: str, api_key: str) -> list:
    """Call Exa AI semantic search API."""
    if not api_key:
        return []
    try:
        # US market only — anchor the semantic search to the US when the user
        # didn't give a narrower location.
        full_query = f"{query} job posting {location or 'United States'}".strip()
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
            timeout=8,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        jobs = []
        for r in results:
            title = r.get("title", "")
            text = (r.get("text") or "")
            smin, smax = _parse_salary(f"{title} {text}")
            jobs.append({
                "title": title,
                "url": r.get("url", ""),
                "company": _extract_company(r.get("url", ""), title),
                "description_snippet": text[:500],
                "source": "exa",
                "location": _infer_exa_location(title, text, location),
                "salary_min": smin,
                "salary_max": smax,
            })
        return jobs
    except Exception as e:
        log.warning("exa_search_failed", error=str(e))
        return []


def _infer_exa_location(title: str, text: str, fallback: str) -> str:
    """Best-effort Exa location extraction for the US gate.

    Exa search results do not provide a structured location field. Do not stamp
    every result with the mission location; inspect result title/body for clear
    market signals so non-US postings do not inherit a blank/Remote filter.
    """
    haystack = f"{title or ''} {text or ''}"
    explicit = (fallback or "").strip()
    if _has_us_signal(haystack):
        return "Remote (US-eligible)" if "remote" in haystack.lower() else "United States"
    # Regions/countries can be inferred from the full text; city names only
    # from the TITLE (US postings mention foreign cities in body prose).
    for region in sorted(_NON_US_REGIONS, key=len, reverse=True):
        if _has_market_phrase(haystack, region):
            return region.title()
    for city in sorted(_NON_US_CITIES, key=len, reverse=True):
        if _has_market_phrase(title or "", city):
            return city.title()
    return explicit


# Known US companies per ATS (extend via portals config later)
GREENHOUSE_COS = ["anthropic", "stripe", "notion", "figma", "vercel", "linear", "supabase",
                  "databricks", "robinhood", "coinbase", "airtable", "discord", "instacart",
                  "doordash", "plaid", "brex", "ramp", "scaleai", "cruise"]
LEVER_COS = ["openai", "mistral", "huggingface", "cohere", "netflix", "spotify", "plaid",
             "k2view", "lattice", "verkada"]
ASHBY_COS = ["linear", "vercel", "supabase", "raycast", "ramp", "runwayml", "replit",
             "perplexityai", "clay", "mercury"]
# SmartRecruiters company identifiers (api.smartrecruiters.com)
SMARTRECRUITERS_COS = ["Square", "Visa", "Bosch", "McDonalds", "Twitch", "WeWork", "Equinix"]

# DB-backed ATS company discovery (ats_companies table, seeded by
# scripts/seed_ats_companies.py). 10-min module-level cache; hardcoded lists
# above remain the fallback. Capped at 45 slugs per ATS for the mission budget.
_ATS_SLUG_CACHE: dict = {}
_ATS_SLUG_TTL_SECONDS = 600
_ATS_SLUG_CAP = 45


def _ats_company_slugs(ats: str, fallback: list) -> list:
    now = time.monotonic()
    cached = _ATS_SLUG_CACHE.get(ats)
    if cached and now - cached[0] < _ATS_SLUG_TTL_SECONDS:
        return cached[1]
    try:
        rows = (new_db().table("ats_companies").select("slug")
                .eq("ats", ats).eq("active", True).execute().data) or []
        slugs = [r["slug"] for r in rows if r.get("slug")][:_ATS_SLUG_CAP]
        if not slugs:
            return fallback
        _ATS_SLUG_CACHE[ats] = (now, slugs)
        return slugs
    except Exception as e:
        log.warning("ats_company_slugs_failed", ats=ats, error=str(e))
        return fallback


def _search_ats_feeds(query: str, location: str, sources: list) -> list:
    """
    Fetch structured ATS job board APIs.
    Greenhouse:      https://boards-api.greenhouse.io/v1/boards/{co}/jobs?content=true
    Lever:           https://api.lever.co/v0/postings/{co}?mode=json
    SmartRecruiters: https://api.smartrecruiters.com/v1/companies/{co}/postings

    Companies within each ATS are fetched concurrently (ThreadPoolExecutor) —
    previously this loop was sequential and dominated mission wall-time when any
    board was slow (18 Greenhouse boards × 10s timeout = 180s worst case alone).
    """
    jobs = []
    keywords = [k for k in query.lower().split() if len(k) > 2]

    def _hit(title: str) -> bool:
        t = (title or "").lower()
        return any(kw in t for kw in keywords) if keywords else True

    # ── Greenhouse ──
    if "greenhouse" in sources:
        def _gh(co: str) -> list:
            out = []
            try:
                resp = requests.get(
                    f"https://boards-api.greenhouse.io/v1/boards/{co}/jobs?content=true",
                    headers={"User-Agent": _UA}, timeout=4,
                )
                if resp.status_code == 200:
                    for j in resp.json().get("jobs", []):
                        if _hit(j.get("title", "")):
                            content = j.get("content", "") or ""
                            smin, smax = _parse_salary(f"{j.get('title','')} {content}")
                            out.append({
                                "title": j["title"],
                                "url": j.get("absolute_url", ""),
                                "company": co.title(),
                                "location": j.get("location", {}).get("name", ""),
                                "description_snippet": _strip_html(content)[:500],
                                "source": "greenhouse",
                                "salary_min": smin,
                                "salary_max": smax,
                            })
            except Exception:
                pass
            return out
        jobs.extend(_parallel_flatten(_gh, _ats_company_slugs("greenhouse", GREENHOUSE_COS)))

    # ── Lever ──
    if "lever" in sources:
        def _lv(co: str) -> list:
            out = []
            try:
                resp = requests.get(f"https://api.lever.co/v0/postings/{co}?mode=json",
                                    headers={"User-Agent": _UA}, timeout=4)
                if resp.status_code == 200:
                    for j in resp.json():
                        if _hit(j.get("text", "")):
                            desc = j.get("descriptionPlain", "") or ""
                            smin, smax = _parse_salary(f"{j.get('text','')} {desc}")
                            out.append({
                                "title": j["text"],
                                "url": j.get("hostedUrl", ""),
                                "company": co.title(),
                                "location": j.get("categories", {}).get("location", ""),
                                "description_snippet": desc[:500],
                                "source": "lever",
                                "salary_min": smin,
                                "salary_max": smax,
                            })
            except Exception:
                pass
            return out
        jobs.extend(_parallel_flatten(_lv, _ats_company_slugs("lever", LEVER_COS)))

    # ── SmartRecruiters ──
    if "smartrecruiters" in sources:
        # ISO-2 → display name for country codes SmartRecruiters returns (e.g. "us" → "United States")
        _SR_COUNTRY = {"us": "United States", "ca": "Canada", "gb": "United Kingdom",
                       "de": "Germany", "fr": "France", "au": "Australia", "in": "India"}
        def _sr(co: str) -> list:
            out = []
            try:
                resp = requests.get(
                    f"https://api.smartrecruiters.com/v1/companies/{co}/postings?limit=100",
                    headers={"User-Agent": _UA, "Accept": "application/json"}, timeout=4,
                )
                if resp.status_code == 200:
                    for j in resp.json().get("content", []):
                        if _hit(j.get("name", "")):
                            loc = j.get("location", {}) or {}
                            if loc.get("remote"):
                                loc_str = "Remote"
                            else:
                                full = loc.get("fullLocation") or ""
                                if full:
                                    loc_str = full
                                else:
                                    country_raw = (loc.get("country") or loc.get("countryCode") or "").lower()
                                    country = _SR_COUNTRY.get(country_raw, loc.get("country") or "")
                                    loc_str = ", ".join(filter(None, [loc.get("city"), loc.get("region"), country]))
                            dept = (j.get("department") or {}).get("label", "")
                            industry = (j.get("industry") or {}).get("label", "")
                            exp = (j.get("experienceLevel") or {}).get("label", "")
                            emp_type = (j.get("typeOfEmployment") or {}).get("label", "")
                            description_snippet = " | ".join(filter(None, [dept, industry, exp, emp_type]))
                            uuid = j.get("id", "")
                            out.append({
                                "title": j["name"],
                                "url": f"https://jobs.smartrecruiters.com/{co}/{uuid}",
                                "company": co,
                                "location": loc_str,
                                "description_snippet": description_snippet,
                                "source": "smartrecruiters",
                                "salary_min": None,
                                "salary_max": None,
                            })
            except Exception:
                pass
            return out
        jobs.extend(_parallel_flatten(_sr, _ats_company_slugs("smartrecruiters", SMARTRECRUITERS_COS)))

    # ── Ashby ──
    if "ashby" in sources:
        def _as(co: str) -> list:
            out = []
            try:
                resp = requests.get(
                    f"https://api.ashbyhq.com/posting-api/job-board/{co}?includeCompensation=true",
                    headers={"User-Agent": _UA, "Accept": "application/json"}, timeout=4,
                )
                if resp.status_code == 200:
                    for j in resp.json().get("jobs", []):
                        if not j.get("isListed", True):
                            continue
                        if _hit(j.get("title", "")):
                            comp = ((j.get("compensation") or {})
                                    .get("scrapeableCompensationSalarySummary") or "")
                            desc = j.get("descriptionPlain", "") or ""
                            smin, smax = _parse_salary(f"{comp} {j.get('title','')} {desc[:400]}")
                            raw_loc = (j.get("location") or "").strip()
                            if j.get("isRemote"):
                                ashby_loc = f"Remote, {raw_loc}" if raw_loc else "Remote"
                            else:
                                ashby_loc = raw_loc
                            out.append({
                                "title": (j.get("title") or "").strip(),
                                "url": j.get("jobUrl", ""),
                                "company": co.title(),
                                "location": ashby_loc,
                                "description_snippet": desc[:500],
                                "source": "ashby",
                                "salary_min": smin,
                                "salary_max": smax,
                            })
            except Exception:
                pass
            return out
        jobs.extend(_parallel_flatten(_as, _ats_company_slugs("ashby", ASHBY_COS)))

    return jobs


def _parallel_flatten(fn, items: list, workers: int = 12) -> list:
    """Run `fn(item)` over `items` concurrently, flatten the list-of-lists.

    Single-threaded fallback when the pool can't start (e.g. tight Celery worker
    memory). One slow board never blocks the others — as_completed drains fast
    boards first so their postings join the funnel immediately."""
    if not items:
        return []
    out: list = []
    try:
        with ThreadPoolExecutor(max_workers=min(workers, len(items))) as pool:
            # submit + as_completed (NOT pool.map, which yields in submission
            # order): a slow leading board can't block faster boards from joining
            # the funnel. Per-future try/except so one failing board can't abort
            # the batch or leak its exception out of the loop.
            futures = [pool.submit(fn, item) for item in items]
            for fut in as_completed(futures):
                try:
                    res = fut.result()
                except Exception:
                    res = None
                if res:
                    out.extend(res)
    except Exception:
        # Pool couldn't even start (tight worker memory) → sequential fallback.
        for item in items:
            try:
                res = fn(item)
                if res:
                    out.extend(res)
            except Exception:
                continue
    return out


def _search_remoteok(query: str) -> list:
    """
    RemoteOK public JSON API: https://remoteok.com/api
    First array element is a legal/metadata notice — skip entries without 'id'.
    US-eligible filter: keep 'Worldwide' or US-region roles, drop region-locked non-US.
    """
    jobs = []
    keywords = [k for k in query.lower().split() if len(k) > 2]
    try:
        resp = requests.get("https://remoteok.com/api",
                            headers={"User-Agent": _UA, "Accept": "application/json"}, timeout=6)
        if resp.status_code != 200:
            return []
        for j in resp.json():
            if not isinstance(j, dict) or not j.get("id"):
                continue
            title = (j.get("position") or "").lower()
            tags = " ".join(j.get("tags", [])).lower()
            blob = f"{title} {tags}"
            if keywords and not any(kw in blob for kw in keywords):
                continue
            # US-eligibility: RemoteOK 'location' is a region restriction string.
            # Strategy: pass if explicitly US/worldwide OR if location is ambiguous
            # (e.g. "Los Angeles Metropolitan Area", "Colorado"). Only reject when
            # the string explicitly names a non-US region.
            region = (j.get("location") or "").lower()
            if region:
                region_words = set(re.findall(r"[a-z]+", region))
                explicitly_us = (
                    bool(region_words & {"us", "usa", "america", "americas",
                                         "worldwide", "anywhere", "remote", "nationwide"})
                    or "united states" in region or "north america" in region
                )
                explicitly_non_us = any(s in region for s in _REMOTEOK_NON_US_SIGNALS)
                if not explicitly_us and explicitly_non_us:
                    continue
            desc = j.get("description", "") or ""
            smin, smax = _parse_salary(f"{title} {desc}")
            # RemoteOK also exposes structured salary fields
            smin = smin or (j.get("salary_min") or None)
            smax = smax or (j.get("salary_max") or None)
            jobs.append({
                "title": j.get("position", ""),
                "url": j.get("url", ""),
                "company": j.get("company", ""),
                "location": j.get("location") or "Remote (US-eligible)",
                "description_snippet": _strip_html(desc)[:500],
                "source": "remoteok",
                "salary_min": smin,
                "salary_max": smax,
            })
    except Exception as e:
        log.warning("remoteok_search_failed", error=str(e))
    return jobs


def _search_workable(query: str, pages: int = 1) -> list:
    """
    Workable public US job board (aggregates all 35k+ Workable-powered companies):
      https://jobs.workable.com/api/v1/jobs?query={query}&location=united+states
    Natively US-filtered via the location param. Paginates with nextPageToken.
    """
    from urllib.parse import quote_plus
    jobs = []
    token = None
    try:
        for _ in range(max(1, pages)):
            url = f"https://jobs.workable.com/api/v1/jobs?query={quote_plus(query)}&location=united+states"
            if token:
                url += f"&pageToken={quote_plus(token)}"
            resp = requests.get(url, headers={"User-Agent": _UA, "Accept": "application/json"}, timeout=6)
            if resp.status_code != 200:
                break
            data = resp.json()
            for j in data.get("jobs", []):
                desc = j.get("description", "") or ""
                # benefitsSection often contains the salary when description doesn't
                benefits = j.get("benefitsSection", "") or j.get("benefits", "") or ""
                smin, smax = _parse_salary(f"{j.get('title','')} {desc} {benefits}")
                loc = j.get("location", {}) or {}
                if isinstance(loc, list):
                    loc = loc[0] if loc else {}
                # Workable returns subregion (state) and countryName (full name), not region/country
                loc_str = ", ".join(filter(None, [
                    loc.get("city"),
                    loc.get("region") or loc.get("subregion"),
                    loc.get("country") or loc.get("countryName"),
                ]))
                jobs.append({
                    "title": j.get("title", ""),
                    "url": j.get("url", ""),
                    "company": (j.get("company") or {}).get("title", "") if isinstance(j.get("company"), dict) else (j.get("company") or ""),
                    "location": "Remote" if j.get("workplace") == "remote" else (loc_str or "United States"),
                    "description_snippet": _strip_html(desc)[:500],
                    "source": "workable",
                    "salary_min": smin,
                    "salary_max": smax,
                })
            token = data.get("nextPageToken")
            if not token:
                break
    except Exception as e:
        log.warning("workable_search_failed", error=str(e))
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
    keywords = [k for k in query.lower().split() if len(k) > 2]
    for url in feeds:
        try:
            resp = requests.get(url, headers={"User-Agent": _UA, "Accept": "application/rss+xml, application/xml, text/xml"},
                                timeout=4)
            if resp.status_code != 200:
                continue
            feed = feedparser.parse(resp.content)
            for entry in feed.entries[:50]:
                title = (entry.get("title") or "").lower()
                if keywords and not any(kw in title for kw in keywords):
                    continue
                summary = entry.get("summary") or ""
                smin, smax = _parse_salary(f"{title} {summary}")
                jobs.append({
                    "title": entry.get("title", ""),
                    "url": entry.get("link", ""),
                    "company": entry.get("author", ""),
                    "description_snippet": _strip_html(summary)[:500],
                    "source": "rss",
                    "location": "Remote",
                    "salary_min": smin,
                    "salary_max": smax,
                })
        except Exception:
            continue
    return jobs


def _parse_salary(text: str):
    """
    Best-effort US salary extraction → (annual_min, annual_max) in USD, or (None, None).
    Handles: $120,000 - $150,000 | $120k–$150k | $120K to $150K | $90/hr (→ annualized).
    Conservative: returns None when nothing parseable is found.
    """
    if not text:
        return None, None
    t = text.replace("–", "-").replace("—", "-").replace(" ", " ")

    def _to_int(num: str, suffix: str):
        try:
            val = float(num.replace(",", ""))
        except ValueError:
            return None
        if suffix and suffix.lower() == "k":
            val *= 1000
        return int(val)

    NUM = r"(\d[\d,]*(?:\.\d+)?)"  # 120 | 120,000 | 211.4

    # Hourly range FIRST: $60/hr - $80/hr | $60-80/hr — must check before single-hourly
    # so "$60/hr - $80/hr" doesn't stop at the first "$60/hr" and return (125k, 125k).
    m_hr = re.search(
        r"\$\s*" + NUM + r"\s*(?:/\s*h(?:ou)?r)?\s*[-–]\s*\$?\s*" + NUM + r"\s*/\s*h(?:ou)?r",
        t, re.I,
    )
    if m_hr:
        lo_h = _to_int(m_hr.group(1), "")
        hi_h = _to_int(m_hr.group(2), "")
        if lo_h and hi_h and 10 <= lo_h <= 500 and lo_h <= hi_h:
            return int(lo_h * 2080), int(hi_h * 2080)

    # Single hourly: $90/hr or $90 per hour → annualize (×2080)
    m = re.search(r"\$\s*" + NUM + r"\s*(?:/|\s*per\s*)\s*h(?:ou)?r", t, re.I)
    if m:
        hourly = _to_int(m.group(1), "")
        if hourly and 10 <= hourly <= 500:
            ann = int(hourly * 2080)
            return ann, ann

    # Range: $120,000 - $150,000 | $120k - $150k | $120k to $150k | $211.4K - $290.6K
    m = re.search(r"\$\s*" + NUM + r"\s*([kK]?)\s*(?:-|to)\s*\$?\s*" + NUM + r"\s*([kK]?)", t, re.I)
    if m:
        lo = _to_int(m.group(1), m.group(2) or m.group(4))
        hi = _to_int(m.group(3), m.group(4) or m.group(2))
        if lo and hi and 10000 <= lo <= 2000000 and lo <= hi <= 3000000:
            return lo, hi

    # All standalone $ amounts → plausible envelope. Taking min/max (not the FIRST
    # match) stops a small perk figure ("$5k relocation") from masking the real base.
    vals = []
    for num, suf in re.findall(r"\$\s*" + NUM + r"\s*([kK]?)\b", t):
        v = _to_int(num, suf)
        if v and 30000 <= v <= 2000000:
            vals.append(v)
    if vals:
        return min(vals), max(vals)

    return None, None


def _interleave_by_source(jobs: list) -> list:
    """
    Round-robin interleave jobs by their 'source' so a downstream cap (SCORE_CAP)
    samples fairly across providers instead of draining the first source.

    Within each source, original order is preserved. Sources are cycled in the
    order they first appear, so e.g. [exa, exa, ats, workable] → [exa, ats, workable, exa].
    """
    from collections import OrderedDict
    buckets = OrderedDict()
    for j in jobs:
        buckets.setdefault(j.get("source") or "?", []).append(j)
    result = []
    queues = list(buckets.values())
    idx = 0
    while queues:
        q = queues[idx % len(queues)]
        result.append(q.pop(0))
        if not q:
            queues.remove(q)
        else:
            idx += 1
    return result


def _dedupe_jobs(jobs: list) -> list:
    """Cross-source dedup: exact-URL repeats first, then same-company
    fuzzy-similar titles (app.services.trust.titles_match, the career-ops
    role-matcher rule). First occurrence wins, source order is preserved."""
    from app.services.trust import titles_match
    seen_urls = set()
    titles_by_company: dict = {}
    kept = []
    for j in jobs:
        url = (j.get("url") or "").strip().lower()
        if url and url in seen_urls:
            continue
        company = (j.get("company") or "").strip().lower()
        title = (j.get("title") or "").strip()
        if company and title and any(
            titles_match(prev, title) for prev in titles_by_company.get(company, ())
        ):
            continue
        if url:
            seen_urls.add(url)
        if company and title:
            titles_by_company.setdefault(company, []).append(title)
        kept.append(j)
    return kept


def _dedupe_exact_urls(jobs: list) -> list:
    seen_urls = set()
    unique_jobs = []
    for j in jobs:
        url = (j.get("url") or "").strip()
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique_jobs.append(j)
    return unique_jobs


def _filter_then_dedupe_jobs(jobs: list, profile: dict, location: str, salary_min: int) -> list:
    """Apply market/profile filters before fuzzy deduping cross-source copies."""
    return _dedupe_exact_urls(_dedupe_jobs(_filter_jobs(jobs, profile, location, salary_min)))


def _filter_jobs(jobs: list, profile: dict, location: str, salary_min: int) -> list:
    """
    Keyword + location + conservative-salary pre-filter before expensive LLM scoring.

    Salary rule (matches career-ops 'conservative by design'):
      - A job is dropped ONLY if it has a known salary ceiling (salary_max) that is
        below the requested minimum. Jobs with no salary data ALWAYS pass.
    """
    target_roles = [r.lower() for r in (profile.get("target_roles") or [])]
    loc_lower = (location or "").lower()
    floor = salary_min or 0

    filtered = []
    for j in jobs:
        title = (j.get("title") or "").lower()
        job_loc = (j.get("location") or "").lower()

        # US-market gate — ALWAYS on, regardless of the mission's location
        # filter. (The old branch skipped location checks entirely when the
        # filter was empty/'remote', letting EMEA/APAC/Middle-East roles through.)
        if not _is_us_eligible_job(j):
            continue

        # Narrower user-requested location (e.g. a specific city/state).
        if loc_lower and loc_lower not in ("any", "remote"):
            if "remote" not in job_loc and loc_lower not in job_loc:
                continue

        # Title relevance: at least one keyword from target_roles
        if target_roles and not any(kw in title for kw in target_roles):
            continue

        # Conservative salary filter: drop only if a known ceiling is below the floor.
        if floor:
            smax = j.get("salary_max")
            if smax is not None and smax < floor:
                continue

        filtered.append(j)

    return filtered


def _check_one_live(job: dict) -> bool:
    """
    Return True if a posting looks live, False if definitively dead/closed.
    Conservative: network errors, timeouts, and non-definitive statuses → treat as LIVE
    (never drop a job for a transient blip). Only 404/410 or an explicit closed banner
    in the page body marks it dead.
    """
    url = job.get("url")
    if not url:
        return True
    try:
        resp = requests.get(url, headers={"User-Agent": _UA}, timeout=2.5,
                            allow_redirects=True, stream=True)
        if resp.status_code in (404, 410):
            return False
        # Some ATS return 200 with a "closed" body. Sniff first chunk only.
        body = ""
        if resp.status_code == 200:
            try:
                body = resp.text[:20000].lower()
            except Exception:
                body = ""
        resp.close()
        if body and any(marker in body for marker in _CLOSED_MARKERS):
            return False
        return True
    except Exception:
        return True


def _verify_liveness(jobs: list):
    """Concurrently liveness-check postings. Returns (live_jobs, dead_count)."""
    if not jobs:
        return [], 0
    # Check concurrently but REBUILD in original candidate order, so the priority
    # ranking survives liveness and to_score = live[:SCORE_CAP] keeps the top roles
    # (appending in completion order would shuffle the ranking).
    ok_by_idx: dict = {}
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(_check_one_live, j): i for i, j in enumerate(jobs)}
        for fut in as_completed(futures):
            i = futures[fut]
            try:
                ok_by_idx[i] = fut.result()
            except Exception:
                ok_by_idx[i] = True  # never drop on checker error
    live = [j for i, j in enumerate(jobs) if ok_by_idx.get(i, True)]
    dead = len(jobs) - len(live)
    return live, dead


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


def _strip_html(text: str) -> str:
    """Cheap HTML → text for ATS descriptions that ship raw markup."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    return re.sub(r"\s+", " ", text).strip()


def _extract_company(url: str, title: str) -> str:
    """Best-effort company extraction from URL."""
    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname or ""
        parts = host.replace("www.", "").split(".")
        return parts[0].title() if parts else ""
    except Exception:
        return ""
