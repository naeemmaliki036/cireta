"""arq worker entrypoint. Run with: arq apps.api.workers.worker.WorkerSettings"""

from apps.api.workers.tasks import WorkerSettings

__all__ = ["WorkerSettings"]
