"""Railway-compatible start script. Bypasses Railway's uvicorn auto-detection."""
import os
import importlib

# Read PORT from env (Railway injects it)
port = int(os.environ.get("PORT", "8000"))
host = os.environ.get("HOST", "0.0.0.0")

print(f"=== CIRETA API starting on {host}:{port} ===")

# Import uvicorn at runtime so Railway's build scanner doesn't detect it
uvicorn = importlib.import_module("uvicorn")
uvicorn.run("apps.api.main:app", host=host, port=port, workers=1)
