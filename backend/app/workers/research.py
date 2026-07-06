"""
Company research worker — fetches funding, culture, news, tech stack per company.
Uses Exa + Jina Reader. Results cached in Redis for 24h.
"""
import json
import requests
import redis as redis_lib
from app.workers.celery_app import celery_app
from app.config import get_settings
import structlog

log = structlog.get_logger()

RESEARCH_PROMPT_SYSTEM = """You are a company research analyst. Given raw scraped text about a company,
extract structured intelligence relevant to a job candidate evaluating whether to apply.
Respond ONLY with valid JSON matching this schema exactly:
{
  "funding_stage": "string or null",
  "valuation": "string or null",
  "headcount": "string or null",
  "growth_signal": "positive|neutral|negative",
  "remote_policy": "fully_remote|hybrid|office_first|unknown",
  "layoffs_24mo": true or false,
  "glassdoor_sentiment": "positive|mixed|negative|unknown",
  "tech_stack": ["string"],
  "recent_news": "1-2 sentence summary of recent significant news",
  "red_flags": ["string"],
  "positive_signals": ["string"]
}"""


def _empty_research(summary: str = "") -> dict:
    """The structured shape the match UI reads. `summary` carries the raw Exa
    snippet that the scoring LLM now consumes directly (no separate extract call).
    Structured keys stay present (mostly null) so match-detail never KeyErrors."""
    return {"summary": summary, "funding_stage": None, "growth_signal": "unknown",
            "remote_policy": "unknown", "layoffs_24mo": False, "glassdoor_sentiment": "unknown",
            "tech_stack": [], "recent_news": None, "red_flags": [], "positive_signals": []}


def run_company_research(company: str, job_url: str = "") -> dict:
    """Plain function — call directly from score_job (avoids Celery subtask limits).

    SPEED: no longer makes its own 70B LLM call or the slow Jina/Glassdoor fetch.
    It does ONE fast Exa search and hands the raw snippet to the scoring LLM via
    the `summary` field — so each role is a single LLM round-trip, not two.
    Cached 24h per company, so repeat companies skip the network entirely."""
    s = get_settings()
    r = redis_lib.from_url(s.redis_url, decode_responses=True)

    cache_key = f"research:{company.lower().replace(' ', '_')}"
    try:
        cached = r.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    raw_text = ""
    if s.exa_api_key:
        try:
            resp = requests.post(
                "https://api.exa.ai/search",
                headers={"x-api-key": s.exa_api_key, "Content-Type": "application/json"},
                json={
                    "query": f"{company} company funding culture engineering team",
                    "numResults": 5,
                    "type": "neural",
                    "contents": {"text": True},
                },
                timeout=8,
            )
            if resp.status_code == 200:
                for result in resp.json().get("results", []):
                    raw_text += f"\n{result.get('title','')}\n{(result.get('text') or '')[:600]}\n"
        except Exception as e:
            log.warning("exa_research_failed", company=company, error=str(e))

    result = _empty_research(summary=raw_text.strip()[:1800])
    try:
        r.setex(cache_key, 86400, json.dumps(result))
    except Exception:
        pass
    return result


@celery_app.task(bind=True, name="app.workers.research.fetch_company_research")
def fetch_company_research(self, company: str, job_url: str = "") -> dict:
    return run_company_research(company, job_url)
