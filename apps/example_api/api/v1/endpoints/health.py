"""Health check endpoint."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from packages.common.core.config import settings
from packages.common.db.session import get_db


router = APIRouter()


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    environment: str
    database: str
    version: str = "0.1.0"


class DetailedHealthResponse(HealthResponse):
    """Detailed health check response (debug mode only)."""

    database_url: str | None = None
    redis_url: str | None = None


@router.get("", response_model=HealthResponse)
async def health_check(
    db: Annotated[Session, Depends(get_db)],
) -> HealthResponse:
    """Check application health.

    Returns:
        Health status including database connectivity.
    """
    # Check database connection
    try:
        db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"

    return HealthResponse(
        status="healthy" if db_status == "healthy" else "degraded",
        environment=settings.environment,
        database=db_status,
    )


@router.get("/detailed", response_model=DetailedHealthResponse)
async def detailed_health_check(
    db: Annotated[Session, Depends(get_db)],
) -> DetailedHealthResponse:
    """Detailed health check (debug mode only).

    Returns additional configuration details for debugging.
    Only available when DEBUG=true.
    """
    # Check database
    try:
        db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"

    response = DetailedHealthResponse(
        status="healthy" if db_status == "healthy" else "degraded",
        environment=settings.environment,
        database=db_status,
    )

    # Only include sensitive info in debug mode
    if settings.debug:
        # Mask password in URL
        db_url = settings.database_url
        if "@" in db_url:
            # postgresql://user:pass@host -> postgresql://user:***@host
            parts = db_url.split("@")
            prefix = parts[0].rsplit(":", 1)[0]
            response.database_url = f"{prefix}:***@{parts[1]}"
        else:
            response.database_url = db_url

        response.redis_url = settings.redis_url

    return response
