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
    task_routes={
        "app.workers.search.*": {"queue": "search"},
        "app.workers.score.*": {"queue": "score"},
        "app.workers.research.*": {"queue": "research"},
        "app.workers.resume.*": {"queue": "resume"},
    },
)
