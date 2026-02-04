"""Application metrics collection.

Provides a simple metrics collector for tracking request counts,
latencies, error rates, and cache performance.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any


@dataclass
class MetricsCollector:
    """Collects and aggregates application metrics.

    Thread-safe metrics collection for request tracking, error counts,
    and performance monitoring.

    Usage:
        metrics = get_metrics_collector()
        metrics.record_request("/api/users", 45.2)
        metrics.record_error("/api/users", "ValidationError")
        stats = metrics.get_metrics()
    """

    # Request metrics
    request_count: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    request_latency: dict[str, list[float]] = field(
        default_factory=lambda: defaultdict(list)
    )
    error_count: dict[str, dict[str, int]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(int))
    )

    # Database metrics
    db_query_count: int = 0
    db_query_latency: list[float] = field(default_factory=list)

    # Cache metrics
    cache_hits: int = 0
    cache_misses: int = 0

    # Internal
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _max_latency_samples: int = 1000

    def record_request(self, endpoint: str, duration_ms: float) -> None:
        """Record a request to an endpoint.

        Args:
            endpoint: The endpoint path (e.g., "/api/users").
            duration_ms: Request duration in milliseconds.
        """
        with self._lock:
            self.request_count[endpoint] += 1
            latencies = self.request_latency[endpoint]
            latencies.append(duration_ms)
            # Keep only recent samples to bound memory
            if len(latencies) > self._max_latency_samples:
                self.request_latency[endpoint] = latencies[-self._max_latency_samples :]

    def record_error(self, endpoint: str, error_type: str) -> None:
        """Record an error for an endpoint.

        Args:
            endpoint: The endpoint path.
            error_type: Type of error (e.g., "ValidationError", "500").
        """
        with self._lock:
            self.error_count[endpoint][error_type] += 1

    def record_db_query(self, duration_ms: float) -> None:
        """Record a database query.

        Args:
            duration_ms: Query duration in milliseconds.
        """
        with self._lock:
            self.db_query_count += 1
            self.db_query_latency.append(duration_ms)
            if len(self.db_query_latency) > self._max_latency_samples:
                self.db_query_latency = self.db_query_latency[
                    -self._max_latency_samples :
                ]

    def record_cache_hit(self) -> None:
        """Record a cache hit."""
        with self._lock:
            self.cache_hits += 1

    def record_cache_miss(self) -> None:
        """Record a cache miss."""
        with self._lock:
            self.cache_misses += 1

    def get_metrics(self) -> dict[str, Any]:
        """Get aggregated metrics.

        Returns:
            Dictionary with all metrics including computed statistics.
        """
        with self._lock:
            total_requests = sum(self.request_count.values())
            total_errors = sum(
                sum(errors.values()) for errors in self.error_count.values()
            )

            # Compute endpoint stats
            endpoint_stats = {}
            for endpoint, count in self.request_count.items():
                latencies = self.request_latency.get(endpoint, [])
                errors = self.error_count.get(endpoint, {})
                endpoint_stats[endpoint] = {
                    "count": count,
                    "errors": dict(errors),
                    "latency": _compute_latency_stats(latencies),
                }

            # Cache stats
            cache_total = self.cache_hits + self.cache_misses
            cache_hit_rate = self.cache_hits / cache_total if cache_total > 0 else 0.0

            return {
                "requests": {
                    "total": total_requests,
                    "endpoints": endpoint_stats,
                },
                "errors": {
                    "total": total_errors,
                    "rate": total_errors / total_requests if total_requests > 0 else 0.0,
                },
                "database": {
                    "query_count": self.db_query_count,
                    "latency": _compute_latency_stats(self.db_query_latency),
                },
                "cache": {
                    "hits": self.cache_hits,
                    "misses": self.cache_misses,
                    "hit_rate": round(cache_hit_rate, 3),
                },
            }

    def reset(self) -> None:
        """Reset all metrics."""
        with self._lock:
            self.request_count.clear()
            self.request_latency.clear()
            self.error_count.clear()
            self.db_query_count = 0
            self.db_query_latency.clear()
            self.cache_hits = 0
            self.cache_misses = 0


def _compute_latency_stats(latencies: list[float]) -> dict[str, float]:
    """Compute latency statistics."""
    if not latencies:
        return {"min": 0, "max": 0, "avg": 0, "p50": 0, "p95": 0, "p99": 0}

    sorted_latencies = sorted(latencies)
    n = len(sorted_latencies)

    return {
        "min": round(sorted_latencies[0], 2),
        "max": round(sorted_latencies[-1], 2),
        "avg": round(sum(sorted_latencies) / n, 2),
        "p50": round(sorted_latencies[int(n * 0.5)], 2),
        "p95": round(sorted_latencies[min(int(n * 0.95), n - 1)], 2),
        "p99": round(sorted_latencies[min(int(n * 0.99), n - 1)], 2),
    }


# Global metrics collector instance
_metrics_collector: MetricsCollector | None = None
_metrics_lock = threading.Lock()


def get_metrics_collector() -> MetricsCollector:
    """Get the global metrics collector instance."""
    global _metrics_collector
    if _metrics_collector is None:
        with _metrics_lock:
            if _metrics_collector is None:
                _metrics_collector = MetricsCollector()
    return _metrics_collector


class MetricsTimer:
    """Context manager for timing operations.

    Usage:
        with MetricsTimer() as timer:
            do_something()
        print(f"Took {timer.duration_ms}ms")
    """

    def __init__(self) -> None:
        self.start_time: float = 0
        self.end_time: float = 0

    def __enter__(self) -> "MetricsTimer":
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, *args: Any) -> None:
        self.end_time = time.perf_counter()

    @property
    def duration_ms(self) -> float:
        """Get duration in milliseconds."""
        return (self.end_time - self.start_time) * 1000
