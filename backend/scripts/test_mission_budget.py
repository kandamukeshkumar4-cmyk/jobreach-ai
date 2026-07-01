"""Offline checks for the mission 120-second budget contract.

No DB, Redis, or network. These tests pin the pure helpers that keep a mission
bounded when external source/LLM calls are slow.

Run:
    cd backend
    python -m scripts.test_mission_budget
"""
import os
import sys


# app.workers imports construct Celery settings at import time.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "service")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("NVIDIA_API_KEY", "dummy")

from app.workers.search import (
    LLM_SCORE_CAP,
    MISSION_TARGET_SECONDS,
    RESULT_CAP,
    _result_slots_for_budget,
    _score_slots_for_budget,
)
from app.workers.score import _fallback_score_job


results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + str(detail)) if detail and not ok else ''}")


check("mission target is a hard 120-second budget", MISSION_TARGET_SECONDS == 120, MISSION_TARGET_SECONDS)

check("slow LLM score slots fit the seeded 2-minute scoring budget",
      LLM_SCORE_CAP <= _score_slots_for_budget(remaining_seconds=95, per_job_seconds=12),
      {"LLM_SCORE_CAP": LLM_SCORE_CAP})

check("mission can still return a useful result set beyond slow LLM slots",
      RESULT_CAP >= 20,
      {"RESULT_CAP": RESULT_CAP})

check("critical 120-second mission path does not queue blocking LLM calls",
      LLM_SCORE_CAP == 0,
      {"LLM_SCORE_CAP": LLM_SCORE_CAP})

check("near-deadline missions queue at least one but not many slow LLM jobs",
      _score_slots_for_budget(remaining_seconds=20, per_job_seconds=12) == 1)

check("healthy fast-scoring budget allows the full result cap",
      _result_slots_for_budget(remaining_seconds=60, per_job_seconds=1) == RESULT_CAP)

check("tight fast-scoring budget shrinks result writes to protect completion",
      _result_slots_for_budget(remaining_seconds=12, per_job_seconds=1.5) == 2)

profile = {
    "target_roles": ["Applied AI Engineer", "DevOps"],
    "skills": ["Python", "LLM", "Kubernetes"],
}
job = {
    "title": "Senior Applied AI Engineer",
    "company": "Acme AI",
    "location": "Remote",
    "description_snippet": "Build Python LLM evaluation pipelines on Kubernetes for production AI systems.",
    "salary_min": 150000,
    "salary_max": 190000,
}
score = _fallback_score_job(job, profile, reason="deadline")

check("fallback scoring returns the normal match contract",
      set(score) >= {"dimensions", "overall_score", "grade", "why_fit", "why_gap"}
      and len(score["dimensions"]) == 6,
      score)
check("fallback scoring is strong for clear role and skill overlap",
      score["grade"] in ("A", "B") and score["overall_score"] >= 4.0,
      score)
check("fallback scoring is honest about why it was used",
      "deadline" in score["why_gap"].lower(),
      score.get("why_gap"))

passed = sum(1 for r in results if r)
failed = len(results) - passed
print(f"\n  mission budget self-test: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
