#!/bin/sh
set -e
echo "=== CIRETA API STARTING ==="
echo "PORT=${PORT}"
BIND_PORT="${PORT:-8000}"
echo "Binding to port: ${BIND_PORT}"
exec /app/.venv/bin/uvicorn apps.api.main:app --host 0.0.0.0 --port "${BIND_PORT}"
