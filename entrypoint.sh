#!/bin/sh
set -e
echo "=== CIRETA API STARTING on port ${PORT:-8000} ==="
exec python -m apps.api.main
