"""
Trust & repost heuristics — ported from career-ops.

score_trust:   _trust-validator.mjs rules (URL structure, missing apply link,
               suspicious/shortener domains, company ↔ domain mismatch with an
               ATS allowlist) plus description-vagueness and the US
               salary-transparency signal ("No salary disclosed").
detect_repost: detect-reposts.mjs + role-matcher.mjs — a prior sighting of the
               same company + fuzzy-similar title at a DIFFERENT URL within a
               90-day window is a repost (same URL is a dedup hit, not a repost).

Flag-only by design (career-ops principle): nothing here ever filters a job.
score_trust and the similarity helpers are deterministic — no network calls.
"""
import re
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from urllib.parse import urlparse
import structlog

log = structlog.get_logger()

# URL shorteners / free form hosts — a legit employer never routes applicants
# through these (career-ops DEFAULT_SUSPICIOUS_DOMAINS).
SUSPICIOUS_DOMAINS = frozenset([
    "bit.ly", "tinyurl.com", "t.co", "forms.gle", "goo.gl",
    "shorturl.at", "rebrand.ly", "cutt.ly",
])

# ATS hosts where the hostname legitimately never contains the company name,
# so the company↔domain mismatch check must be skipped (career-ops allowlist).
ATS_ALLOWLIST = frozenset([
    "greenhouse.io", "ashbyhq.com", "lever.co", "workday.com",
    "smartrecruiters.com", "jobvite.com", "myworkdayjobs.com", "recruitee.com",
    "workable.com", "icims.com", "taleo.net", "applytojob.com", "breezy.hr",
    "jazz.co", "bamboohr.com", "teamtailor.com",
])

# Score penalties per flag. First four match career-ops PENALTIES; the last two
# are the softer content signals this port adds per the JobReach pipeline.
PENALTIES = {
    "invalid_url": 50,
    "missing_apply_url": 40,
    "suspicious_domain": 25,
    "company_domain_mismatch": 15,
    "vague_description": 10,
    "no_salary": 5,
}

# Human-readable flag strings (the contract stored in company_research.trust).
FLAG_LABELS = {
    "invalid_url": "Invalid apply URL",
    "missing_apply_url": "No direct apply link",
    "suspicious_domain": "Suspicious domain",
    "company_domain_mismatch": "Company/domain mismatch",
    "vague_description": "Vague description",
    "no_salary": "No salary disclosed",
}

# Descriptions with fewer content words than this read as vague/ghost postings.
_VAGUE_WORD_FLOOR = 25

# Repost lookback window (career-ops DEFAULT_WINDOW_DAYS).
REPOST_WINDOW_DAYS = 90

# Two titles are "the same opening" at or above this similarity.
TITLE_SIMILARITY_THRESHOLD = 0.75

# Tokens that almost every role title shares — they must not count as matching
# signal (subset of career-ops ROLE_STOPWORDS relevant to a US pipeline).
_TITLE_STOPWORDS = frozenset([
    "junior", "senior", "staff", "principal", "lead", "head", "chief",
    "associate", "intern", "entry", "level", "remote", "hybrid", "onsite",
    "contract", "contractor", "freelance", "fulltime", "parttime", "permanent",
    "temporary", "internship", "role", "position", "opportunity", "team",
    "based", "with", "from", "into", "over", "this", "that",
])

# Short specialty acronyms that are discriminating despite their length
# (career-ops SHORT_SPECIALTY).
_SHORT_SPECIALTY = frozenset([
    "api", "sre", "sdk", "cli", "gpu", "cpu", "ios", "qa", "ux", "ui",
    "ar", "vr", "ocr", "crm", "erp",
])


def classify_trust_level(score: int) -> str:
    """Map a 0–100 trust score to a level (career-ops classifyTrustLevel)."""
    if score >= 90:
        return "high"
    if score >= 60:
        return "medium"
    return "low"


def _matches_domain_list(hostname: str, domains) -> bool:
    """True when hostname equals or is a subdomain of any listed domain."""
    for domain in domains:
        if hostname == domain or hostname.endswith("." + domain):
            return True
    return False


def _company_matches_hostname(company: str, hostname: str) -> bool:
    """Heuristic: does the company name plausibly match the URL hostname?
    Full-slug substring check, then any word ≥3 chars. Un-evaluable → True
    (no flag), matching career-ops companyMatchesHostname."""
    if not company or not hostname:
        return True
    normalized = re.sub(r"[^a-z0-9 ]", "", company.lower()).strip()
    if not normalized:
        return True
    slug = normalized.replace(" ", "")
    if slug in hostname:
        return True
    for word in normalized.split():
        if len(word) >= 3 and word in hostname:
            return True
    return False


def score_trust(job: dict) -> dict:
    """Score a job posting's trustworthiness — flags only, never filters.

    Returns the company_research["trust"] contract:
        {"score": int 0-100, "level": "high"|"medium"|"low", "flags": [str]}
    """
    flags = []
    score = 100

    def _flag(key: str):
        nonlocal score
        flags.append(FLAG_LABELS[key])
        score -= PENALTIES[key]

    url = (job.get("url") or "").strip()
    hostname = ""
    if not url:
        _flag("missing_apply_url")
    else:
        parsed = None
        try:
            parsed = urlparse(url)
        except Exception:
            parsed = None
        if not parsed or parsed.scheme not in ("http", "https") or not parsed.netloc:
            _flag("invalid_url")
        else:
            hostname = parsed.netloc.lower().split(":")[0]

    # Domain checks only run when we have a parseable http(s) hostname.
    if hostname:
        if _matches_domain_list(hostname, SUSPICIOUS_DOMAINS):
            _flag("suspicious_domain")
        company = (job.get("company") or "").strip()
        if company and not _matches_domain_list(hostname, ATS_ALLOWLIST):
            if not _company_matches_hostname(company, hostname):
                _flag("company_domain_mismatch")

    # Content signals (independent of the URL checks).
    description = (job.get("description_snippet") or job.get("description") or "").strip()
    if len(description.split()) < _VAGUE_WORD_FLOOR:
        _flag("vague_description")

    # US salary-transparency signal: flag (never filter) when neither bound is known.
    if job.get("salary_min") is None and job.get("salary_max") is None:
        _flag("no_salary")

    score = max(0, min(100, score))
    return {"score": score, "level": classify_trust_level(score), "flags": flags}


def _title_tokens(title: str) -> set:
    """Content tokens for fuzzy title matching (career-ops roleTokens): keep
    words >3 chars or short specialty acronyms, drop stopwords."""
    text = re.sub(r"[^a-z0-9\s]", " ", (title or "").lower())
    return {
        w for w in text.split()
        if (len(w) > 3 or w in _SHORT_SPECIALTY) and w not in _TITLE_STOPWORDS
    }


def title_similarity(a: str, b: str) -> float:
    """Similarity in [0, 1] between two role titles — max of the content-token
    Jaccard overlap and the SequenceMatcher ratio on normalized strings.
    Pure and deterministic (testable without a DB)."""
    tokens_a = _title_tokens(a)
    tokens_b = _title_tokens(b)
    jaccard = 0.0
    if tokens_a and tokens_b:
        union = tokens_a | tokens_b
        jaccard = len(tokens_a & tokens_b) / len(union) if union else 0.0
    norm_a = " ".join(sorted(_title_tokens(a))) or (a or "").lower().strip()
    norm_b = " ".join(sorted(_title_tokens(b))) or (b or "").lower().strip()
    ratio = SequenceMatcher(None, norm_a, norm_b).ratio() if norm_a and norm_b else 0.0
    return max(jaccard, ratio)


def titles_match(a: str, b: str) -> bool:
    """True when two titles are similar enough to describe the same opening."""
    return title_similarity(a, b) >= TITLE_SIMILARITY_THRESHOLD


def _parse_ts(value) -> datetime:
    """Defensive ISO timestamp parse (Supabase returns e.g. ...+00:00 or Z)."""
    if not value:
        return None
    try:
        ts = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts
    except Exception:
        return None


def detect_repost(db, job: dict, user_profile_ids: list,
                  exclude_mission_id: str | None = None) -> dict:
    """Detect whether this user has already seen this opening — same company
    (case-insensitive) + fuzzy-similar title at a different URL, within the
    90-day window (career-ops detect-reposts rules, scoped to this user's
    profiles via matches → missions).

    ONE query: the user's PRIOR matches' job title/company/url/created_at,
    bounded server-side to the 90-day window (newest first, capped) so a heavy
    user can't blow past PostgREST's max-rows and silently truncate. Matches
    from the CURRENT mission are excluded — two similar listings surfaced by
    the same run are duplicates, not reposts.
    Returns the company_research["repost"] contract:
        {"is_repost": bool, "last_seen_days": int|None}
    """
    result = {"is_repost": False, "last_seen_days": None}
    company = (job.get("company") or "").strip().lower()
    title = (job.get("title") or "").strip()
    if not company or not title or not user_profile_ids:
        return result

    cutoff = (datetime.now(timezone.utc) - timedelta(days=REPOST_WINDOW_DAYS)).isoformat()
    q = (
        db.table("matches")
        .select("created_at, missions!inner(profile_id), jobs!inner(title, company, url)")
        .in_("missions.profile_id", user_profile_ids)
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(500)
    )
    if exclude_mission_id:
        q = q.neq("mission_id", exclude_mission_id)
    rows = q.execute().data or []

    now = datetime.now(timezone.utc)
    url = (job.get("url") or "").strip()
    last_seen_days = None
    for row in rows:
        prior = row.get("jobs") or {}
        if (prior.get("company") or "").strip().lower() != company:
            continue
        # Same URL is a dedup hit, not a repost (career-ops buildRepostCluster).
        prior_url = (prior.get("url") or "").strip()
        if url and prior_url == url:
            continue
        if not titles_match(title, prior.get("title") or ""):
            continue
        seen = _parse_ts(row.get("created_at"))
        if not seen:
            continue
        days = (now - seen).days
        if days < 0 or days > REPOST_WINDOW_DAYS:
            continue
        if last_seen_days is None or days < last_seen_days:
            last_seen_days = days

    if last_seen_days is not None:
        result = {"is_repost": True, "last_seen_days": int(last_seen_days)}
    return result
