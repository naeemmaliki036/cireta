"""Tests for Web3 RPC circuit breaker."""

import time
from unittest.mock import MagicMock, patch

from apps.api.core.web3_provider import (
    MAX_FAILURES,
    CircuitBreaker,
    CircuitState,
    get_rpc_health,
)


def test_circuit_starts_closed() -> None:
    cb = CircuitBreaker()
    assert cb.state == CircuitState.CLOSED
    assert cb.allow_request() is True


def test_circuit_opens_after_max_failures() -> None:
    cb = CircuitBreaker()
    for _ in range(MAX_FAILURES):
        cb.record_failure()
    assert cb.state == CircuitState.OPEN
    assert cb.allow_request() is False


def test_circuit_closes_on_success() -> None:
    cb = CircuitBreaker()
    for _ in range(MAX_FAILURES):
        cb.record_failure()
    assert cb.state == CircuitState.OPEN

    # Simulate time passing to half-open
    cb.opened_at = time.monotonic() - 31
    assert cb.allow_request() is True
    assert cb.state == CircuitState.HALF_OPEN

    cb.record_success()
    assert cb.state == CircuitState.CLOSED
    assert cb.allow_request() is True


def test_circuit_half_open_after_timeout() -> None:
    cb = CircuitBreaker()
    for _ in range(MAX_FAILURES):
        cb.record_failure()
    assert cb.state == CircuitState.OPEN

    # Move time forward past open duration
    cb.opened_at = time.monotonic() - 31
    assert cb.allow_request() is True
    assert cb.state == CircuitState.HALF_OPEN


def test_circuit_stays_open_before_timeout() -> None:
    cb = CircuitBreaker()
    for _ in range(MAX_FAILURES):
        cb.record_failure()
    # Don't advance time
    assert cb.allow_request() is False


def test_failures_pruned_outside_window() -> None:
    cb = CircuitBreaker()
    # Add 4 old failures (outside window)
    old_time = time.monotonic() - 120
    cb.failures = [old_time] * 4
    # Add 1 new failure
    cb.record_failure()
    # Old failures should be pruned, circuit should stay closed
    assert cb.state == CircuitState.CLOSED


def test_record_success_clears_failures() -> None:
    cb = CircuitBreaker()
    cb.record_failure()
    cb.record_failure()
    assert len(cb.failures) == 2
    cb.record_success()
    assert len(cb.failures) == 0


def test_is_open_property() -> None:
    cb = CircuitBreaker()
    assert cb.is_open is False
    for _ in range(MAX_FAILURES):
        cb.record_failure()
    assert cb.is_open is True


def test_get_rpc_health_returns_dict() -> None:
    """get_rpc_health returns expected structure."""
    with patch("apps.api.core.web3_provider.Web3") as mock_web3:
        mock_instance = MagicMock()
        mock_instance.is_connected.return_value = False
        mock_web3.return_value = mock_instance
        mock_web3.HTTPProvider = MagicMock()

        health = get_rpc_health()
        assert "circuit_state" in health
        assert "primary_rpc" in health
        assert health["circuit_state"] in ("closed", "open", "half_open")
