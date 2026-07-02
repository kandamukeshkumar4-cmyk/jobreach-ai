"""Offline proof for US-market gating, resume-driven queries, and job dedup.

Run from backend/:  python -m scripts.test_search_quality   (no env needed)
Exits non-zero on failure; prints PASS/FAIL per check.
"""
import sys
from app.workers.search import _is_us_eligible, _resume_driven_queries, _dedupe_jobs

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

    n_pass, n = sum(results), len(results)
    print(f"\n=== {n_pass}/{n} search-quality checks passed ===")
    sys.exit(0 if n_pass == n else 1)


if __name__ == "__main__":
    main()
