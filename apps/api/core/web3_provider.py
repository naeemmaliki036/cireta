"""Web3 RPC provider with circuit breaker and fallback."""

from __future__ import annotations

import logging
import time
from enum import Enum

from web3 import Web3

from packages.common.core.config import settings

logger = logging.getLogger(__name__)

# Circuit breaker defaults
MAX_FAILURES = 5
FAILURE_WINDOW = 60  # seconds
OPEN_DURATION = 30  # seconds


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Circuit breaker for RPC calls.

    After MAX_FAILURES within FAILURE_WINDOW seconds, the circuit opens
    for OPEN_DURATION seconds. During open state, calls immediately fail
    with 503. After OPEN_DURATION, one test call is allowed (half-open).
    """

    def __init__(self) -> None:
        self.state = CircuitState.CLOSED
        self.failures: list[float] = []
        self.opened_at: float = 0.0

    def record_failure(self) -> None:
        now = time.monotonic()
        self.failures.append(now)
        # Prune old failures outside window
        cutoff = now - FAILURE_WINDOW
        self.failures = [t for t in self.failures if t > cutoff]

        if len(self.failures) >= MAX_FAILURES:
            self.state = CircuitState.OPEN
            self.opened_at = now
            logger.warning(
                "Circuit breaker OPEN: %d failures in %ds",
                len(self.failures),
                FAILURE_WINDOW,
            )

    def record_success(self) -> None:
        self.failures.clear()
        if self.state != CircuitState.CLOSED:
            logger.info("Circuit breaker CLOSED (recovered)")
        self.state = CircuitState.CLOSED

    def allow_request(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True

        now = time.monotonic()
        if self.state == CircuitState.OPEN:
            if now - self.opened_at >= OPEN_DURATION:
                self.state = CircuitState.HALF_OPEN
                logger.info("Circuit breaker HALF_OPEN: allowing test request")
                return True
            return False

        # HALF_OPEN: allow one test request
        return True

    @property
    def is_open(self) -> bool:
        return self.state == CircuitState.OPEN


# Singleton circuit breaker
_circuit = CircuitBreaker()


def get_circuit_breaker() -> CircuitBreaker:
    return _circuit


def get_web3_provider() -> Web3:
    """Get a Web3 instance, respecting the circuit breaker.

    Tries primary RPC first, falls back to secondary if configured.
    Raises ConnectionError if circuit is open and no fallback available.
    """
    cb = get_circuit_breaker()

    if cb.allow_request():
        try:
            w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url))
            if w3.is_connected():
                cb.record_success()
                return w3
            cb.record_failure()
        except Exception:
            cb.record_failure()

    # Try fallback RPC
    fallback_url = getattr(settings, "web3_fallback_rpc_url", "")
    if fallback_url:
        try:
            w3 = Web3(Web3.HTTPProvider(fallback_url))
            if w3.is_connected():
                logger.info("Using fallback RPC: %s", fallback_url[:30])
                return w3
        except Exception:
            logger.error("Fallback RPC also failed")

    if cb.is_open:
        raise ConnectionError("RPC circuit breaker is open — service temporarily unavailable")

    # Return primary anyway (may work for non-connection calls)
    return Web3(Web3.HTTPProvider(settings.web3_rpc_url))


def get_rpc_health() -> dict:
    """Get RPC connection health status for the health endpoint."""
    cb = get_circuit_breaker()
    primary_ok = False
    fallback_ok = False

    try:
        w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url))
        primary_ok = w3.is_connected()
    except Exception as e:
        logger.warning("Primary RPC health check failed: %s", e)

    fallback_url = getattr(settings, "web3_fallback_rpc_url", "")
    if fallback_url:
        try:
            w3 = Web3(Web3.HTTPProvider(fallback_url))
            fallback_ok = w3.is_connected()
        except Exception as e:
            logger.warning("Fallback RPC health check failed: %s", e)

    return {
        "circuit_state": cb.state.value,
        "primary_rpc": "connected" if primary_ok else "disconnected",
        "fallback_rpc": "connected" if fallback_ok else ("disconnected" if fallback_url else "not_configured"),
        "recent_failures": len(cb.failures),
    }
