"""Railway-compatible start script."""
import os
import subprocess
import sys

# Ensure uvicorn is installed (it's in the server group, not main deps)
subprocess.check_call([sys.executable, "-m", "pip", "install", "uvicorn[standard]", "-q"])

port = int(os.environ.get("PORT", "8000"))
host = os.environ.get("HOST", "0.0.0.0")

print(f"=== CIRETA API starting on {host}:{port} ===")

import uvicorn
uvicorn.run("apps.api.main:app", host=host, port=port, workers=1)
