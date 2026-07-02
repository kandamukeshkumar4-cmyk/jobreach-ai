"""Offline PASS/FAIL assertions for the deterministic answers-match fallback.

Run from backend/:  python scripts/test_answers_match.py
No network, no DB — imports the pure scoring functions from the router module.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test")
os.environ.setdefault("NVIDIA_API_KEY", "test")

from app.api.answers import _token_overlap_score, _fallback_matches  # noqa: E402

RESULTS = []


def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    RESULTS.append(status == "PASS")
    print(f"[{status}] {name}" + (f" — {detail}" if detail and status == "FAIL" else ""))


# 1. Identical questions score 100
check("identical questions score 100",
      _token_overlap_score("why do you want this job", "why do you want this job") == 100)

# 2. Completely disjoint questions score 0
check("disjoint questions score 0",
      _token_overlap_score("salary expectations", "describe your biggest weakness") == 0)

# 3. Case-insensitive: casing does not change the score
check("case insensitive",
      _token_overlap_score("Why THIS Company", "why this company") == 100)

# 4. Partial overlap gives a score strictly between 0 and 100
partial = _token_overlap_score("why do you want to work here", "why do you want this job")
check("partial overlap in (0, 100)", 0 < partial < 100, f"got {partial}")

# 5. Both empty strings score 0 (no crash on empty union)
check("empty inputs score 0", _token_overlap_score("", "") == 0)

# 6. Known Jaccard value: {a,b} vs {b,c} → 1/3 → 33
check("known jaccard 1/3 rounds to 33", _token_overlap_score("a b", "b c") == 33)

# 7. _fallback_matches ranks best-first
rows = [
    {"id": "1", "question": "describe a conflict with a coworker", "answer": "A1"},
    {"id": "2", "question": "why do you want to work at this company", "answer": "A2"},
    {"id": "3", "question": "why do you want this job", "answer": "A3"},
]
matches = _fallback_matches("why do you want this job", rows)
check("fallback ranks exact match first",
      matches and matches[0]["id"] == "3" and matches[0]["score"] == 100)
check("fallback scores are non-increasing",
      all(matches[i]["score"] >= matches[i + 1]["score"] for i in range(len(matches) - 1)))

# 8. _fallback_matches caps at top 5
many = [{"id": str(i), "question": f"question number {i}", "answer": ""} for i in range(10)]
check("fallback caps at 5", len(_fallback_matches("question number 1", many)) == 5)

# 9. Match shape: id, question, answer, score keys present
check("match shape has required keys",
      matches and set(matches[0].keys()) == {"id", "question", "answer", "score"})

passed = sum(RESULTS)
total = len(RESULTS)
print(f"\n{passed}/{total} checks passed")
sys.exit(0 if passed == total else 1)
