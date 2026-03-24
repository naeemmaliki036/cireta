#!/bin/sh
set -e

# Run database migrations
echo "Running Alembic migrations..."
cd /app
alembic -c infra/alembic/alembic.ini upgrade head
echo "Migrations complete."

MODE="${1:-api}"

case "$MODE" in
  api)
    echo "Starting API server..."
    exec uvicorn apps.api.main:app --host 0.0.0.0 --port 8000
    ;;
  worker)
    echo "Starting arq worker..."
    exec arq apps.api.workers.tasks.WorkerSettings
    ;;
  *)
    echo "Unknown mode: $MODE (expected 'api' or 'worker')"
    exit 1
    ;;
esac
