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


def run_company_research(company: str, job_url: str = "") -> dict:
    """Plain function — call this directly from other tasks to avoid Celery subtask restrictions."""
    s = get_settings()
    r = redis_lib.from_url(s.redis_url, decode_responses=True)

    cache_key = f"research:{company.lower().replace(' ', '_')}"
    cached = r.get(cache_key)
    if cached:
        return json.loads(cached)

    raw_text = ""

    # 1. Exa news search
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
                timeout=20,
            )
            if resp.status_code == 200:
                for result in resp.json().get("results", []):
                    raw_text += f"\n{result.get('title','')}\n{(result.get('text') or '')[:800]}\n"
        except Exception as e:
            log.warning("exa_research_failed", company=company, error=str(e))

    # 2. Jina Reader on Glassdoor snippet (best-effort)
    glassdoor_url = f"https://www.glassdoor.com/Overview/Working-at-{company.replace(' ','-')}-EI_IE.htm"
    try:
        jina_resp = requests.get(
            f"https://r.jina.ai/{glassdoor_url}",
            headers={"User-Agent": "Mozilla/5.0", "Accept": "text/plain"},
            timeout=15,
        )
        if jina_resp.status_code == 200:
            raw_text += f"\n[Glassdoor]\n{jina_resp.text[:1500]}\n"
    except Exception:
        pass

    if not raw_text.strip():
        result = {"funding_stage": None, "growth_signal": "unknown", "remote_policy": "unknown",
                  "layoffs_24mo": False, "glassdoor_sentiment": "unknown", "tech_stack": [],
                  "recent_news": None, "red_flags": [], "positive_signals": []}
        r.setex(cache_key, 86400, json.dumps(result))
        return result

    # 3. LLM to extract structured data
    from openai import OpenAI
    client = OpenAI(
        api_key=s.nvidia_api_key,
        base_url="https://integrate.api.nvidia.com/v1",
    )
    try:
        msg = client.chat.completions.create(
            model="meta/llama-3.3-70b-instruct",
            max_tokens=512,
            messages=[
                {"role": "system", "content": RESEARCH_PROMPT_SYSTEM},
                {"role": "user", "content": f"Company: {company}\n\nScraped data:\n{raw_text[:4000]}"},
            ],
        )
        raw_json = msg.choices[0].message.content.strip()
        if raw_json.startswith("```"):
            raw_json = raw_json.split("```")[1]
            if raw_json.startswith("json"):
                raw_json = raw_json[4:]
        result = json.loads(raw_json)
    except Exception as e:
        log.warning("research_llm_failed", company=company, error=str(e))
        result = {"funding_stage": None, "growth_signal": "neutral", "remote_policy": "unknown",
                  "layoffs_24mo": False, "glassdoor_sentiment": "unknown", "tech_stack": [],
                  "recent_news": None, "red_flags": [], "positive_signals": []}

    r.setex(cache_key, 86400, json.dumps(result))
    return result


@celery_app.task(bind=True, queue="research", name="app.workers.research.fetch_company_research")
def fetch_company_research(self, company: str, job_url: str = "") -> dict:
    return run_company_research(company, job_url)
