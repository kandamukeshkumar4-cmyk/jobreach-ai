from celery import Celery
from app.config import get_settings

s = get_settings()


def _redis_url_with_ssl(url: str) -> str:
    """Upstash (and other managed Redis) use rediss:// TLS. Celery's broker/backend
    require an explicit ssl_cert_reqs param on rediss:// URLs or it raises
    'rediss:// URL must have parameter ssl_cert_reqs'."""
    if url and url.startswith("rediss://") and "ssl_cert_reqs" not in url:
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}ssl_cert_reqs=none"
    return url


_redis_url = _redis_url_with_ssl(s.redis_url)

_sync_redis_client = None


def get_sync_redis():
    """Shared synchronous Redis client (thread-safe, connection-pooled).

    Single construction point for every sync consumer (API routers, workers) —
    per-request `from_url()` calls each open a fresh TCP+TLS handshake against
    managed Redis and leak pool connections."""
    global _sync_redis_client
    if _sync_redis_client is None:
        import redis
        _sync_redis_client = redis.from_url(_redis_url, decode_responses=True)
    return _sync_redis_client

celery_app = Celery(
    "jobreach",
    broker=_redis_url,
    backend=_redis_url,
    include=[
        "app.workers.search",
        "app.workers.score",
        "app.workers.research",
        "app.workers.resume",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # --- Redis request-rate control (Upstash bills EVERY command) ---
    # We previously ran 4 separate queues (search/score/research/resume); the
    # worker BRPOP-polls each one continuously, so idle polling scaled ~4x and
    # burned the 500K/mo Upstash cap in days. Everything now shares ONE default
    # queue → the worker polls a single key. See supervisord.conf (no -Q) and
    # the per-task decorators (queue= removed).
    task_default_queue="celery",
    # Fire-and-forget tasks (run_mission/score/research) don't need their result
    # stored — only generate_resume_task reads it back (resumes.py AsyncResult),
    # which re-enables results locally via ignore_result=False. This cuts a
    # result-backend write+read per task.
    task_ignore_result=True,
    result_expires=1800,
    # Poll the broker less aggressively; avoid tight visibility re-check loops.
    broker_transport_options={"polling_interval": 2.0, "visibility_timeout": 3600},
    broker_connection_retry_on_startup=True,
)
