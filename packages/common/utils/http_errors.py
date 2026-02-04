"""Centralized HTTP error helpers for consistent error responses.

Provides standardized helpers for raising HTTPException with consistent
error formatting across all APIs.

Usage:
    from packages.common.utils.http_errors import (
        raise_not_found,
        raise_bad_request,
        raise_user_not_found,
    )

    # Generic usage
    raise_not_found("User", user_id)
    raise_bad_request("Invalid input provided")

    # Domain-specific helpers
    raise_user_not_found(user_id)
"""

from typing import NoReturn
from uuid import UUID

from fastapi import HTTPException, status

# =============================================================================
# Generic Error Helpers
# =============================================================================


def raise_not_found(
    entity_type: str,
    identifier: str | int | UUID | None = None,
    *,
    error_code: str | None = None,
    message: str | None = None,
) -> NoReturn:
    """Raise a standardized 404 HTTPException.

    Args:
        entity_type: Type of entity (e.g., "User", "Item")
        identifier: Optional ID/name of the entity
        error_code: Custom error code (auto-generated if not provided)
        message: Custom message (auto-generated if not provided)

    Raises:
        HTTPException: Always raises with status 404

    Examples:
        raise_not_found("User", user_id)
        raise_not_found("Item", item_id, error_code="ITEM_LOOKUP_FAILED")
    """
    code = error_code or f"{entity_type.upper().replace(' ', '_')}_NOT_FOUND"
    msg = message or (
        f"{entity_type} {identifier} not found" if identifier else f"{entity_type} not found"
    )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "error_code": code,
            "error_type": "NotFoundError",
            "message": msg,
        },
    )


def raise_bad_request(
    message: str,
    *,
    error_code: str | None = None,
) -> NoReturn:
    """Raise a standardized 400 HTTPException.

    Args:
        message: Human-readable error message
        error_code: Custom error code (defaults to "BAD_REQUEST")

    Raises:
        HTTPException: Always raises with status 400
    """
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "error_code": error_code or "BAD_REQUEST",
            "error_type": "BadRequestError",
            "message": message,
        },
    )


def raise_unauthorized(
    message: str = "Authentication required",
    *,
    error_code: str | None = None,
    include_www_authenticate: bool = True,
) -> NoReturn:
    """Raise a standardized 401 HTTPException.

    Args:
        message: Human-readable error message
        error_code: Custom error code (defaults to "UNAUTHORIZED")
        include_www_authenticate: Whether to include WWW-Authenticate header

    Raises:
        HTTPException: Always raises with status 401
    """
    headers = {"WWW-Authenticate": "Bearer"} if include_www_authenticate else None
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "error_code": error_code or "UNAUTHORIZED",
            "error_type": "UnauthorizedError",
            "message": message,
        },
        headers=headers,
    )


def raise_forbidden(
    message: str = "Access denied",
    *,
    error_code: str | None = None,
) -> NoReturn:
    """Raise a standardized 403 HTTPException.

    Args:
        message: Human-readable error message
        error_code: Custom error code (defaults to "FORBIDDEN")

    Raises:
        HTTPException: Always raises with status 403
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "error_code": error_code or "FORBIDDEN",
            "error_type": "ForbiddenError",
            "message": message,
        },
    )


def raise_conflict(
    message: str,
    *,
    error_code: str | None = None,
) -> NoReturn:
    """Raise a standardized 409 HTTPException.

    Args:
        message: Human-readable error message
        error_code: Custom error code (defaults to "CONFLICT")

    Raises:
        HTTPException: Always raises with status 409
    """
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "error_code": error_code or "CONFLICT",
            "error_type": "ConflictError",
            "message": message,
        },
    )


def raise_internal_error(
    message: str = "An internal error occurred",
    *,
    error_code: str | None = None,
) -> NoReturn:
    """Raise a standardized 500 HTTPException.

    Args:
        message: Human-readable error message
        error_code: Custom error code (defaults to "INTERNAL_ERROR")

    Raises:
        HTTPException: Always raises with status 500
    """
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={
            "error_code": error_code or "INTERNAL_ERROR",
            "error_type": "InternalError",
            "message": message,
        },
    )


# =============================================================================
# Domain-Specific Helpers
# =============================================================================


def raise_user_not_found(user_id: str | int | UUID | None = None) -> NoReturn:
    """Raise 404 for user not found."""
    raise_not_found("User", user_id)


def raise_email_already_registered(email: str | None = None) -> NoReturn:
    """Raise 409 for duplicate email registration."""
    msg = f"Email {email} is already registered" if email else "Email is already registered"
    raise_conflict(msg, error_code="EMAIL_ALREADY_REGISTERED")


def raise_invalid_credentials() -> NoReturn:
    """Raise 401 for invalid email/password credentials."""
    raise_unauthorized(
        "Incorrect email or password",
        error_code="INVALID_CREDENTIALS",
    )


def raise_session_expired() -> NoReturn:
    """Raise 401 when the user session has expired."""
    raise_unauthorized(
        "Your session has expired. Please log in again.",
        error_code="SESSION_EXPIRED",
    )


def raise_invalid_token(reason: str = "Invalid or expired token") -> NoReturn:
    """Raise 401 for invalid or malformed tokens."""
    raise_unauthorized(reason, error_code="INVALID_TOKEN")


def raise_access_denied(resource: str | None = None) -> NoReturn:
    """Raise 403 for access denied to a specific resource."""
    msg = f"Access denied to {resource}" if resource else "Access denied"
    raise_forbidden(msg, error_code="ACCESS_DENIED")


__all__ = [
    "raise_not_found",
    "raise_bad_request",
    "raise_unauthorized",
    "raise_forbidden",
    "raise_conflict",
    "raise_internal_error",
    "raise_user_not_found",
    "raise_email_already_registered",
    "raise_invalid_credentials",
    "raise_session_expired",
    "raise_invalid_token",
    "raise_access_denied",
]
