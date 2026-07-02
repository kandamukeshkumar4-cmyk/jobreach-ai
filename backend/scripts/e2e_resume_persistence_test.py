"""Authenticated E2E for resume persistence after refresh/login.

Creates disposable Supabase data, generates a resume synchronously through the
worker fallback path, and verifies the authenticated API can rediscover the
document and tracker row from durable storage.

Run with a local API already running:
    cd backend
    python -m uvicorn app.main:app --port 8011 --log-level warning
    API_BASE=http://localhost:8011/api/v1 python -m scripts.e2e_resume_persistence_test
"""
import json
import os
import sys
import uuid
from pathlib import Path

import requests


def load_dotenv():
    path = Path(__file__).resolve().parents[1] / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv()

URL = os.environ["SUPABASE_URL"].rstrip("/")
ANON = os.environ["SUPABASE_ANON_KEY"]
SVC = os.environ["SUPABASE_SERVICE_KEY"]
API = os.environ.get("API_BASE", "http://localhost:8011/api/v1").rstrip("/")

SVC_H = {"apikey": SVC, "Authorization": f"Bearer {SVC}", "Content-Type": "application/json"}
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + str(detail)) if detail and not ok else ''}")


def admin_create_user(email, pw):
    r = requests.post(
        f"{URL}/auth/v1/admin/users",
        headers=SVC_H,
        json={"email": email, "password": pw, "email_confirm": True},
        timeout=20,
    )
    return r.json().get("id")


def admin_delete_user(uid):
    requests.delete(f"{URL}/auth/v1/admin/users/{uid}", headers=SVC_H, timeout=20)


def token(email, pw):
    r = requests.post(
        f"{URL}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON, "Content-Type": "application/json"},
        json={"email": email, "password": pw},
        timeout=20,
    )
    return r.json().get("access_token")


def rest_insert(table, rows):
    r = requests.post(
        f"{URL}/rest/v1/{table}",
        headers={**SVC_H, "Prefer": "return=representation"},
        json=rows,
        timeout=20,
    )
    r.raise_for_status()
    return r.json()


def rest_delete(table, col, val):
    try:
        requests.delete(f"{URL}/rest/v1/{table}?{col}=eq.{val}", headers=SVC_H, timeout=20)
    except Exception:
        pass


def api(method, path, tok, body=None):
    headers = {"Authorization": f"Bearer {tok}"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    return requests.request(
        method,
        f"{API}{path}",
        headers=headers,
        data=json.dumps(body) if body is not None else None,
        timeout=30,
    )


class FailingCompletions:
    def create(self, **_kwargs):
        raise RuntimeError("forced offline fallback")


class FailingChat:
    completions = FailingCompletions()


class FailingOpenAI:
    chat = FailingChat()

    def __init__(self, **_kwargs):
        pass


def generate_sync(match_id):
    import app.workers.resume as resume_worker

    resume_worker.OpenAI = FailingOpenAI
    return resume_worker.generate_resume_task.run(match_id, False, "direct")


def main():
    user = profile = mission = match = job = None
    email = f"resume-e2e-{uuid.uuid4().hex[:8]}@jobreach-test.dev"
    password = "Passw0rd-" + uuid.uuid4().hex[:8]
    try:
        user = admin_create_user(email, password)
        tok = token(email, password)
        assert user and tok, "user/token setup failed"

        profile, mission, match, job = (str(uuid.uuid4()) for _ in range(4))
        rest_insert("profiles", [{
            "id": profile,
            "user_id": user,
            "full_name": "Resume E2E",
            "email": email,
            "resume_markdown": """
# Professional Experience
Example AI | Applied AI Engineer | 2022-Present
- Built Python LLM systems and FastAPI services.
- Operated Kubernetes and Redis-backed workflows.
""",
            "skills": ["Python", "LLM", "FastAPI", "Kubernetes", "Redis"],
        }])
        rest_insert("jobs", [{
            "id": job,
            "title": "Senior Applied AI Engineer",
            "company": "PersistenceCo",
            "url": f"https://example.com/jobs/{job}",
            "source": "e2e",
            "description_snippet": "Python LLM systems, FastAPI, Kubernetes, Redis.",
        }])
        rest_insert("missions", [{
            "id": mission,
            "user_id": user,
            "profile_id": profile,
            "title": "resume-persistence-e2e",
            "search_query": "ai engineer",
            "status": "completed",
            "total_matches": 1,
        }])
        rest_insert("matches", [{
            "id": match,
            "mission_id": mission,
            "job_id": job,
            "overall_score": 4.6,
            "grade": "A",
            "dimensions": [],
            "why_fit": "Strong backend AI match",
        }])

        before_tracker = api("GET", "/tracker/", tok).json()
        check("starts with no tracked applications", before_tracker == [], before_tracker)

        generated = generate_sync(match)
        resume_id = generated.get("resume_id")
        check("worker generated a resume id", bool(resume_id), generated)
        check("worker returned relative download URL",
              str(generated.get("pdf_url", "")).startswith("/api/v1/resumes/"),
              generated)

        docs_res = api("GET", "/resumes/", tok)
        docs = docs_res.json() if docs_res.ok else []
        check("GET /resumes/ returns generated document", docs_res.status_code == 200 and len(docs) == 1, docs_res.text[:300])
        check("document has job metadata", docs and docs[0]["job_title"] == "Senior Applied AI Engineer", docs)

        match_res = api("GET", f"/resumes/match/{match}", tok)
        match_docs = match_res.json() if match_res.ok else []
        check("GET /resumes/match returns generated document",
              match_res.status_code == 200 and len(match_docs) == 1,
              match_res.text[:300])

        tracker_res = api("GET", "/tracker/", tok)
        apps = tracker_res.json() if tracker_res.ok else []
        check("tracker now has one durable application",
              tracker_res.status_code == 200 and len(apps) == 1,
              tracker_res.text[:300])
        check("tracker application carries resume URL",
              apps and apps[0].get("resume_pdf_url") == generated.get("pdf_url"),
              apps)

        duplicate_track = api("POST", "/tracker/", tok, {"match_id": match})
        apps_after = api("GET", "/tracker/", tok).json()
        check("manual Track is idempotent after resume auto-track",
              duplicate_track.status_code == 200 and len(apps_after) == 1,
              {"status": duplicate_track.status_code, "apps": apps_after})

        dl = api("GET", f"/resumes/{resume_id}/download", tok)
        check("download returns a DOCX",
              dl.status_code == 200 and dl.content.startswith(b"PK"),
              f"status={dl.status_code} len={len(dl.content)}")
    finally:
        if match:
            rest_delete("applications", "match_id", match)
            rest_delete("resumes", "match_id", match)
            rest_delete("matches", "id", match)
        if mission:
            rest_delete("missions", "id", mission)
        if profile:
            rest_delete("profiles", "id", profile)
        if job:
            rest_delete("jobs", "id", job)
        if user:
            admin_delete_user(user)

    n_pass, n = sum(results), len(results)
    print(f"\n=== {n_pass}/{n} checks passed ===")
    sys.exit(0 if n_pass == n else 1)


if __name__ == "__main__":
    main()
