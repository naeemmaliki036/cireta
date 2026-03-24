"""Health check endpoints for Kubernetes liveness and readiness probes."""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    details: dict[str, str] | None = None


@router.get("/live", response_model=HealthResponse)
async def liveness_check() -> HealthResponse:
    """Liveness probe - indicates the service is running.

    Used by Kubernetes to determine if the container should be restarted.
    Returns 200 if the application process is alive.
    """
    return HealthResponse(status="ok")


@router.get("/ready", response_model=HealthResponse)
async def readiness_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Readiness probe - indicates the service can handle requests.

    Used by Kubernetes to determine if traffic should be routed to this pod.
    Checks database connectivity and other critical dependencies.
    """
    details: dict[str, str] = {}

    # Check database connectivity
    try:
        await db.execute(text("SELECT 1"))
        details["database"] = "connected"
    except Exception as e:
        logger.error("Readiness probe database check failed: %s", str(e))
        details["database"] = "database unavailable"
        return HealthResponse(status="unhealthy", details=details)

    # Check RPC connectivity
    try:
        from apps.api.core.web3_provider import get_rpc_health

        rpc_health = get_rpc_health()
        details["rpc"] = rpc_health["primary_rpc"]
        details["rpc_circuit"] = rpc_health["circuit_state"]
        if rpc_health.get("fallback_rpc") != "not_configured":
            details["rpc_fallback"] = rpc_health["fallback_rpc"]
    except Exception as e:
        logger.warning("RPC health check failed: %s", e)
        details["rpc"] = "unknown"

    return HealthResponse(status="ok", details=details)


@router.get("/worker", response_model=HealthResponse)
async def worker_health_check() -> HealthResponse:
    """Check worker health via Redis heartbeat key.

    Returns unhealthy if the heartbeat is missing or older than 90 seconds.
    """
    from datetime import UTC, datetime

    details: dict[str, str] = {}

    try:
        import redis.asyncio as aioredis

        from packages.common.core.config import settings

        r = aioredis.from_url(settings.redis_url or "redis://localhost:6379")
        val = await r.get("cireta:worker:heartbeat")
        await r.aclose()

        if not val:
            details["worker"] = "no heartbeat found"
            return HealthResponse(status="unhealthy", details=details)

        last_beat = datetime.fromisoformat(val.decode())
        age_seconds = (datetime.now(UTC) - last_beat).total_seconds()
        if age_seconds > 90:
            details["worker"] = f"stale heartbeat ({int(age_seconds)}s ago)"
            return HealthResponse(status="unhealthy", details=details)

        details["worker"] = f"healthy (last heartbeat {int(age_seconds)}s ago)"
        return HealthResponse(status="ok", details=details)
    except Exception as e:
        logger.error("Worker health check failed: %s", e)
        details["worker"] = "redis unavailable"
        return HealthResponse(status="unhealthy", details=details)
