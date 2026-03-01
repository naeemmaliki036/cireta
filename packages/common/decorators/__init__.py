"""Decorators for common patterns."""

from packages.common.decorators.error_handling import (
    handle_create_errors,
    handle_delete_errors,
    handle_endpoint_errors,
    handle_get_errors,
    handle_list_errors,
    handle_search_errors,
    handle_update_errors,
)

__all__ = [
    "handle_endpoint_errors",
    "handle_create_errors",
    "handle_delete_errors",
    "handle_get_errors",
    "handle_list_errors",
    "handle_search_errors",
    "handle_update_errors",
]
