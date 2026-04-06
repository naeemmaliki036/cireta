"""Railway API startup — catches import/config errors and prints them."""
import os
import sys
import traceback

# Ensure /app is on Python path (needed when running from /app/scripts/)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

print("=== Cireta API startup ===", flush=True)
print(f"Python: {sys.version}", flush=True)
print(f"PORT: {os.environ.get('PORT', '8000')}", flush=True)
print(f"ENVIRONMENT: {os.environ.get('ENVIRONMENT', 'not set')}", flush=True)
print(f"DATABASE_URL: {'set' if os.environ.get('DATABASE_URL') else 'NOT SET'}", flush=True)
print(f"REDIS_URL: {'set' if os.environ.get('REDIS_URL') else 'NOT SET'}", flush=True)

try:
    print("Importing app...", flush=True)
    from apps.api.main import app  # noqa: F401
    print("App imported OK", flush=True)
except Exception:
    print("=== IMPORT FAILED ===", flush=True)
    traceback.print_exc()
    sys.exit(1)

try:
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    print(f"Starting uvicorn on 0.0.0.0:{port}", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=port, workers=1)
except Exception:
    print("=== UVICORN FAILED ===", flush=True)
    traceback.print_exc()
    sys.exit(1)
