"""HTTP client with rate limiting and retry logic."""

import asyncio
from typing import Any

import httpx

from packages.common.core.logging import get_logger

logger = get_logger(__name__)


class RateLimiter:
    """Simple token bucket rate limiter."""

    def __init__(self, requests_per_second: float = 10.0) -> None:
        """Initialize rate limiter.

        Args:
            requests_per_second: Maximum requests allowed per second.
        """
        self.requests_per_second = requests_per_second
        self.tokens = requests_per_second
        self.last_update = asyncio.get_event_loop().time()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Wait until a request can be made."""
        async with self._lock:
            now = asyncio.get_event_loop().time()
            time_passed = now - self.last_update
            self.tokens = min(
                self.requests_per_second,
                self.tokens + time_passed * self.requests_per_second,
            )
            self.last_update = now

            if self.tokens < 1:
                wait_time = (1 - self.tokens) / self.requests_per_second
                await asyncio.sleep(wait_time)
                self.tokens = 0
            else:
                self.tokens -= 1


class BaseHttpClient:
    """HTTP client with rate limiting and automatic retries.

    Example:
        client = BaseHttpClient(
            base_url="https://api.example.com",
            rate_limit=10.0,
        )

        async with client:
            response = await client.get("/users")
    """

    def __init__(
        self,
        base_url: str,
        *,
        rate_limit: float = 10.0,
        timeout: float = 30.0,
        max_retries: int = 3,
        headers: dict[str, str] | None = None,
    ) -> None:
        """Initialize HTTP client.

        Args:
            base_url: Base URL for all requests.
            rate_limit: Maximum requests per second.
            timeout: Request timeout in seconds.
            max_retries: Maximum retry attempts for failed requests.
            headers: Default headers for all requests.
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.rate_limiter = RateLimiter(rate_limit)
        self._client: httpx.AsyncClient | None = None
        self._default_headers = headers or {}

    async def __aenter__(self) -> "BaseHttpClient":
        """Enter async context."""
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout,
            headers=self._default_headers,
        )
        return self

    async def __aexit__(self, *args: Any) -> None:
        """Exit async context."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> httpx.Response:
        """Make an HTTP request with rate limiting and retries.

        Args:
            method: HTTP method (GET, POST, etc.)
            path: Request path (relative to base_url)
            **kwargs: Additional arguments passed to httpx.

        Returns:
            HTTP response.

        Raises:
            httpx.HTTPError: If request fails after all retries.
        """
        if not self._client:
            raise RuntimeError("Client not initialized. Use 'async with' context.")

        last_error: Exception | None = None

        for attempt in range(self.max_retries):
            await self.rate_limiter.acquire()

            try:
                response = await self._client.request(method, path, **kwargs)
                response.raise_for_status()
                return response

            except httpx.HTTPStatusError as e:
                last_error = e
                # Don't retry client errors (4xx)
                if 400 <= e.response.status_code < 500:
                    raise

                logger.warning(
                    "Request failed, retrying",
                    method=method,
                    path=path,
                    status_code=e.response.status_code,
                    attempt=attempt + 1,
                    max_retries=self.max_retries,
                )

            except httpx.RequestError as e:
                last_error = e
                logger.warning(
                    "Request error, retrying",
                    method=method,
                    path=path,
                    error=str(e),
                    attempt=attempt + 1,
                    max_retries=self.max_retries,
                )

            # Exponential backoff
            if attempt < self.max_retries - 1:
                await asyncio.sleep(2 ** attempt)

        raise last_error or RuntimeError("Request failed after all retries")

    async def get(self, path: str, **kwargs: Any) -> httpx.Response:
        """Make a GET request."""
        return await self.request("GET", path, **kwargs)

    async def post(self, path: str, **kwargs: Any) -> httpx.Response:
        """Make a POST request."""
        return await self.request("POST", path, **kwargs)

    async def put(self, path: str, **kwargs: Any) -> httpx.Response:
        """Make a PUT request."""
        return await self.request("PUT", path, **kwargs)

    async def patch(self, path: str, **kwargs: Any) -> httpx.Response:
        """Make a PATCH request."""
        return await self.request("PATCH", path, **kwargs)

    async def delete(self, path: str, **kwargs: Any) -> httpx.Response:
        """Make a DELETE request."""
        return await self.request("DELETE", path, **kwargs)
