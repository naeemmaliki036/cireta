"""Unit tests for identity sync worker tasks (task_sync_wallet, task_sync_identity,
_process_pending_identity_sync_jobs).

All on-chain calls are mocked via the SimpleIdentityBridgeService.
DB sessions are mocked using the same pattern as test_webhook_retry.py.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, call, patch
from uuid import uuid4

import pytest

from apps.api.models.enums import (
    IdentitySyncJobAction,
    IdentitySyncJobStatus,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TX_HASH = "0xabc123def456"


def _make_job(
    *,
    action: str = IdentitySyncJobAction.ADD,
    status: str = IdentitySyncJobStatus.PENDING,
    attempts: int = 0,
    wallet_id: str | None = None,
    wallet_address_snapshot: str | None = None,
) -> MagicMock:
    """Create a mock IdentitySyncJob row."""
    job = MagicMock()
    job.id = uuid4()
    job.user_id = uuid4()
    job.wallet_id = wallet_id or uuid4()
    job.wallet_address_snapshot = wallet_address_snapshot
    job.action = action
    job.status = status
    job.attempts = attempts
    job.started_at = None
    job.completed_at = None
    job.tx_hash = None
    job.last_error = None
    job.enqueued_at = datetime.now(UTC)
    return job


def _make_wallet(*, registered: bool = False, address: str = "0xDeaD0000") -> MagicMock:
    wallet = MagicMock()
    wallet.id = uuid4()
    wallet.address_checksum = address
    wallet.registered_on_chain = registered
    return wallet


def _make_user(wallets: list | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uuid4()
    user.wallets = wallets or []
    return user


def _mock_session_with_lookups(
    job: MagicMock,
    user: MagicMock | None = None,
    wallet: MagicMock | None = None,
) -> AsyncMock:
    """Build a mock AsyncSession whose .execute() returns the right objects
    depending on the query (job first, then user, then wallet)."""
    db = AsyncMock()

    call_count = {"n": 0}

    async def _execute(stmt, *_a, **_kw):  # noqa: ARG001
        result = MagicMock()
        idx = call_count["n"]
        call_count["n"] += 1
        if idx == 0:
            # First query: job lookup
            result.scalar_one_or_none.return_value = job
        elif idx == 1:
            # Second query: user lookup (for ADD) or wallet lookup (for REMOVE)
            if user is not None:
                result.scalar_one_or_none.return_value = user
            elif wallet is not None:
                result.scalar_one_or_none.return_value = wallet
            else:
                result.scalar_one_or_none.return_value = None
        elif idx == 2:
            # Third query: wallet lookup (for ADD path, after user)
            result.scalar_one_or_none.return_value = wallet
        else:
            result.scalar_one_or_none.return_value = None
        return result

    db.execute = AsyncMock(side_effect=_execute)
    db.commit = AsyncMock()
    db.add = MagicMock()
    return db


def _patch_session(db: AsyncMock):
    """Return a context-manager patch for AsyncSessionLocal that yields *db*."""
    mock_cls = MagicMock()
    mock_cls.return_value.__aenter__ = AsyncMock(return_value=db)
    mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
    return patch("packages.common.db.session.AsyncSessionLocal", mock_cls)


# =========================================================================
# task_sync_wallet — ADD flow
# =========================================================================


class TestTaskSyncWalletAdd:
    """task_sync_wallet with action=ADD."""

    async def test_add_registers_wallet_and_succeeds(self) -> None:
        """Happy path: bridge.register_wallet is called, job transitions
        pending -> running -> succeeded, tx_hash is saved."""
        wallet = _make_wallet()
        user = _make_user(wallets=[wallet])
        job = _make_job(action=IdentitySyncJobAction.ADD, wallet_id=wallet.id)

        db = _mock_session_with_lookups(job, user=user, wallet=wallet)

        with _patch_session(db), patch(
            "apps.api.services.simple_identity_bridge_service.SimpleIdentityBridgeService"
        ) as mock_bridge_cls:
            mock_bridge = AsyncMock()
            mock_bridge.register_wallet = AsyncMock(
                return_value={"tx_hash": TX_HASH}
            )
            mock_bridge_cls.return_value = mock_bridge

            from apps.api.workers.tasks import task_sync_wallet

            await task_sync_wallet({}, str(job.id))

        # Verify status transitions
        assert job.status == IdentitySyncJobStatus.SUCCEEDED
        assert job.tx_hash == TX_HASH
        assert job.completed_at is not None
        assert job.last_error is None
        assert job.attempts == 1
        assert wallet.registered_on_chain is True

    async def test_add_skips_already_registered_wallet(self) -> None:
        """If wallet.registered_on_chain is already True, job still succeeds
        but no bridge call is made."""
        wallet = _make_wallet(registered=True)
        user = _make_user(wallets=[wallet])
        job = _make_job(action=IdentitySyncJobAction.ADD, wallet_id=wallet.id)

        db = _mock_session_with_lookups(job, user=user, wallet=wallet)

        with _patch_session(db), patch(
            "apps.api.services.simple_identity_bridge_service.SimpleIdentityBridgeService"
        ) as mock_bridge_cls:
            mock_bridge = AsyncMock()
            mock_bridge.register_wallet = AsyncMock()
            mock_bridge_cls.return_value = mock_bridge

            from apps.api.workers.tasks import task_sync_wallet

            await task_sync_wallet({}, str(job.id))

        assert job.status == IdentitySyncJobStatus.SUCCEEDED
        # register_wallet should NOT have been called
        mock_bridge.register_wallet.assert_not_called()


# =========================================================================
# task_sync_wallet — REMOVE flow
# =========================================================================


class TestTaskSyncWalletRemove:
    """task_sync_wallet with action=REMOVE."""

    async def test_remove_revokes_wallet_and_succeeds(self) -> None:
        """Happy path: bridge.revoke_wallet is called, job succeeds."""
        wallet = _make_wallet(registered=True, address="0xCafe0001")
        job = _make_job(
            action=IdentitySyncJobAction.REMOVE,
            wallet_id=wallet.id,
        )

        db = _mock_session_with_lookups(job, wallet=wallet)

        with _patch_session(db), patch(
            "apps.api.services.simple_identity_bridge_service.SimpleIdentityBridgeService"
        ) as mock_bridge_cls:
            mock_bridge = AsyncMock()
            mock_bridge.revoke_wallet = AsyncMock(
                return_value={"tx_hash": TX_HASH}
            )
            mock_bridge_cls.return_value = mock_bridge

            from apps.api.workers.tasks import task_sync_wallet

            await task_sync_wallet({}, str(job.id))

        assert job.status == IdentitySyncJobStatus.SUCCEEDED
        assert job.tx_hash == TX_HASH
        mock_bridge.revoke_wallet.assert_called_once_with(wallet.address_checksum)
        assert wallet.registered_on_chain is False

    async def test_remove_uses_snapshot_when_wallet_row_deleted(self) -> None:
        """When the Wallet row is gone (ON DELETE SET NULL), the worker falls
        back to wallet_address_snapshot."""
        snapshot_addr = "0xBEEF0002"
        job = _make_job(
            action=IdentitySyncJobAction.REMOVE,
            wallet_id=None,  # FK nulled out
            wallet_address_snapshot=snapshot_addr,
        )

        # DB returns job, then None for wallet lookup
        db = _mock_session_with_lookups(job, wallet=None)

        with _patch_session(db), patch(
            "apps.api.services.simple_identity_bridge_service.SimpleIdentityBridgeService"
        ) as mock_bridge_cls:
            mock_bridge = AsyncMock()
            mock_bridge.revoke_wallet = AsyncMock(
                return_value={"tx_hash": TX_HASH}
            )
            mock_bridge_cls.return_value = mock_bridge

            from apps.api.workers.tasks import task_sync_wallet

            await task_sync_wallet({}, str(job.id))

        assert job.status == IdentitySyncJobStatus.SUCCEEDED
        mock_bridge.revoke_wallet.assert_called_once_with(snapshot_addr)


# =========================================================================
# task_sync_wallet — idempotency
# =========================================================================


class TestTaskSyncWalletIdempotency:
    """Jobs in terminal state are skipped."""

    async def test_already_succeeded_job_is_skipped(self) -> None:
        """A job with status=SUCCEEDED is a no-op."""
        job = _make_job(status=IdentitySyncJobStatus.SUCCEEDED)

        db = _mock_session_with_lookups(job)

        with _patch_session(db), patch(
            "apps.api.services.simple_identity_bridge_service.SimpleIdentityBridgeService"
        ) as mock_bridge_cls:
            mock_bridge = AsyncMock()
            mock_bridge_cls.return_value = mock_bridge

            from apps.api.workers.tasks import task_sync_wallet

            await task_sync_wallet({}, str(job.id))

        # Bridge should never have been instantiated for real work
        mock_bridge.register_wallet.assert_not_called()
        mock_bridge.revoke_wallet.assert_not_called()
        # Status unchanged
        assert job.status == IdentitySyncJobStatus.SUCCEEDED

    async def test_already_failed_job_is_skipped(self) -> None:
        """A job with status=FAILED is a no-op."""
        job = _make_job(status=IdentitySyncJobStatus.FAILED, attempts=3)

        db = _mock_session_with_lookups(job)

        with _patch_session(db), patch(
            "apps.api.services.simple_identity_bridge_service.SimpleIdentityBridgeService"
        ) as mock_bridge_cls:
            mock_bridge = AsyncMock()
            mock_bridge_cls.return_value = mock_bridge

            from apps.api.workers.tasks import task_sync_wallet

            await task_sync_wallet({}, str(job.id))

        assert job.status == IdentitySyncJobStatus.FAILED

    async def test_missing_job_is_noop(self) -> None:
        """If the job row doesn't exist, the task returns silently."""
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=result)
        db.commit = AsyncMock()

        with _patch_session(db):
            from apps.api.workers.tasks import task_sync_wallet

            # Should not raise
            await task_sync_wallet({}, str(uuid4()))


# =========================================================================
# task_sync_wallet — failure & dead-letter
# =========================================================================


class TestTaskSyncWalletFailure:
    """Bridge errors: retry logic and dead-letter."""

    async def test_bridge_error_sets_pending_and_reraises(self) -> None:
        """On first failure (attempt 1 of 3), job goes back to PENDING and
        the exception is re-raised so arq retries."""
        wallet = _make_wallet()
        user = _make_user(wallets=[wallet])
        job = _make_job(
            action=IdentitySyncJobAction.ADD,
            wallet_id=wallet.id,
            attempts=0,
        )

        db = _mock_session_with_lookups(job, user=user, wallet=wallet)

        with _patch_session(db), patch(
            "apps.api.services.simple_identity_bridge_service.SimpleIdentityBridgeService"
        ) as mock_bridge_cls:
            mock_bridge = AsyncMock()
            mock_bridge.register_wallet = AsyncMock(
                side_effect=RuntimeError("RPC timeout")
            )
            mock_bridge_cls.return_value = mock_bridge

            from apps.api.workers.tasks import task_sync_wallet

            with pytest.raises(RuntimeError, match="RPC timeout"):
                await task_sync_wallet({}, str(job.id))

        assert job.status == IdentitySyncJobStatus.PENDING
        assert job.attempts == 1
        assert "RPC timeout" in job.last_error

    async def test_dead_letter_after_3_attempts(self) -> None:
        """After the 3rd failure, job status becomes FAILED and an audit log
        row is written."""
        wallet = _make_wallet()
        user = _make_user(wallets=[wallet])
        job = _make_job(
            action=IdentitySyncJobAction.ADD,
            wallet_id=wallet.id,
            attempts=2,  # Will become 3 on this run
        )

        db = _mock_session_with_lookups(job, user=user, wallet=wallet)

        with _patch_session(db), patch(
            "apps.api.services.simple_identity_bridge_service.SimpleIdentityBridgeService"
        ) as mock_bridge_cls, patch(
            "apps.api.workers.tasks._record_identity_sync_failure",
            new_callable=AsyncMock,
        ) as mock_record:
            mock_bridge = AsyncMock()
            mock_bridge.register_wallet = AsyncMock(
                side_effect=RuntimeError("permanent failure")
            )
            mock_bridge_cls.return_value = mock_bridge

            from apps.api.workers.tasks import task_sync_wallet

            with pytest.raises(RuntimeError, match="permanent failure"):
                await task_sync_wallet({}, str(job.id))

        assert job.status == IdentitySyncJobStatus.FAILED
        assert job.attempts == 3
        assert job.completed_at is not None
        # Audit log recorder was called
        mock_record.assert_called_once()

    async def test_error_message_truncated_to_500(self) -> None:
        """last_error is capped at 500 characters."""
        wallet = _make_wallet()
        user = _make_user(wallets=[wallet])
        job = _make_job(
            action=IdentitySyncJobAction.ADD,
            wallet_id=wallet.id,
        )

        db = _mock_session_with_lookups(job, user=user, wallet=wallet)

        long_msg = "x" * 1000

        with _patch_session(db), patch(
            "apps.api.services.simple_identity_bridge_service.SimpleIdentityBridgeService"
        ) as mock_bridge_cls:
            mock_bridge = AsyncMock()
            mock_bridge.register_wallet = AsyncMock(
                side_effect=RuntimeError(long_msg)
            )
            mock_bridge_cls.return_value = mock_bridge

            from apps.api.workers.tasks import task_sync_wallet

            with pytest.raises(RuntimeError):
                await task_sync_wallet({}, str(job.id))

        assert len(job.last_error) == 500


# =========================================================================
# task_sync_identity
# =========================================================================


class TestTaskSyncIdentity:
    """task_sync_identity — provisions the full wallet set."""

    async def test_provision_succeeds(self) -> None:
        """Happy path: bridge.provision_identity is called, job succeeds."""
        job = _make_job(action=IdentitySyncJobAction.PROVISION)

        db = _mock_session_with_lookups(job)

        with _patch_session(db), patch(
            "apps.api.services.simple_identity_bridge_service.SimpleIdentityBridgeService"
        ) as mock_bridge_cls:
            mock_bridge = AsyncMock()
            mock_bridge.provision_identity = AsyncMock(
                return_value={
                    "registered_wallets": ["0xA", "0xB"],
                    "tx_hash": TX_HASH,
                }
            )
            mock_bridge_cls.return_value = mock_bridge

            from apps.api.workers.tasks import task_sync_identity

            await task_sync_identity({}, str(job.id))

        assert job.status == IdentitySyncJobStatus.SUCCEEDED
        assert job.tx_hash == TX_HASH
        assert job.completed_at is not None
        mock_bridge.provision_identity.assert_called_once_with(job.user_id)

    async def test_provision_failure_retries(self) -> None:
        """First failure resets to PENDING so arq picks it up again."""
        job = _make_job(
            action=IdentitySyncJobAction.PROVISION,
            attempts=0,
        )

        db = _mock_session_with_lookups(job)

        with _patch_session(db), patch(
            "apps.api.services.simple_identity_bridge_service.SimpleIdentityBridgeService"
        ) as mock_bridge_cls:
            mock_bridge = AsyncMock()
            mock_bridge.provision_identity = AsyncMock(
                side_effect=RuntimeError("chain down")
            )
            mock_bridge_cls.return_value = mock_bridge

            from apps.api.workers.tasks import task_sync_identity

            with pytest.raises(RuntimeError, match="chain down"):
                await task_sync_identity({}, str(job.id))

        assert job.status == IdentitySyncJobStatus.PENDING
        assert job.attempts == 1

    async def test_provision_dead_letter(self) -> None:
        """After 3 failures, job is marked FAILED."""
        job = _make_job(
            action=IdentitySyncJobAction.PROVISION,
            attempts=2,
        )

        db = _mock_session_with_lookups(job)

        with _patch_session(db), patch(
            "apps.api.services.simple_identity_bridge_service.SimpleIdentityBridgeService"
        ) as mock_bridge_cls, patch(
            "apps.api.workers.tasks._record_identity_sync_failure",
            new_callable=AsyncMock,
        ) as mock_record:
            mock_bridge = AsyncMock()
            mock_bridge.provision_identity = AsyncMock(
                side_effect=RuntimeError("permanent")
            )
            mock_bridge_cls.return_value = mock_bridge

            from apps.api.workers.tasks import task_sync_identity

            with pytest.raises(RuntimeError):
                await task_sync_identity({}, str(job.id))

        assert job.status == IdentitySyncJobStatus.FAILED
        assert job.attempts == 3
        mock_record.assert_called_once()

    async def test_idempotent_on_succeeded(self) -> None:
        """Already-succeeded job is a no-op."""
        job = _make_job(
            action=IdentitySyncJobAction.PROVISION,
            status=IdentitySyncJobStatus.SUCCEEDED,
        )

        db = _mock_session_with_lookups(job)

        with _patch_session(db):
            from apps.api.workers.tasks import task_sync_identity

            await task_sync_identity({}, str(job.id))

        # Status unchanged, no bridge call
        assert job.status == IdentitySyncJobStatus.SUCCEEDED


# =========================================================================
# _process_pending_identity_sync_jobs (sweep loop)
# =========================================================================


class TestIdentitySyncSweep:
    """_process_pending_identity_sync_jobs picks up stale PENDING jobs."""

    async def test_sweep_enqueues_pending_provision_job(self) -> None:
        """PROVISION jobs are enqueued as task_sync_identity."""
        job = MagicMock()
        job.id = uuid4()
        job.action = IdentitySyncJobAction.PROVISION

        mock_db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = [job]
        mock_db.execute = AsyncMock(return_value=result)

        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock()

        with patch("arq.create_pool", new_callable=AsyncMock, return_value=mock_pool), patch(
            "packages.common.core.config.settings"
        ) as mock_settings:
            mock_settings.redis_url = "redis://localhost"

            from apps.api.workers.tasks import _process_pending_identity_sync_jobs

            count = await _process_pending_identity_sync_jobs(mock_db)

        assert count == 1
        mock_pool.enqueue_job.assert_called_once_with(
            "task_sync_identity", str(job.id)
        )

    async def test_sweep_enqueues_pending_add_job(self) -> None:
        """ADD jobs are enqueued as task_sync_wallet."""
        job = MagicMock()
        job.id = uuid4()
        job.action = IdentitySyncJobAction.ADD

        mock_db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = [job]
        mock_db.execute = AsyncMock(return_value=result)

        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock()

        with patch("arq.create_pool", new_callable=AsyncMock, return_value=mock_pool), patch(
            "packages.common.core.config.settings"
        ) as mock_settings:
            mock_settings.redis_url = "redis://localhost"

            from apps.api.workers.tasks import _process_pending_identity_sync_jobs

            count = await _process_pending_identity_sync_jobs(mock_db)

        assert count == 1
        mock_pool.enqueue_job.assert_called_once_with(
            "task_sync_wallet", str(job.id)
        )

    async def test_sweep_enqueues_pending_remove_job(self) -> None:
        """REMOVE jobs are enqueued as task_sync_wallet."""
        job = MagicMock()
        job.id = uuid4()
        job.action = IdentitySyncJobAction.REMOVE

        mock_db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = [job]
        mock_db.execute = AsyncMock(return_value=result)

        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock()

        with patch("arq.create_pool", new_callable=AsyncMock, return_value=mock_pool), patch(
            "packages.common.core.config.settings"
        ) as mock_settings:
            mock_settings.redis_url = "redis://localhost"

            from apps.api.workers.tasks import _process_pending_identity_sync_jobs

            count = await _process_pending_identity_sync_jobs(mock_db)

        assert count == 1
        mock_pool.enqueue_job.assert_called_once_with(
            "task_sync_wallet", str(job.id)
        )

    async def test_sweep_returns_zero_when_no_pending(self) -> None:
        """No pending jobs means no enqueues."""
        mock_db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(return_value=result)

        from apps.api.workers.tasks import _process_pending_identity_sync_jobs

        count = await _process_pending_identity_sync_jobs(mock_db)
        assert count == 0

    async def test_sweep_handles_redis_unavailable(self) -> None:
        """If Redis is down, sweep returns 0 and doesn't crash."""
        job = MagicMock()
        job.id = uuid4()
        job.action = IdentitySyncJobAction.ADD

        mock_db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = [job]
        mock_db.execute = AsyncMock(return_value=result)

        with patch(
            "arq.create_pool",
            new_callable=AsyncMock,
            side_effect=ConnectionError("Redis down"),
        ), patch("packages.common.core.config.settings") as mock_settings:
            mock_settings.redis_url = "redis://localhost"

            from apps.api.workers.tasks import _process_pending_identity_sync_jobs

            count = await _process_pending_identity_sync_jobs(mock_db)

        assert count == 0

    async def test_sweep_processes_multiple_jobs(self) -> None:
        """Multiple pending jobs are all enqueued."""
        jobs = []
        for action in (
            IdentitySyncJobAction.PROVISION,
            IdentitySyncJobAction.ADD,
            IdentitySyncJobAction.REMOVE,
        ):
            j = MagicMock()
            j.id = uuid4()
            j.action = action
            jobs.append(j)

        mock_db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = jobs
        mock_db.execute = AsyncMock(return_value=result)

        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock()

        with patch("arq.create_pool", new_callable=AsyncMock, return_value=mock_pool), patch(
            "packages.common.core.config.settings"
        ) as mock_settings:
            mock_settings.redis_url = "redis://localhost"

            from apps.api.workers.tasks import _process_pending_identity_sync_jobs

            count = await _process_pending_identity_sync_jobs(mock_db)

        assert count == 3
        assert mock_pool.enqueue_job.call_count == 3


# =========================================================================
# _record_identity_sync_failure
# =========================================================================


class TestRecordIdentitySyncFailure:
    """Audit log recording on dead-letter."""

    async def test_records_audit_log_row(self) -> None:
        """An AuditLog row is added to the session."""
        job = _make_job(action=IdentitySyncJobAction.ADD, attempts=3)
        db = MagicMock()

        from apps.api.workers.tasks import _record_identity_sync_failure

        await _record_identity_sync_failure(db, job, "some error")

        db.add.assert_called_once()
        audit_row = db.add.call_args[0][0]
        assert audit_row.action == f"identity_sync_failed_{job.action}"
        assert audit_row.target_type == "identity_sync_job"
        assert audit_row.target_id == str(job.id)
        assert "some error" in audit_row.payload["error"]

    async def test_does_not_raise_on_internal_error(self) -> None:
        """If the audit log write itself fails, the error is swallowed."""
        job = _make_job()
        db = MagicMock()
        db.add.side_effect = RuntimeError("db write fail")

        from apps.api.workers.tasks import _record_identity_sync_failure

        # Should not raise
        await _record_identity_sync_failure(db, job, "outer error")
