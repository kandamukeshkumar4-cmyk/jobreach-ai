"""Offline checks for the 30-second resume generation contract.

No DB, Redis, or network. These tests pin the local fallback used when the LLM
is slow or unavailable.

Run:
    cd backend
    python -m scripts.test_resume_fast_path
"""
import os


os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "service")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("NVIDIA_API_KEY", "dummy")

from app.workers.resume import (
    RESUME_TASK_SOFT_LIMIT_SECONDS,
    RESUME_TASK_TIME_LIMIT_SECONDS,
    _fallback_tailoring,
    _build_docx,
)


results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + str(detail)) if detail and not ok else ''}")


profile = {
    "full_name": "Candidate",
    "skills": ["Python", "LLM", "Kubernetes", "FastAPI", "React"],
    "resume_markdown": """
# Professional Experience
Acme AI | Applied AI Engineer | 2022-Present
- Built Python and LLM evaluation systems for production teams.
- Operated Kubernetes services and FastAPI APIs.

# Projects
JobReach | AI job search automation
- React, FastAPI, Redis, and Celery workflow automation.
""",
}
job = {
    "title": "Senior Applied AI Engineer",
    "company": "Example AI",
    "description_snippet": "Python LLM systems, Kubernetes, FastAPI, React, Redis.",
}

tailored = _fallback_tailoring(profile, job, profile["resume_markdown"])

check("resume task hard limit stays within the 30-second UX promise",
      RESUME_TASK_TIME_LIMIT_SECONDS <= 30,
      RESUME_TASK_TIME_LIMIT_SECONDS)
check("resume task soft limit leaves time to persist fallback output",
      RESUME_TASK_SOFT_LIMIT_SECONDS <= 25,
      RESUME_TASK_SOFT_LIMIT_SECONDS)
check("fallback produces the normal tailoring contract",
      set(tailored) >= {"headline", "summary_bullets", "skills", "keywords_injected"},
      tailored)
check("fallback resume text does not expose internal AI/model failure",
      "ai model" not in " ".join(tailored["summary_bullets"]).lower(),
      tailored["summary_bullets"])
check("fallback injects job/resume overlap keywords",
      {"python", "llm", "kubernetes"} <= {k.lower() for k in tailored["keywords_injected"]},
      tailored["keywords_injected"])

docx = _build_docx(
    tailored,
    profile["full_name"],
    profile,
    {"experience": [], "projects": [], "education": "", "certifications": []},
)
check("fallback can build a downloadable DOCX",
      docx.startswith(b"PK") and len(docx) > 1000,
      len(docx))

passed = sum(1 for r in results if r)
failed = len(results) - passed
print(f"\n  resume fast-path self-test: {passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
