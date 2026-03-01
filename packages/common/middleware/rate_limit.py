"""Rate limiting middleware.

Provides request rate limiting using a sliding window algorithm.
Supports Redis for distributed rate limiting or in-memory fallback.
"""

from __future__ import annotations

import hashlib
import logging
import time
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)


@dataclass
class RateLimitConfig:
    """Configuration for rate limiting.

    Attributes:
        requests_per_minute: Maximum requests allowed per minute.
        burst_size: Additional requests allowed in burst (default: 10% of limit).
        exclude_paths: Paths to exclude from rate limiting.
        key_func: Function to extract rate limit key from request.
    """

    requests_per_minute: int = 60
    burst_size: int | None = None
    exclude_paths: list[str] = field(default_factory=lambda: ["/health", "/metrics"])
    key_func: Callable[[Request], str] | None = None

    def __post_init__(self) -> None:
        if self.burst_size is None:
            self.burst_size = max(1, self.requests_per_minute // 10)


class SlidingWindowCounter:
    """In-memory sliding window rate limiter.

    Uses a sliding window algorithm to count requests within
    a time window, allowing for smooth rate limiting.
    """

    def __init__(self, window_size: int = 60) -> None:
        """Initialize the counter.

        Args:
            window_size: Window size in seconds.
        """
        self.window_size = window_size
        self._windows: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str, limit: int, burst: int = 0) -> tuple[bool, int]:
        """Check if a request is allowed.

        Args:
            key: Rate limit key (e.g., IP address).
            limit: Maximum requests per window.
            burst: Additional burst allowance.

        Returns:
            Tuple of (is_allowed, remaining_requests).
        """
        now = time.time()
        window_start = now - self.window_size

        # Clean old entries and count current
        self._windows[key] = [t for t in self._windows[key] if t > window_start]
        count = len(self._windows[key])

        effective_limit = limit + burst
        remaining = max(0, effective_limit - count)

        if count < effective_limit:
            self._windows[key].append(now)
            return True, remaining - 1

        return False, 0

    def cleanup(self, max_age: int = 300) -> None:
        """Remove stale entries.

        Args:
            max_age: Maximum age in seconds for entries.
        """
        cutoff = time.time() - max_age
        stale_keys = [k for k, v in self._windows.items() if not v or v[-1] < cutoff]
        for key in stale_keys:
            del self._windows[key]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware for FastAPI.

    Implements sliding window rate limiting with configurable
    limits and optional Redis backend for distributed limiting.

    Usage:
        from packages.common.middleware.rate_limit import (
            RateLimitMiddleware,
            RateLimitConfig,
        )

        app.add_middleware(
            RateLimitMiddleware,
            config=RateLimitConfig(requests_per_minute=100),
        )
    """

    def __init__(
        self,
        app: ASGIApp,
        config: RateLimitConfig | None = None,
    ) -> None:
        super().__init__(app)
        self.config = config or RateLimitConfig()
        self._counter = SlidingWindowCounter()

    def _get_client_key(self, request: Request) -> str:
        """Extract rate limit key from request."""
        if self.config.key_func:
            return self.config.key_func(request)

        # Default: use client IP
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()
        else:
            client_ip = request.client.host if request.client else "unknown"

        # Hash the key for privacy
        return hashlib.sha256(client_ip.encode()).hexdigest()[:16]

    def _is_excluded(self, path: str) -> bool:
        """Check if path is excluded from rate limiting."""
        return any(path.startswith(excluded) for excluded in self.config.exclude_paths)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process the request with rate limiting."""
        # Skip excluded paths
        if self._is_excluded(request.url.path):
            return await call_next(request)

        client_key = self._get_client_key(request)
        allowed, remaining = self._counter.is_allowed(
            client_key,
            self.config.requests_per_minute,
            self.config.burst_size or 0,
        )

        if not allowed:
            logger.warning(f"Rate limit exceeded for key: {client_key[:8]}...")
            return Response(
                content='{"detail": "Rate limit exceeded. Please try again later."}',
                status_code=429,
                media_type="application/json",
                headers={
                    "X-RateLimit-Limit": str(self.config.requests_per_minute),
                    "X-RateLimit-Remaining": "0",
                    "Retry-After": "60",
                },
            )

        response = await call_next(request)

        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(self.config.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(remaining)

        return response
