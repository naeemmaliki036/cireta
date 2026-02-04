"""Structured logging with PII filtering."""

import logging
import re
import sys
from typing import Any

import structlog
from structlog.types import EventDict, Processor

from packages.common.core.config import settings


# PII patterns to filter from logs
PII_PATTERNS = [
    (re.compile(r'"password"\s*:\s*"[^"]*"', re.IGNORECASE), '"password": "[REDACTED]"'),
    (re.compile(r'"token"\s*:\s*"[^"]*"', re.IGNORECASE), '"token": "[REDACTED]"'),
    (re.compile(r'"api_key"\s*:\s*"[^"]*"', re.IGNORECASE), '"api_key": "[REDACTED]"'),
    (re.compile(r'"secret"\s*:\s*"[^"]*"', re.IGNORECASE), '"secret": "[REDACTED]"'),
    (re.compile(r'"authorization"\s*:\s*"[^"]*"', re.IGNORECASE), '"authorization": "[REDACTED]"'),
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'), "[EMAIL]"),
]


def filter_pii(
    _logger: logging.Logger, _method_name: str, event_dict: EventDict
) -> EventDict:
    """Filter PII from log messages."""
    event = event_dict.get("event", "")
    if isinstance(event, str):
        for pattern, replacement in PII_PATTERNS:
            event = pattern.sub(replacement, event)
        event_dict["event"] = event
    return event_dict


def add_correlation_id(
    _logger: logging.Logger, _method_name: str, event_dict: EventDict
) -> EventDict:
    """Add correlation ID to log messages if available."""
    from packages.common.middleware.logging_middleware import correlation_id_ctx

    try:
        correlation_id = correlation_id_ctx.get()
        if correlation_id:
            event_dict["correlation_id"] = correlation_id
    except LookupError:
        pass
    return event_dict


def get_processors() -> list[Processor]:
    """Get the list of structlog processors."""
    processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        add_correlation_id,
        filter_pii,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if settings.log_format == "json":
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer(colors=True))

    return processors


def configure_logging() -> None:
    """Configure structured logging for the application."""
    # Set log level
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    # Configure structlog
    structlog.configure(
        processors=get_processors(),
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Configure standard logging to use structlog
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )

    # Suppress noisy loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> Any:
    """Get a structured logger instance."""
    return structlog.get_logger(name)
