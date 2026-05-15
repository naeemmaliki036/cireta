"""FastAPI application entry point for Cireta RWA Launchpad API.

Middleware stack (applied bottom to top, meaning first added = outermost):
  - CORSMiddleware: Handle cross-origin requests
  - RateLimitMiddleware: Rate limit requests
  - SecurityHeadersMiddleware: Add OWASP security headers
  - LoggingMiddleware: Request logging with correlation IDs
"""

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from apps.api.api.v1.router import router as v1_router
from apps.api.core.config import settings
from packages.common.middleware import (
    LoggingMiddleware,
    PathRateLimit,
    RateLimitConfig,
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
)

logger = logging.getLogger(__name__)


async def _chain_sync_loop() -> None:
    """In-process chain-event poller. Replaces the dedicated arq worker for
    environments where one isn't running (sandbox today).

    Polls every 12 seconds for Sale/Token/Fraction/Redemption events and
    syncs DB state. Per-cycle exceptions are logged but never crash the loop.
    """
    from apps.api.services.event_listener_service import EventListenerService

    svc = EventListenerService()
    logger.info("In-process chain-sync loop started")
    while True:
        try:
            count = await svc.poll_events()
            if count:
                logger.info("Chain sync: %d events processed", count)
        except Exception as e:
            logger.error("Chain sync cycle failed: %s", e, exc_info=True)
        await asyncio.sleep(12)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler for startup/shutdown events."""
    # Startup — kick off background tasks unless explicitly disabled.
    # In production with a dedicated worker service, set DISABLE_INPROCESS_WORKER=1.
    chain_sync_task = None
    if os.getenv("DISABLE_INPROCESS_WORKER") != "1":
        chain_sync_task = asyncio.create_task(_chain_sync_loop())
        logger.info("In-process chain sync enabled (set DISABLE_INPROCESS_WORKER=1 to disable)")
    else:
        logger.info("In-process chain sync DISABLED via env")

    yield

    # Shutdown — cancel background tasks cleanly.
    if chain_sync_task is not None:
        chain_sync_task.cancel()
        with suppress(asyncio.CancelledError):
            await chain_sync_task


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Cireta RWA Launchpad API",
        description="Regulated RWA tokenization launchpad for commodities",
        version="1.0.0",
        docs_url="/api/docs" if settings.is_development else None,
        redoc_url="/api/redoc" if settings.is_development else None,
        openapi_url="/api/openapi.json" if settings.is_development else None,
        lifespan=lifespan,
    )

    # Configure middleware stack (bottom to top order per CLAUDE.md)
    # First added = outermost middleware

    # 1. CORS - handle cross-origin requests (outermost)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Correlation-ID", "X-Requested-With"],
        expose_headers=["X-Correlation-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
    )

    # 2. Rate limiting with path-specific limits per CLAUDE.md
    rate_limit_config = RateLimitConfig(
        requests_per_minute=settings.rate_limit_default,
        exclude_paths=["/api/v1/health", "/api/docs", "/api/redoc", "/api/openapi.json"],
        path_limits=[
            PathRateLimit("/api/v1/auth/login", settings.rate_limit_login),  # 5/min
            PathRateLimit("/api/v1/auth/register", settings.rate_limit_register),  # 10/min
            PathRateLimit("/api/v1/auth/forgot-password", 5),  # 5/min anti-abuse
            PathRateLimit("/api/v1/auth/reset-password", 5),  # 5/min anti-abuse
            PathRateLimit(
                "/api/v1/sales/", settings.rate_limit_contribute
            ),  # 20/min for contribute
            PathRateLimit("/api/v1/issuer/wallet", 10),  # 10/min wallet submission
            PathRateLimit("/api/v1/issuer/identity", 5),  # 5/min identity verification
            PathRateLimit("/api/v1/issuer/onboarding-status", 30),  # 30/min status polling
        ],
    )
    app.add_middleware(RateLimitMiddleware, config=rate_limit_config)

    # 3. Security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # 4. Logging with correlation IDs (innermost)
    app.add_middleware(LoggingMiddleware)

    # Include API routers
    app.include_router(v1_router)

    # Serve local uploads in development (GCS serves directly in production)
    if settings.storage_backend == "local":
        from pathlib import Path

        from fastapi.staticfiles import StaticFiles

        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)
        app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "apps.api.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.is_development,
        workers=1 if settings.is_development else settings.workers,
    )
