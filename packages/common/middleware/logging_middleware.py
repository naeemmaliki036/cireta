"""Request logging middleware with correlation IDs."""

import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from packages.common.core.logging import get_logger

# Context variable for correlation ID (accessible across async calls)
correlation_id_ctx: ContextVar[str | None] = ContextVar("correlation_id", default=None)

logger = get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for request logging with correlation IDs.

    Features:
    - Generates unique correlation ID for each request
    - Logs request start and completion
    - Tracks request duration
    - Adds correlation ID to response headers
    """

    CORRELATION_ID_HEADER = "X-Correlation-ID"

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """Process request with logging and correlation ID."""
        # Get or generate correlation ID
        correlation_id = request.headers.get(
            self.CORRELATION_ID_HEADER,
            str(uuid.uuid4()),
        )

        # Set in context for access in other parts of the application
        correlation_id_ctx.set(correlation_id)

        # Log request start
        start_time = time.perf_counter()
        logger.info(
            "Request started",
            method=request.method,
            path=request.url.path,
            correlation_id=correlation_id,
        )

        try:
            response = await call_next(request)

            # Calculate duration
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Log request completion
            logger.info(
                "Request completed",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=round(duration_ms, 2),
                correlation_id=correlation_id,
            )

            # Add correlation ID to response headers
            response.headers[self.CORRELATION_ID_HEADER] = correlation_id

            return response

        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000

            logger.error(
                "Request failed",
                method=request.method,
                path=request.url.path,
                error=str(e),
                duration_ms=round(duration_ms, 2),
                correlation_id=correlation_id,
            )
            raise
        finally:
            # Clear context
            correlation_id_ctx.set(None)
