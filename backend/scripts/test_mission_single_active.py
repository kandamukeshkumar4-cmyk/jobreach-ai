"""Offline checks for the one-active-mission contract.

Run:
    cd backend
    python -m scripts.test_mission_single_active
"""
import asyncio
import os


os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "service")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("NVIDIA_API_KEY", "dummy")

from fastapi import HTTPException

from app.api import missions
from app.models.schemas import MissionCreate


class Resp:
    def __init__(self, data=None):
        self.data = data


class FakeRedis:
    def __init__(self, allow_lock=True):
        self.allow_lock = allow_lock
        self.set_calls = []

    def set(self, key, value, nx=False, ex=None):
        self.set_calls.append((key, value, nx, ex))
        return self.allow_lock

    def delete(self, *_args):
        return 1


class FakeDB:
    def __init__(self, active_rows=None):
        self.active_rows = active_rows or []

    def table(self, name):
        return FakeTable(self, name)


class FakeTable:
    def __init__(self, db, name):
        self.db = db
        self.name = name
        self.selected = ""

    def select(self, value):
        self.selected = value
        return self

    def eq(self, *_args):
        return self

    def in_(self, *_args):
        return self

    def gte(self, *_args):
        return self

    def or_(self, *_args):
        return self

    def execute(self):
        if self.name == "profiles":
            return Resp([{"id": "profile-1"}])
        if self.name == "missions":
            return Resp(self.db.active_rows)
        return Resp([])


payload = MissionCreate(
    profile_id="profile-1",
    title="AI engineer",
    search_query="ai engineer",
    sources=["exa"],
)

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' - ' + str(detail)) if detail and not ok else ''}")


async def expect_conflict(db, redis_client):
    missions._sync_redis = lambda: redis_client
    try:
        await missions.create_mission(payload, db=db, user_id="user-1")
    except HTTPException as exc:
        return exc.status_code, exc.detail
    return 201, ""


status, detail = asyncio.run(expect_conflict(
    FakeDB(active_rows=[{"id": "active-1"}]),
    FakeRedis(allow_lock=True),
))
check("existing active mission returns 409",
      status == 409,
      {"status": status, "detail": detail})
check("existing active mission uses the user-facing one-at-a-time message",
      detail == missions.MISSION_ACTIVE_MESSAGE,
      detail)

redis_client = FakeRedis(allow_lock=False)
status, detail = asyncio.run(expect_conflict(FakeDB(active_rows=[]), redis_client))
check("atomic Redis lock conflict returns 409",
      status == 409,
      {"status": status, "detail": detail})
check("atomic Redis lock conflict uses the same banner message",
      detail == missions.MISSION_ACTIVE_MESSAGE,
      detail)
check("lock conflict uses SETNX with a TTL",
      redis_client.set_calls and redis_client.set_calls[0][2] is True and redis_client.set_calls[0][3] == 600,
      redis_client.set_calls)

passed = sum(1 for r in results if r)
failed = len(results) - passed
print(f"\n  mission single-active self-test: {passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
