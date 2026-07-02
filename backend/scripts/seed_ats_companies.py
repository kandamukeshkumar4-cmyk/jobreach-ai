"""Seed the ats_companies table with curated, currently-hiring US tech companies.

Slug sources (merged + deduped):
- career-ops clone (templates/portals.example.yml tracked companies per ATS)
- app.workers.search hardcoded fallbacks (GREENHOUSE_COS/LEVER_COS/ASHBY_COS/
  SMARTRECRUITERS_COS)
- additional well-known public boards per ATS to meet coverage targets
  (>=60 greenhouse, >=30 lever, >=30 ashby)

Run from the backend/ dir with the real env (.env / app settings) loaded:
    python -m scripts.seed_ats_companies          # upsert into ats_companies
    python -m scripts.seed_ats_companies --dry    # print counts, no writes

Slugs are lowercased, EXCEPT SmartRecruiters (its company identifiers are
case-sensitive). Upsert is idempotent via the unique(ats,slug) constraint.
"""
import sys

from app.database import get_db
from app.workers.search import (
    GREENHOUSE_COS, LEVER_COS, ASHBY_COS, SMARTRECRUITERS_COS,
)

# career-ops portals (greenhouse boards) + extra known-real Greenhouse boards
_CAREER_OPS_GREENHOUSE = [
    "ada", "airtable", "amplemarket", "anthropic", "arizeai", "blackforestlabs",
    "boomilp", "celonis", "contentful", "coreweave", "factorial", "getyourguide",
    "gleanwork", "hellofresh", "helsing", "hightouch", "hootsuite", "humeai",
    "intercom", "isomorphiclabs", "later", "n26", "openai", "parloa", "physicsx",
    "planetscale", "polyai", "runpod", "runwayml", "safariai", "scandit",
    "speechmatics", "stabilityai", "sumup", "synthesia", "templafy", "temporal",
    "traderepublicbank", "vercel", "wayve",
]
_EXTRA_GREENHOUSE = [
    "reddit", "gitlab", "cloudflare", "mongodb", "datadog", "asana", "samsara",
    "gusto", "affirm", "flexport", "duolingo", "benchling", "checkr", "nuro",
]

# career-ops portals (lever boards) + extra known-real Lever boards
_CAREER_OPS_LEVER = [
    "clarity-ai", "forto", "getir", "mistral", "palantir", "pigment", "qonto",
    "sanctuary", "spotify", "vinted", "wandb",
]
_EXTRA_LEVER = [
    "zoox", "whoop", "highspot", "welocalize", "matchgroup", "voleon", "veeva",
    "dave", "plusgrade", "outschool", "attentive", "kodiak",
]

# career-ops portals (ashby boards), lowercased
_CAREER_OPS_ASHBY = [
    "alephalpha", "deepl", "attio", "bland", "causaly", "claylabs", "clerk",
    "cohere", "corti", "cradlebio", "decagon", "deepgram", "elevenlabs",
    "faculty", "glacis-ai", "inngest", "klue", "lakera.ai", "langchain",
    "legora", "lindy", "lovable", "n8n", "perplexity", "photoroom", "pinecone",
    "pleo", "resend", "sierra", "supabase", "synthesia", "tinybird",
    "travelperk", "vapi", "workos", "zapier",
]

_CAREER_OPS_SMARTRECRUITERS: list = []  # career-ops tracks no SR boards


def _merge(lists: list, lowercase: bool = True) -> list:
    seen, out = set(), []
    for lst in lists:
        for slug in lst:
            s = str(slug).strip()
            if lowercase:
                s = s.lower()
            if s and s not in seen:
                seen.add(s)
                out.append(s)
    return out


def build_rows() -> list:
    per_ats = {
        "greenhouse": _merge([_CAREER_OPS_GREENHOUSE, GREENHOUSE_COS, _EXTRA_GREENHOUSE]),
        "lever": _merge([_CAREER_OPS_LEVER, LEVER_COS, _EXTRA_LEVER]),
        "ashby": _merge([_CAREER_OPS_ASHBY, ASHBY_COS]),
        "smartrecruiters": _merge([_CAREER_OPS_SMARTRECRUITERS, SMARTRECRUITERS_COS],
                                  lowercase=False),
    }
    rows = []
    for ats, slugs in per_ats.items():
        for slug in slugs:
            rows.append({"ats": ats, "slug": slug, "active": True})
    return rows


def main(dry: bool) -> None:
    rows = build_rows()
    counts: dict = {}
    for r in rows:
        counts[r["ats"]] = counts.get(r["ats"], 0) + 1
    for ats in ("greenhouse", "lever", "ashby", "smartrecruiters"):
        print(f"{ats}: {counts.get(ats, 0)} slugs")
    print(f"total: {len(rows)} slugs")
    if dry:
        print("[dry] no writes performed")
        return
    db = get_db()
    db.table("ats_companies").upsert(rows, on_conflict="ats,slug").execute()
    print("upserted into ats_companies")


if __name__ == "__main__":
    main(dry="--dry" in sys.argv[1:])
