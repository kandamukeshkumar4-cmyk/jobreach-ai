"""Repeatable adversarial security E2E for the JobReach API.

Proves the auth/ownership invariants end-to-end against a RUNNING local API,
using two real Supabase users (created + cleaned up by this script). Secrets are
read from the environment — nothing is hardcoded.

Prereqs (one terminal):
    cd backend
    # .env must have real supabase_url/anon/service + redis_url (+ dummy nvidia)
    python -m uvicorn app.main:app --port 8011 --log-level warning

Then (another terminal):
    cd backend
    SUPABASE_URL=...  SUPABASE_ANON_KEY=...  SUPABASE_SERVICE_KEY=...  \
    REDIS_URL=...  API_BASE=http://localhost:8011/api/v1  \
    python -m scripts.e2e_security_test

Exits 0 iff every check passes; prints PASS/FAIL per check.
"""
import json
import os
import sys
import uuid
import concurrent.futures as cf
import requests

URL = os.environ["SUPABASE_URL"].rstrip("/")
ANON = os.environ["SUPABASE_ANON_KEY"]
SVC = os.environ["SUPABASE_SERVICE_KEY"]
API = os.environ.get("API_BASE", "http://localhost:8011/api/v1").rstrip("/")
REDIS_URL = os.environ.get("REDIS_URL", "").strip()
if not REDIS_URL:
    sys.exit(
        "FATAL: REDIS_URL is required. The mission-lock stale-lock "
        "compare-and-delete assertion is NOT optional; set REDIS_URL to the "
        "same Redis the API/Celery uses and re-run."
    )

SVC_H = {"apikey": SVC, "Authorization": f"Bearer {SVC}", "Content-Type": "application/json"}
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + detail) if detail and not ok else ''}")


def admin_create_user(email, pw):
    r = requests.post(f"{URL}/auth/v1/admin/users", headers=SVC_H,
                      json={"email": email, "password": pw, "email_confirm": True}, timeout=20)
    return r.json().get("id")


def admin_delete_user(uid):
    requests.delete(f"{URL}/auth/v1/admin/users/{uid}", headers=SVC_H, timeout=20)


def token(email, pw):
    r = requests.post(f"{URL}/auth/v1/token?grant_type=password",
                      headers={"apikey": ANON, "Content-Type": "application/json"},
                      json={"email": email, "password": pw}, timeout=20)
    return r.json().get("access_token")


def rest_insert(table, rows):
    requests.post(f"{URL}/rest/v1/{table}", headers={**SVC_H, "Prefer": "resolution=merge-duplicates"},
                  json=rows, timeout=20).raise_for_status()


def rest_delete(table, col, val):
    try:
        requests.delete(f"{URL}/rest/v1/{table}?{col}=eq.{val}", headers=SVC_H, timeout=20)
    except Exception:
        pass


def rest_delete_missions_by_title(title):
    """Delete missions (and their events) created by a test, by title."""
    try:
        rows = requests.get(f"{URL}/rest/v1/missions?title=eq.{title}&select=id",
                            headers=SVC_H, timeout=20).json()
        for m in rows:
            rest_delete("mission_events", "mission_id", m["id"])
            rest_delete("missions", "id", m["id"])
    except Exception:
        pass


def code(method, path, tok=None, body=None):
    h = {"Authorization": f"Bearer {tok}"} if tok else {}
    if body is not None:
        h["Content-Type"] = "application/json"
    return requests.request(method, f"{API}{path}", headers=h,
                            data=json.dumps(body) if body is not None else None, timeout=20).status_code


def main():
    ua = ub = pa = pb = ma = mb = matcha = matchb = resa = job = leg = legprof = None
    pwA, pwB = "Passw0rd-A-" + uuid.uuid4().hex[:6], "Passw0rd-B-" + uuid.uuid4().hex[:6]
    ea, eb = f"e2e-a-{uuid.uuid4().hex[:6]}@jobreach-test.dev", f"e2e-b-{uuid.uuid4().hex[:6]}@jobreach-test.dev"
    try:
        ua, ub = admin_create_user(ea, pwA), admin_create_user(eb, pwB)
        ta, tb = token(ea, pwA), token(eb, pwB)
        assert ua and ub and ta and tb, "user/token setup failed"

        pa, pb = str(uuid.uuid4()), str(uuid.uuid4())
        ma, mb = str(uuid.uuid4()), str(uuid.uuid4())
        matcha, matchb = str(uuid.uuid4()), str(uuid.uuid4())
        resa, job, leg, legprof = (str(uuid.uuid4()) for _ in range(4))
        rest_insert("profiles", [
            {"id": pa, "user_id": ua, "full_name": "A", "email": ea},
            {"id": pb, "user_id": ub, "full_name": "B", "email": eb},
            {"id": legprof, "user_id": ua, "full_name": "A-legacy", "email": f"leg-{ea}"},
        ])
        rest_insert("jobs", [{"id": job, "title": "AI Eng", "company": "TestCo",
                              "url": f"https://example.com/{job}", "source": "exa"}])
        rest_insert("missions", [
            {"id": ma, "user_id": ua, "profile_id": pa, "title": "A", "search_query": "ai", "status": "completed"},
            {"id": mb, "user_id": ub, "profile_id": pb, "title": "B", "search_query": "ai", "status": "completed"},
            # legacy: NULL user_id but profile owned by A, currently running
            {"id": leg, "user_id": None, "profile_id": legprof, "title": "legacy", "search_query": "ai", "status": "running"},
        ])
        rest_insert("matches", [
            {"id": matcha, "mission_id": ma, "job_id": job, "overall_score": 4.5, "grade": "A", "dimensions": [], "why_fit": "x"},
            {"id": matchb, "mission_id": mb, "job_id": job, "overall_score": 4.2, "grade": "B", "dimensions": [], "why_fit": "x"},
        ])
        rest_insert("resumes", [{"id": resa, "match_id": matcha, "pdf_url": "data:text/plain;base64,SGk="}])

        print("== own resources (A) -> 200 ==")
        check("GET own mission", code("GET", f"/missions/{ma}", ta) == 200)
        check("GET own matches", code("GET", f"/jobs/matches/{ma}", ta) == 200)
        check("GET own match detail", code("GET", f"/jobs/matches/detail/{matcha}", ta) == 200)
        check("GET own profile", code("GET", f"/profile/{pa}", ta) == 200)
        check("GET own resumes", code("GET", f"/resumes/match/{matcha}", ta) == 200)
        check("GET own resume download", code("GET", f"/resumes/{resa}/download", ta) == 200)
        check("GET tracker", code("GET", "/tracker/", ta) == 200)

        print("== cross-user (A->B) -> 404, no leak ==")
        check("GET other's mission", code("GET", f"/missions/{mb}", ta) == 404)
        check("GET other's events", code("GET", f"/missions/{mb}/events", ta) == 404)
        check("GET other's matches", code("GET", f"/jobs/matches/{mb}", ta) == 404)
        check("GET other's match detail", code("GET", f"/jobs/matches/detail/{matchb}", ta) == 404)
        check("GET other's profile", code("GET", f"/profile/{pb}", ta) == 404)
        check("GET other's resume download", code("GET", f"/resumes/{resa}/download", tb) == 404)

        print("== no / fake token -> 401 ==")
        check("no token", code("GET", "/missions/") == 401)
        check("fake token", code("GET", "/missions/", "fake.jwt.value") == 401)

        print("== resume task status cross-user ==")
        r = requests.post(f"{API}/resumes/generate", headers={"Authorization": f"Bearer {ta}", "Content-Type": "application/json"},
                          data=json.dumps({"match_id": matcha}), timeout=20)
        task_id = r.json().get("task_id") if r.status_code == 202 else None
        check("generate returns task (A owns match)", bool(task_id), f"status={r.status_code}")
        if task_id:
            check("status A (owner) 200", code("GET", f"/resumes/status/{task_id}", ta) == 200)
            check("status B (other) 404", code("GET", f"/resumes/status/{task_id}", tb) == 404)
            check("status no token 401", code("GET", f"/resumes/status/{task_id}") == 401)

        print("== legacy NULL user_id mission (profile owned by A) blocks new ==")
        # A already has a 'running' legacy mission via owned profile -> must 409.
        c = code("POST", "/missions/", ta, {"profile_id": pa, "search_query": "ai", "title": "blocked-by-legacy"})
        check("legacy running mission blocks new create (409)", c == 409, f"got {c}")
        rest_delete("missions", "title", "blocked-by-legacy")

        print("== atomic concurrency: parallel creates -> exactly one 201 ==")
        # mark legacy completed first so it doesn't block; then race.
        requests.patch(f"{URL}/rest/v1/missions?id=eq.{leg}", headers=SVC_H, json={"status": "completed"}, timeout=20)
        body = {"profile_id": pa, "search_query": "ai", "title": "cc-test"}
        with cf.ThreadPoolExecutor(max_workers=5) as ex:
            codes = list(ex.map(lambda _: code("POST", "/missions/", ta, body), range(5)))
        check("exactly one 201", codes.count(201) == 1, f"codes={sorted(codes)}")
        check("the rest 409", codes.count(409) == len(codes) - 1, f"codes={sorted(codes)}")
        rest_delete_missions_by_title("cc-test")

        print("== stale lock cannot release a newer mission's lock (Lua compare-and-delete) ==")
        # REQUIRED assertion (REDIS_URL is validated at startup, never skipped).
        from app.workers.celery_app import _redis_url_with_ssl
        from app.security import mission_lock_key, release_mission_lock
        import redis as _r
        rds = _r.from_url(_redis_url_with_ssl(REDIS_URL), decode_responses=True)
        k = mission_lock_key("e2e-lock-" + uuid.uuid4().hex[:6])
        rds.set(k, "missionB", ex=60)
        # user (key) field is embedded in k; call release with the user part:
        user_part = k.split("mission_active:")[-1]
        release_mission_lock(rds, user_part, "missionA")  # A tries to release B's lock
        still_b = rds.get(k) == "missionB"
        check("A's release left B's lock intact", still_b)
        release_mission_lock(rds, user_part, "missionB")  # B releases its own
        check("B's own release deletes the lock", rds.get(k) is None)
    finally:
        rest_delete_missions_by_title("blocked-by-legacy")
        rest_delete_missions_by_title("cc-test")
        if resa: rest_delete("resumes", "id", resa)
        for mid in (matcha, matchb):
            if mid: rest_delete("matches", "id", mid)
        for mid in (ma, mb, leg):
            if mid: rest_delete("missions", "id", mid)
        for pid in (pa, pb, legprof):
            if pid: rest_delete("profiles", "id", pid)
        if job: rest_delete("jobs", "id", job)
        for u in (ua, ub):
            if u: admin_delete_user(u)

    n_pass, n = sum(results), len(results)
    print(f"\n=== {n_pass}/{n} checks passed ===")
    sys.exit(0 if n_pass == n else 1)


if __name__ == "__main__":
    main()
