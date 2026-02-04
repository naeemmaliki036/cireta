"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from packages.common.core.config import settings
from packages.common.core.logging import configure_logging, get_logger
from packages.common.middleware import LoggingMiddleware, SecurityHeadersMiddleware

from apps.example_api.api.v1.router import api_router


logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler.

    Runs startup and shutdown logic.
    """
    # Startup
    configure_logging()
    logger.info(
        "Starting application",
        environment=settings.environment,
        debug=settings.debug,
    )
    yield
    # Shutdown
    logger.info("Shutting down application")


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    app = FastAPI(
        title="Example API",
        description="Product-agnostic scaffold API demonstrating best practices",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        openapi_url="/openapi.json" if settings.debug else None,
    )

    # Add middleware (order matters - applied bottom to top)
    # 1. CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 2. Security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # 3. Logging
    app.add_middleware(LoggingMiddleware)

    # Register routers
    app.include_router(api_router, prefix="/api/v1")

    return app


# Create application instance
app = create_app()


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    """Root endpoint redirect to docs."""
    return {"message": "Welcome to Example API. Visit /docs for documentation."}
