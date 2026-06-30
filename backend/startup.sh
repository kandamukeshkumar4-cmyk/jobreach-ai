#!/bin/bash
set -e

cd /home/site/wwwroot

# Celery worker, supervised. Three reliability fixes vs the old fire-and-forget:
#  - concurrency 2 (was 6): 6 LLM-scoring children OOM the B2 instance, which
#    silently killed the worker while gunicorn stayed up (missions stuck pending).
#  - --max-memory-per-child / --max-tasks-per-child: recycle a child before it
#    leaks/OOMs, so a heavy mission can't take the whole worker down.
#  - auto-restart loop: if the worker dies anyway, it comes back instead of
#    staying dead until the next deploy.
echo "[startup] Starting supervised Celery worker..."
(
  set +e
  while true; do
    celery -A app.workers.celery_app worker \
      --loglevel=info \
      -Q search,score,research,resume \
      -c 2 \
      --max-tasks-per-child=8 \
      --max-memory-per-child=400000 \
      -n worker@jobreach
    echo "[startup] Celery worker exited ($?). Restarting in 3s..."
    sleep 3
  done
) &

echo "[startup] Starting API with gunicorn..."
exec gunicorn -w 1 -k uvicorn.workers.UvicornWorker --timeout 120 --bind 0.0.0.0:8000 app.main:app
