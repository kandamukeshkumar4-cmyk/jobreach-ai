"""Offline regression checks for resume → tracker persistence.

Run:
    cd backend
    python -m scripts.test_resume_persistence
"""
import os
import uuid


os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "service")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("NVIDIA_API_KEY", "dummy")

from app.workers.resume import _sync_application_resume_links


class Result:
    def __init__(self, data):
        self.data = data


class FakeTable:
    def __init__(self, db, name):
        self.db = db
        self.name = name
        self.filters = []
        self.payload = None
        self.mode = "select"

    def select(self, *_args):
        self.mode = "select"
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def update(self, payload):
        self.mode = "update"
        self.payload = payload
        return self

    def insert(self, payload):
        self.mode = "insert"
        self.payload = payload
        return self

    def execute(self):
        rows = self.db.rows.setdefault(self.name, [])
        if self.mode == "insert":
            row = {"id": str(uuid.uuid4()), **self.payload}
            rows.append(row)
            return Result([row])

        selected = [
            row for row in rows
            if all(row.get(key) == value for key, value in self.filters)
        ]
        if self.mode == "update":
            for row in selected:
                row.update(self.payload)
            return Result(selected)
        return Result(selected)


class FakeDb:
    def __init__(self):
        self.rows = {"applications": []}

    def table(self, name):
        return FakeTable(self, name)


def check(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + str(detail)) if detail and not ok else ''}")
    results.append(ok)


def match(user_id="user-a"):
    return {
        "id": "match-a",
        "overall_score": 4.7,
        "grade": "A",
        "jobs": {"title": "AI Engineer", "company": "ExampleCo"},
        "missions": {
            "user_id": user_id,
            "profiles": {"user_id": "legacy-owner"},
        },
    }


results = []

db = FakeDb()
_sync_application_resume_links(db, match(), "match-a", "/api/v1/resumes/r/download", None)
check("creates tracker row when user tailored before tracking", len(db.rows["applications"]) == 1)
created = db.rows["applications"][0]
check("created row is owned by mission user", created["user_id"] == "user-a", created)
check("created row stores resume URL", created["resume_pdf_url"] == "/api/v1/resumes/r/download", created)
check("created row copies match job metadata", created["job_title"] == "AI Engineer" and created["company"] == "ExampleCo", created)

_sync_application_resume_links(db, match(), "match-a", "/api/v1/resumes/r2/download", "/api/v1/resumes/r2/cover-letter/download")
check("regeneration updates existing tracker row instead of duplicating", len(db.rows["applications"]) == 1, db.rows["applications"])
updated = db.rows["applications"][0]
check("existing row receives latest document URLs",
      updated["resume_pdf_url"].endswith("/r2/download") and updated["cover_letter_pdf_url"].endswith("/r2/cover-letter/download"),
      updated)

legacy_db = FakeDb()
legacy_match = match(user_id=None)
_sync_application_resume_links(legacy_db, legacy_match, "match-a", "/api/v1/resumes/r/download", None)
check("legacy mission falls back to profile owner", legacy_db.rows["applications"][0]["user_id"] == "legacy-owner")

missing_user_db = FakeDb()
missing_user_match = {"jobs": {"title": "AI Engineer", "company": "ExampleCo"}, "missions": {"profiles": {}}}
_sync_application_resume_links(missing_user_db, missing_user_match, "match-a", "/api/v1/resumes/r/download", None)
check("missing owner skips tracker write safely", missing_user_db.rows["applications"] == [])

passed = sum(1 for r in results if r)
failed = len(results) - passed
print(f"\n  resume persistence self-test: {passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
