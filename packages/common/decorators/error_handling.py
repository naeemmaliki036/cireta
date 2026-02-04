"""Error handling decorators for API endpoints.

Provides standardized try-except-log-HTTPException pattern for FastAPI endpoints.
Eliminates duplicate error handling boilerplate across endpoint files.
"""

import asyncio
import contextlib
from collections.abc import Callable
from functools import wraps
from typing import TypeVar

from fastapi import HTTPException, status

from packages.common.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


def _generate_error_code(operation_name: str) -> str:
    """Generate error code from operation name.

    Examples:
        "submit feedback" -> "SUBMIT_FEEDBACK_ERROR"
        "get user" -> "GET_USER_ERROR"
    """
    return f"{operation_name.upper().replace(' ', '_')}_ERROR"


def handle_endpoint_errors(
    operation_name: str,
    *,
    error_code: str | None = None,
    default_status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
    include_exc_info: bool = True,
):
    """Decorator to standardize error handling for API endpoints.

    Wraps endpoint functions with consistent try-except-log-HTTPException pattern.
    Supports both async and sync functions.

    Features:
        - Re-raises HTTPException as-is
        - Catches other exceptions, logs, wraps in structured HTTPException
        - Auto-detects 'db' parameter and calls rollback on error
        - Generates error_code from operation_name if not provided

    Args:
        operation_name: Human-readable operation name for error messages
                       (e.g., "submit feedback", "get user")
        error_code: Optional explicit error code. If None, auto-generated from
                   operation_name (e.g., "submit feedback" -> "SUBMIT_FEEDBACK_ERROR")
        default_status_code: HTTP status code for unhandled errors (default: 500)
        include_exc_info: Include full traceback in logs (default: True)

    Usage:
        @router.get("/search")
        @handle_endpoint_errors("search items")
        async def search_items(db: Session = Depends(get_db), ...):
            # Business logic - no try-except needed
            return results

    Example with custom error code:
        @router.post("/")
        @handle_endpoint_errors("create user", error_code="USER_CREATION_FAILED")
        async def create_user(...):
            ...
    """
    resolved_error_code = error_code or _generate_error_code(operation_name)

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> T:
            try:
                return await func(*args, **kwargs)
            except HTTPException:
                # Re-raise HTTPException as-is (already formatted)
                raise
            except Exception as e:
                # Rollback database session if present
                db_session = kwargs.get("db")
                if db_session is not None:
                    with contextlib.suppress(Exception):
                        db_session.rollback()

                logger.error(f"Error in {operation_name}: {e}", exc_info=include_exc_info)
                raise HTTPException(
                    status_code=default_status_code,
                    detail={
                        "error_code": resolved_error_code,
                        "error_type": "InternalServerError",
                        "message": f"Failed to {operation_name}: {str(e)}",
                    },
                ) from None

        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> T:
            try:
                return func(*args, **kwargs)
            except HTTPException:
                raise
            except Exception as e:
                db_session = kwargs.get("db")
                if db_session is not None:
                    with contextlib.suppress(Exception):
                        db_session.rollback()

                logger.error(f"Error in {operation_name}: {e}", exc_info=include_exc_info)
                raise HTTPException(
                    status_code=default_status_code,
                    detail={
                        "error_code": resolved_error_code,
                        "error_type": "InternalServerError",
                        "message": f"Failed to {operation_name}: {str(e)}",
                    },
                ) from None

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


# Convenience aliases for common CRUD patterns
def handle_search_errors(resource_type: str):
    """Shorthand for search endpoint error handling."""
    return handle_endpoint_errors(f"search {resource_type}")


def handle_get_errors(resource_type: str):
    """Shorthand for get-by-id endpoint error handling."""
    return handle_endpoint_errors(f"get {resource_type}")


def handle_create_errors(resource_type: str):
    """Shorthand for create endpoint error handling."""
    return handle_endpoint_errors(f"create {resource_type}")


def handle_update_errors(resource_type: str):
    """Shorthand for update endpoint error handling."""
    return handle_endpoint_errors(f"update {resource_type}")


def handle_delete_errors(resource_type: str):
    """Shorthand for delete endpoint error handling."""
    return handle_endpoint_errors(f"delete {resource_type}")


def handle_list_errors(resource_type: str):
    """Shorthand for list endpoint error handling."""
    return handle_endpoint_errors(f"list {resource_type}")


__all__ = [
    "handle_endpoint_errors",
    "handle_search_errors",
    "handle_get_errors",
    "handle_create_errors",
    "handle_update_errors",
    "handle_delete_errors",
    "handle_list_errors",
]
