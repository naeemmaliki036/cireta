"""Centralized exception handlers for FastAPI applications.

Provides consistent error response format across all apps.
"""

from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from packages.common.core.logging import get_logger

logger = get_logger(__name__)


def _serialize_input(value: Any) -> Any:
    """Convert value to JSON-safe format for error logging."""
    if isinstance(value, bytes):
        return f"<bytes: {len(value)} bytes>"
    elif isinstance(value, str | int | float | bool | type(None)):
        return value
    return str(value)


def _timestamp() -> str:
    """Get current UTC timestamp in ISO format."""
    return datetime.now(UTC).isoformat()


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers on the FastAPI app.

    Call this function during app initialization to set up consistent
    error response formatting.

    Args:
        app: FastAPI application instance

    Example:
        app = FastAPI()
        register_exception_handlers(app)
    """

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request,  # noqa: ARG001
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        """Handle HTTP exceptions with consistent error format."""
        if isinstance(exc.detail, dict):
            content = {
                "success": False,
                "error_code": exc.detail.get("error_code", f"HTTP_{exc.status_code}"),
                "error_type": exc.detail.get("error_type", "HTTPException"),
                "message": exc.detail.get("message", str(exc.detail)),
                "timestamp": _timestamp(),
            }
        else:
            content = {
                "success": False,
                "error_code": f"HTTP_{exc.status_code}",
                "error_type": "HTTPException",
                "message": str(exc.detail),
                "timestamp": _timestamp(),
            }
        return JSONResponse(status_code=exc.status_code, content=content)

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(
        request: Request,  # noqa: ARG001
        exc: RequestValidationError,
    ) -> JSONResponse:
        """Handle FastAPI request validation errors."""
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "error_code": "VALIDATION_ERROR",
                "error_type": "RequestValidationError",
                "message": "Request validation failed",
                "details": [
                    {
                        "field": ".".join([str(loc) for loc in e["loc"]]),
                        "message": e["msg"],
                        "invalid_value": _serialize_input(e.get("input", "")),
                    }
                    for e in exc.errors()
                ],
                "timestamp": _timestamp(),
            },
        )

    @app.exception_handler(ValidationError)
    async def validation_handler(
        request: Request,  # noqa: ARG001
        exc: ValidationError,
    ) -> JSONResponse:
        """Handle Pydantic validation errors."""
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "error_code": "VALIDATION_ERROR",
                "error_type": "ValidationError",
                "message": "Data validation failed",
                "details": [
                    {
                        "field": ".".join([str(loc) for loc in e["loc"]]),
                        "message": e["msg"],
                        "invalid_value": _serialize_input(e.get("input", "")),
                    }
                    for e in exc.errors()
                ],
                "timestamp": _timestamp(),
            },
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(
        request: Request,  # noqa: ARG001
        exc: Exception,
    ) -> JSONResponse:
        """Handle unexpected exceptions."""
        logger.error(f"Unexpected error: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error_code": "INTERNAL_SERVER_ERROR",
                "error_type": "InternalServerError",
                "message": "An internal server error occurred",
                "timestamp": _timestamp(),
            },
        )


__all__ = ["register_exception_handlers"]
