"""Utility functions and classes."""

from packages.common.utils.base_client import BaseHttpClient
from packages.common.utils.error_handlers import register_exception_handlers
from packages.common.utils.http_errors import (
    raise_not_found,
    raise_bad_request,
    raise_unauthorized,
    raise_forbidden,
    raise_conflict,
    raise_internal_error,
    raise_user_not_found,
    raise_email_already_registered,
    raise_invalid_credentials,
    raise_session_expired,
    raise_invalid_token,
    raise_access_denied,
)

__all__ = [
    "BaseHttpClient",
    "register_exception_handlers",
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
