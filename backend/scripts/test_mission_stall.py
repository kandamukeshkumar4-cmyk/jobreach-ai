"""Offline checks for stale mission self-healing.

Run:
    cd backend
    python -m scripts.test_mission_stall
"""
import os
from datetime import datetime, timedelta, timezone


os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "service")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("NVIDIA_API_KEY", "dummy")

from app.api import missions


class Resp:
    def __init__(self, data=None):
        self.data = data


class FakeRedis:
    def __init__(self):
        self.eval_calls = []

    def eval(self, *args):
        self.eval_calls.append(args)
        return 1


class FakeDB:
    def __init__(self, match_rows=None, newest=None):
        self.match_rows = match_rows or []
        self.newest = newest or {}
        self.updates = []
        self.events = []

    def table(self, name):
        return FakeTable(self, name)


class FakeTable:
    def __init__(self, db, name):
        self.db = db
        self.name = name
        self.selected = ""
        self.update_payload = None
        self.insert_payload = None

    def select(self, value):
        self.selected = value
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def insert(self, payload):
        self.insert_payload = payload
        return self

    def eq(self, *_args):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def execute(self):
        if self.update_payload is not None:
            self.db.updates.append((self.name, self.update_payload))
            return Resp([self.update_payload])
        if self.insert_payload is not None:
            if self.name == "mission_events":
                self.db.events.append(self.insert_payload)
            return Resp([self.insert_payload])
        if self.name in ("mission_events", "matches") and self.selected == "created_at":
            ts = self.db.newest.get(self.name)
            return Resp([{"created_at": ts}] if ts else [])
        if self.name == "matches":
            return Resp(self.db.match_rows)
        return Resp([])


results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + str(detail)) if detail and not ok else ''}")


fake_redis = FakeRedis()
missions._sync_redis = lambda: fake_redis

created_at = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
mission = {
    "id": "mission-stale",
    "user_id": "user-1",
    "status": "running",
    "created_at": created_at,
    "total_matches": 0,
}

db = FakeDB()
reconciled = missions._reconcile_if_stalled(db, mission)

check("10-minute silent running mission is failed, not left running",
      reconciled.get("status") == "failed",
      reconciled)
check("read-side finalize records an error event",
      any(e.get("event_type") == "error" for e in db.events),
      db.events)
check("read-side finalize releases the per-user mission lock",
      bool(fake_redis.eval_calls),
      fake_redis.eval_calls)

old_list = [dict(mission, id="mission-a"), dict(mission, id="mission-b")]
db2 = FakeDB()
reconciled_list = missions._reconcile_mission_list(db2, old_list)
check("mission list endpoint can reconcile every returned stale row",
      [m.get("status") for m in reconciled_list] == ["failed", "failed"],
      reconciled_list)

passed = sum(1 for r in results if r)
failed = len(results) - passed
print(f"\n  mission stall self-test: {passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
