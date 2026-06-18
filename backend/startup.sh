#!/bin/bash
set -e

echo "[startup] Starting Celery worker in background..."
celery -A app.workers.celery_app worker \
    --loglevel=info \
    -Q search,score,research,resume \
    -c 2 \
    -n worker@jobreach &
CELERY_PID=$!
echo "[startup] Celery started (PID $CELERY_PID)"

echo "[startup] Starting API with gunicorn..."
gunicorn -w 1 -k uvicorn.workers.UvicornWorker --timeout 120 --bind 0.0.0.0:8000 app.main:app
