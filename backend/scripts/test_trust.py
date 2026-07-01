"""Offline assertion suite for the trust/repost heuristics (app.services.trust).

No env, no DB, no network — pure-function checks of the career-ops-ported
rules in score_trust plus the title-similarity helper used by detect_repost.

Run:
    cd backend
    python -m scripts.test_trust

Exits 0 iff every check passes; prints PASS/FAIL per check.
"""
import sys

from app.services.trust import score_trust, title_similarity, titles_match

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + str(detail)) if detail and not ok else ''}")


GOOD_DESC = (
    "We are hiring a backend engineer to build and scale our payments platform. "
    "You will design APIs, own services end to end, mentor teammates, and work "
    "closely with product to ship reliable infrastructure at meaningful scale."
)

# 1. Clean posting: ATS-hosted URL, rich description, salary → 100 / high / no flags.
clean = score_trust({
    "url": "https://boards.greenhouse.io/acme/jobs/123",
    "company": "Acme", "description_snippet": GOOD_DESC,
    "salary_min": 120000, "salary_max": 150000,
})
check("clean job scores 100/high with no flags",
      clean == {"score": 100, "level": "high", "flags": []}, clean)

# 2. Missing apply URL → 'No direct apply link', -40 → 60 / medium.
missing = score_trust({
    "url": "", "company": "Acme", "description_snippet": GOOD_DESC,
    "salary_min": 100000, "salary_max": 130000,
})
check("missing URL flags 'No direct apply link' at 60/medium",
      missing["score"] == 60 and missing["level"] == "medium"
      and missing["flags"] == ["No direct apply link"], missing)

# 3. Malformed / non-http URL → 'Invalid apply URL', -50 → 50 / low.
invalid = score_trust({
    "url": "ftp://acme.example/jobs", "company": "Acme",
    "description_snippet": GOOD_DESC, "salary_min": 100000, "salary_max": 130000,
})
check("non-http URL flags 'Invalid apply URL' at 50/low",
      invalid["score"] == 50 and invalid["level"] == "low"
      and invalid["flags"] == ["Invalid apply URL"], invalid)

# 4. URL shortener → 'Suspicious domain' (subdomain of bit.ly also matches).
shortener = score_trust({
    "url": "https://abc.bit.ly/xyz", "company": "Bit",
    "description_snippet": GOOD_DESC, "salary_min": 100000, "salary_max": 130000,
})
check("shortener domain flags 'Suspicious domain'",
      "Suspicious domain" in shortener["flags"], shortener)

# 5. Company/domain mismatch on a non-ATS host.
mismatch = score_trust({
    "url": "https://totally-random-site.io/jobs/1", "company": "Acme Corp",
    "description_snippet": GOOD_DESC, "salary_min": 100000, "salary_max": 130000,
})
check("non-ATS host with unrelated company flags 'Company/domain mismatch'",
      mismatch["flags"] == ["Company/domain mismatch"] and mismatch["score"] == 85, mismatch)

# 6. Company name present in hostname → no mismatch flag.
owned = score_trust({
    "url": "https://jobs.acme.com/openings/42", "company": "Acme",
    "description_snippet": GOOD_DESC, "salary_min": 100000, "salary_max": 130000,
})
check("company-owned hostname does not flag a mismatch",
      "Company/domain mismatch" not in owned["flags"], owned)

# 7. ATS allowlist skips the mismatch check even when names share nothing.
ats = score_trust({
    "url": "https://xyzzy.recruitee.com/o/eng", "company": "Completely Different Name",
    "description_snippet": GOOD_DESC, "salary_min": 100000, "salary_max": 130000,
})
check("ATS-hosted URL skips the company/domain mismatch check",
      "Company/domain mismatch" not in ats["flags"], ats)

# 8. Thin description → 'Vague description'.
vague = score_trust({
    "url": "https://boards.greenhouse.io/acme/jobs/9", "company": "Acme",
    "description_snippet": "Great job. Apply now!",
    "salary_min": 100000, "salary_max": 130000,
})
check("thin description flags 'Vague description'",
      vague["flags"] == ["Vague description"] and vague["score"] == 90, vague)

# 9. No salary bounds → 'No salary disclosed' (US transparency signal, -5 only).
nosalary = score_trust({
    "url": "https://boards.greenhouse.io/acme/jobs/7", "company": "Acme",
    "description_snippet": GOOD_DESC, "salary_min": None, "salary_max": None,
})
check("missing salary flags 'No salary disclosed' but stays high",
      nosalary["flags"] == ["No salary disclosed"]
      and nosalary["score"] == 95 and nosalary["level"] == "high", nosalary)

# 10. Empty job dict never raises; stacked penalties clamp into the contract.
empty = score_trust({})
check("empty job returns a valid low-trust contract",
      isinstance(empty["score"], int) and 0 <= empty["score"] <= 100
      and empty["level"] == "low"
      and set(empty["flags"]) == {"No direct apply link", "Vague description",
                                  "No salary disclosed"}, empty)

# 11. Same opening, cosmetic title differences → repost-similar.
check("'Senior Backend Engineer' ~ 'Backend Engineer (Senior)' matches",
      titles_match("Senior Backend Engineer", "Backend Engineer (Senior)"),
      title_similarity("Senior Backend Engineer", "Backend Engineer (Senior)"))

# 12. Unrelated roles at the same company must NOT match.
check("'Product Manager' vs 'Site Reliability Engineer' does not match",
      not titles_match("Product Manager", "Site Reliability Engineer"),
      title_similarity("Product Manager", "Site Reliability Engineer"))

# 13. Sibling roles sharing a generic prefix stay separate (career-ops rule).
check("sibling 'Full Stack Engineer, Foundation/Guarded Releases' stay separate",
      not titles_match("Full Stack Engineer, Foundation",
                       "Full Stack Engineer, Guarded Releases"),
      title_similarity("Full Stack Engineer, Foundation",
                       "Full Stack Engineer, Guarded Releases"))

# 14. Identical titles are a perfect match; empty titles never match.
check("identical titles similarity is 1.0",
      title_similarity("Staff Software Engineer", "Staff Software Engineer") == 1.0)
check("empty titles never match", not titles_match("", "Backend Engineer"))

passed = sum(1 for r in results if r)
failed = len(results) - passed
print(f"\n  trust self-test: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
