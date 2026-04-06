"""Railway API startup — catches import/config errors and prints them."""
import os
import sys
import traceback

port = int(os.environ.get("PORT", "8000"))
print(f"=== Cireta API starting on 0.0.0.0:{port} ===", flush=True)

try:
    import uvicorn
    uvicorn.run("apps.api.main:app", host="0.0.0.0", port=port, workers=1)
except Exception:
    traceback.print_exc()
    sys.exit(1)
