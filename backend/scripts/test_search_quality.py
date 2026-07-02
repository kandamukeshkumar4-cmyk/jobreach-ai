"""Offline proof for US-market gating, resume-driven queries, and job dedup.

Run from backend/:  python -m scripts.test_search_quality   (no env needed)
Exits non-zero on failure; prints PASS/FAIL per check.
"""
import os
import sys

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "service")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("NVIDIA_API_KEY", "dummy")

from app.workers.search import (
    _dedupe_jobs,
    _filter_jobs,
    _filter_then_dedupe_jobs,
    _infer_exa_location,
    _is_us_eligible,
    _resume_driven_queries,
)

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + str(detail)) if detail and not ok else ''}")


def main() -> None:
    print("== US-market gate (always on) ==")
    check("Abu Dhabi dropped", not _is_us_eligible("Abu Dhabi"))
    check("UAE dropped", not _is_us_eligible("Dubai, UAE"))
    check("Remote - EMEA dropped", not _is_us_eligible("Remote - EMEA"))
    check("Singapore dropped", not _is_us_eligible("Singapore"))
    check("Remote Europe dropped", not _is_us_eligible("Remote, Europe"))
    check("Canada dropped", not _is_us_eligible("Toronto, Canada"))
    check("US city passes", _is_us_eligible("San Francisco, CA"))
    check("Indianapolis is not India", _is_us_eligible("Indianapolis, IN"))
    check("Remote (US) passes", _is_us_eligible("Remote (US)"))
    check("plain Remote passes", _is_us_eligible("Remote"))
    check("empty/unknown passes (conservative)", _is_us_eligible(""))
    check("US-or-Europe passes (explicit US marker wins)",
          _is_us_eligible("Remote — US or Europe"))
    check("United States passes", _is_us_eligible("United States"))

    print("== resume-driven query building ==")
    profile = {"skills": ["Python", "FastAPI", "AWS", "React"],
               "target_roles": ["AI Engineer", "ML Platform Engineer"]}
    qs = _resume_driven_queries("ai engineer", profile)
    check("primary query enriched with top skills",
          qs[0] == "ai engineer Python FastAPI AWS", qs[0])
    check("distinct target role added as variant",
          any("ML Platform Engineer" in q for q in qs), qs)
    check("role equal to query NOT duplicated",
          sum(1 for q in qs if q.lower().startswith("ai engineer")) == 1, qs)
    check("capped at 3 variants", len(qs) <= 3, len(qs))
    check("empty profile degrades to plain query",
          _resume_driven_queries("ai engineer", {}) == ["ai engineer"])
    resume_only = _resume_driven_queries(
        "ai engineer",
        {"resume_markdown": "Built Python FastAPI services on AWS with Redis."},
    )
    check("resume markdown enriches query when profile fields are empty",
          resume_only[0] == "ai engineer Python FastAPI AWS",
          resume_only)

    print("== US-market gate reads full job text ==")
    exa_style_jobs = [
        {"source": "exa", "title": "AI Engineer - Abu Dhabi", "location": "", "description_snippet": "Build AI systems in UAE."},
        {"source": "exa", "title": "AI Engineer", "location": "", "description_snippet": "Remote role for EMEA and Singapore."},
        {"source": "exa", "title": "AI Engineer", "location": "", "description_snippet": "Remote US role building AI systems."},
    ]
    exa_filtered = _filter_jobs(exa_style_jobs, {"target_roles": ["AI Engineer"]}, "", 0)
    check("Exa non-US text is dropped even when location is blank",
          [j["description_snippet"] for j in exa_filtered] == ["Remote US role building AI systems."],
          exa_filtered)
    check("Exa title/body infers non-US location instead of blank mission filter",
          _infer_exa_location("AI Engineer - Abu Dhabi", "Build AI systems in UAE.", "") == "Abu Dhabi")
    check("Exa title/body keeps explicit US eligibility",
          _infer_exa_location("AI Engineer", "Remote US role.", "Remote") == "Remote (US-eligible)")

    print("== cross-source dedup ==")
    jobs = [
        {"url": "https://a.example/1", "company": "Databricks", "title": "AI Engineer - FDE (Forward Deployed Engineer)"},
        {"url": "https://a.example/1", "company": "Databricks", "title": "AI Engineer - FDE (Forward Deployed Engineer)"},  # same URL
        {"url": "https://b.example/2", "company": "Databricks", "title": "AI Engineer — FDE Forward Deployed Engineer"},   # fuzzy same
        {"url": "https://c.example/3", "company": "Databricks", "title": "Staff Product Designer"},                        # distinct role
        {"url": "https://d.example/4", "company": "OtherCo", "title": "AI Engineer - FDE (Forward Deployed Engineer)"},    # other company
        {"url": "", "company": "", "title": ""},                                                                            # degenerate row kept
    ]
    out = _dedupe_jobs(jobs)
    check("URL + fuzzy-title repeats collapsed", len(out) == 4, [j["url"] for j in out])
    check("first occurrence wins", out[0]["url"] == "https://a.example/1")
    check("distinct same-company role kept",
          any(j["title"] == "Staff Product Designer" for j in out))
    check("same title at another company kept",
          any(j["company"] == "OtherCo" for j in out))

    ordering_jobs = [
        {"url": "https://emea.example/role", "company": "Acme", "title": "AI Engineer", "location": "Remote - EMEA", "source": "exa"},
        {"url": "https://us.example/role", "company": "Acme", "title": "AI Engineer", "location": "United States", "source": "ashby"},
    ]
    ordered = _filter_then_dedupe_jobs(ordering_jobs, {"target_roles": ["AI Engineer"]}, "", 0)
    check("US filtering happens before fuzzy dedup so the US copy survives",
          len(ordered) == 1 and ordered[0]["url"] == "https://us.example/role",
          ordered)

    n_pass, n = sum(results), len(results)
    print(f"\n=== {n_pass}/{n} search-quality checks passed ===")
    sys.exit(0 if n_pass == n else 1)


if __name__ == "__main__":
    main()
