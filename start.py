"""Railway start script — reads PORT from env, bypasses Railway's uvicorn injection."""
import os
import uvicorn

port = int(os.environ.get("PORT", "8000"))
host = "0.0.0.0"

print(f"=== CIRETA API starting on {host}:{port} ===", flush=True)
uvicorn.run("apps.api.main:app", host=host, port=port, workers=1)
