#!/bin/sh
set -e
echo "=== ENTRYPOINT STARTING ==="
echo "PORT=$PORT"
echo "PYTHONPATH=$PYTHONPATH"
echo "PWD=$(pwd)"
echo "USER=$(whoami)"
ls /app/.venv/bin/uvicorn && echo "uvicorn found" || echo "uvicorn NOT found"
/app/.venv/bin/python --version
echo "=== STARTING UVICORN ==="
exec /app/.venv/bin/uvicorn apps.api.main:app --host 0.0.0.0 --port ${PORT:-8000}
