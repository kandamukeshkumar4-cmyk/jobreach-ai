from supabase import create_client, Client
from app.config import get_settings
from functools import lru_cache


@lru_cache()
def get_supabase() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_key)


def get_db() -> Client:
    return get_supabase()


def new_db() -> Client:
    """A FRESH, uncached Supabase client.

    The lru_cache'd get_db() singleton is NOT safe to share across the worker's
    threads pool: supabase-py wraps a single postgrest/httpx client whose request
    state collides when ~12 score threads (+ their heartbeat threads) call
    .execute() at once — the cause of the serialized/erroring scoring we saw.
    Each worker thread (and each _pub call) gets its own client instead."""
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_key)
