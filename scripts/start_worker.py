"""Railway worker startup — wraps `arq` so we get loud import/config errors.

Mirrors ``scripts/start_api.py`` so the worker service prints the same
shape of diagnostics on boot. Runs ``arq`` against
``apps.api.workers.worker.WorkerSettings`` which:

- Registers every task in ``WorkerSettings.functions`` (12 of them as of
  phase 3 of the identity sync feature, including ``task_sync_identity``
  and ``task_sync_wallet``).
- Spawns the background loops in ``WorkerSettings.on_startup``:
  ``_chain_sync_loop`` (12 s), ``_webhook_process_loop`` (30 s),
  ``_heartbeat_loop`` (30 s), and ``_identity_sync_sweep_loop`` (60 s).

Required env vars (the script fails fast if any of these are missing):
- ``DATABASE_URL`` — async SQLAlchemy URL (postgresql+asyncpg://...)
- ``REDIS_URL`` — arq queue + heartbeat
- ``WEB3_RPC_URL`` — chain sync + identity registry calls
- ``IDENTITY_REGISTRY_ADDRESS`` — SimpleIdentityRegistry proxy
- ``IDENTITY_SIGNER_PRIVATE_KEY`` — registrar wallet (must hold AGENT_ROLE)
- ``ENCRYPTION_KEY`` — used by EncryptedString columns
- ``JWT_SECRET_KEY`` — required by the shared Settings class
"""

import os
import sys
import traceback

# Make /app importable when running from /app/scripts/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


REQUIRED = (
    "DATABASE_URL",
    "REDIS_URL",
    "WEB3_RPC_URL",
    "IDENTITY_REGISTRY_ADDRESS",
    "IDENTITY_SIGNER_PRIVATE_KEY",
    "ENCRYPTION_KEY",
    "JWT_SECRET_KEY",
)


def main() -> None:
    print("=== Cireta worker startup ===", flush=True)
    print(f"Python: {sys.version}", flush=True)
    print(f"ENVIRONMENT: {os.environ.get('ENVIRONMENT', 'not set')}", flush=True)

    missing = [k for k in REQUIRED if not os.environ.get(k)]
    if missing:
        print("=== MISSING REQUIRED ENV VARS ===", flush=True)
        for k in missing:
            print(f"  {k}", flush=True)
        sys.exit(1)
    for k in REQUIRED:
        print(f"{k}: set", flush=True)

    try:
        print("Importing WorkerSettings...", flush=True)
        from apps.api.workers.worker import WorkerSettings  # noqa: F401
        print(
            f"WorkerSettings imported OK ({len(WorkerSettings.functions)} task functions registered)",
            flush=True,
        )
    except Exception:
        print("=== IMPORT FAILED ===", flush=True)
        traceback.print_exc()
        sys.exit(1)

    # Hand off to arq via the same entry point the cli uses.
    try:
        from arq.cli import cli

        # arq's CLI takes the dotted path to the WorkerSettings class.
        sys.argv = ["arq", "apps.api.workers.worker.WorkerSettings"]
        print("Starting arq worker (apps.api.workers.worker.WorkerSettings)", flush=True)
        cli()
    except SystemExit:
        raise
    except Exception:
        print("=== ARQ WORKER FAILED ===", flush=True)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
