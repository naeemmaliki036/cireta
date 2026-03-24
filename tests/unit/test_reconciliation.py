"""Unit tests for task_reconcile_balances in tasks.py."""

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest


def _make_contribution(wallet_address, token_contract, tokens_allocated):
    """Create a mock Contribution with sale.token for reconciliation."""
    mock_token = MagicMock()
    mock_token.contract_address = token_contract

    mock_sale = MagicMock()
    mock_sale.token = mock_token

    contrib = MagicMock()
    contrib.wallet_address = wallet_address
    contrib.tokens_allocated = tokens_allocated
    contrib.sale = mock_sale

    return contrib


class TestTaskReconcileBalances:
    """Tests for task_reconcile_balances."""

    async def test_detects_balance_mismatch(self) -> None:
        """Logs discrepancy when DB balance != on-chain balance."""
        contrib = _make_contribution(
            "0x" + "aa" * 20,
            "0x" + "bb" * 20,
            Decimal("1000"),
        )

        mock_web3_svc = AsyncMock()
        mock_web3_svc.get_token_balance = AsyncMock(return_value=Decimal("900"))

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls, patch(
            "apps.api.services.web3_base_service.Web3BaseService",
            return_value=mock_web3_svc,
        ):
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [contrib]
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()
            mock_db.add = MagicMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from apps.api.workers.tasks import task_reconcile_balances

            await task_reconcile_balances({})

        # AuditLog should be created
        mock_db.add.assert_called_once()
        audit_log = mock_db.add.call_args[0][0]
        assert audit_log.action == "balance_discrepancy"
        assert audit_log.target_type == "wallet"
        assert audit_log.payload["difference"] == "100"
        mock_db.commit.assert_called_once()

    async def test_ignores_dust_below_threshold(self) -> None:
        """Differences < 0.001 are ignored as dust."""
        contrib = _make_contribution(
            "0x" + "cc" * 20,
            "0x" + "dd" * 20,
            Decimal("1000.0005"),
        )

        mock_web3_svc = AsyncMock()
        mock_web3_svc.get_token_balance = AsyncMock(return_value=Decimal("1000.0001"))

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls, patch(
            "apps.api.services.web3_base_service.Web3BaseService",
            return_value=mock_web3_svc,
        ):
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [contrib]
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()
            mock_db.add = MagicMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from apps.api.workers.tasks import task_reconcile_balances

            await task_reconcile_balances({})

        # No audit log created for dust
        mock_db.add.assert_not_called()
        # No commit needed when no discrepancies
        mock_db.commit.assert_not_called()

    async def test_handles_web3_call_failure_gracefully(self) -> None:
        """Web3 call failure is caught, not raised."""
        contrib = _make_contribution(
            "0x" + "ee" * 20,
            "0x" + "ff" * 20,
            Decimal("500"),
        )

        mock_web3_svc = AsyncMock()
        mock_web3_svc.get_token_balance = AsyncMock(
            side_effect=Exception("RPC timeout")
        )

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls, patch(
            "apps.api.services.web3_base_service.Web3BaseService",
            return_value=mock_web3_svc,
        ):
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [contrib]
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()
            mock_db.add = MagicMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from apps.api.workers.tasks import task_reconcile_balances

            # Should not raise
            await task_reconcile_balances({})

        # No audit log on failure — just skip
        mock_db.add.assert_not_called()

    async def test_no_claimed_contributions(self) -> None:
        """No claimed contributions means nothing to reconcile."""
        mock_web3_svc = AsyncMock()

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls, patch(
            "apps.api.services.web3_base_service.Web3BaseService",
            return_value=mock_web3_svc,
        ):
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = []
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from apps.api.workers.tasks import task_reconcile_balances

            await task_reconcile_balances({})

        mock_web3_svc.get_token_balance.assert_not_called()

    async def test_exact_match_no_discrepancy(self) -> None:
        """When DB and chain match exactly, no audit log."""
        contrib = _make_contribution(
            "0x" + "11" * 20,
            "0x" + "22" * 20,
            Decimal("5000"),
        )

        mock_web3_svc = AsyncMock()
        mock_web3_svc.get_token_balance = AsyncMock(return_value=Decimal("5000"))

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls, patch(
            "apps.api.services.web3_base_service.Web3BaseService",
            return_value=mock_web3_svc,
        ):
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [contrib]
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()
            mock_db.add = MagicMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from apps.api.workers.tasks import task_reconcile_balances

            await task_reconcile_balances({})

        mock_db.add.assert_not_called()

    async def test_aggregates_multiple_contributions_same_wallet(self) -> None:
        """Multiple contributions for same wallet+token are summed."""
        wallet = "0x" + "33" * 20
        token = "0x" + "44" * 20

        contrib1 = _make_contribution(wallet, token, Decimal("300"))
        contrib2 = _make_contribution(wallet, token, Decimal("700"))

        mock_web3_svc = AsyncMock()
        # On-chain shows 800 but DB total is 1000 → mismatch
        mock_web3_svc.get_token_balance = AsyncMock(return_value=Decimal("800"))

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls, patch(
            "apps.api.services.web3_base_service.Web3BaseService",
            return_value=mock_web3_svc,
        ):
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [contrib1, contrib2]
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()
            mock_db.add = MagicMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from apps.api.workers.tasks import task_reconcile_balances

            await task_reconcile_balances({})

        mock_db.add.assert_called_once()
        audit_log = mock_db.add.call_args[0][0]
        assert audit_log.payload["db_balance"] == "1000"
        assert audit_log.payload["on_chain_balance"] == "800"
        assert audit_log.payload["difference"] == "200"

    async def test_skips_contributions_without_token_contract(self) -> None:
        """Contributions where token has no contract_address are skipped."""
        mock_token = MagicMock()
        mock_token.contract_address = None

        mock_sale = MagicMock()
        mock_sale.token = mock_token

        contrib = MagicMock()
        contrib.wallet_address = "0x" + "55" * 20
        contrib.tokens_allocated = Decimal("100")
        contrib.sale = mock_sale

        mock_web3_svc = AsyncMock()

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls, patch(
            "apps.api.services.web3_base_service.Web3BaseService",
            return_value=mock_web3_svc,
        ):
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [contrib]
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from apps.api.workers.tasks import task_reconcile_balances

            await task_reconcile_balances({})

        mock_web3_svc.get_token_balance.assert_not_called()

    async def test_skips_contributions_without_sale(self) -> None:
        """Contributions with no sale association are skipped."""
        contrib = MagicMock()
        contrib.wallet_address = "0x" + "66" * 20
        contrib.tokens_allocated = Decimal("100")
        contrib.sale = None

        mock_web3_svc = AsyncMock()

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls, patch(
            "apps.api.services.web3_base_service.Web3BaseService",
            return_value=mock_web3_svc,
        ):
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [contrib]
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from apps.api.workers.tasks import task_reconcile_balances

            await task_reconcile_balances({})

        mock_web3_svc.get_token_balance.assert_not_called()

    async def test_audit_log_fields(self) -> None:
        """Verify audit log has correct field structure."""
        contrib = _make_contribution(
            "0x" + "77" * 20,
            "0x" + "88" * 20,
            Decimal("2000"),
        )

        mock_web3_svc = AsyncMock()
        mock_web3_svc.get_token_balance = AsyncMock(return_value=Decimal("1500"))

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls, patch(
            "apps.api.services.web3_base_service.Web3BaseService",
            return_value=mock_web3_svc,
        ):
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [contrib]
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()
            mock_db.add = MagicMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from apps.api.workers.tasks import task_reconcile_balances

            await task_reconcile_balances({})

        audit_log = mock_db.add.call_args[0][0]
        assert audit_log.action == "balance_discrepancy"
        assert audit_log.target_type == "wallet"
        assert audit_log.target_id == "0x" + "77" * 20
        assert "token_address" in audit_log.payload
        assert "db_balance" in audit_log.payload
        assert "on_chain_balance" in audit_log.payload
        assert "difference" in audit_log.payload

    async def test_boundary_dust_exactly_at_threshold(self) -> None:
        """Difference of exactly 0.001 is still a discrepancy."""
        contrib = _make_contribution(
            "0x" + "99" * 20,
            "0x" + "aa" * 20,
            Decimal("1000.001"),
        )

        mock_web3_svc = AsyncMock()
        mock_web3_svc.get_token_balance = AsyncMock(return_value=Decimal("1000"))

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls, patch(
            "apps.api.services.web3_base_service.Web3BaseService",
            return_value=mock_web3_svc,
        ):
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [contrib]
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()
            mock_db.add = MagicMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            from apps.api.workers.tasks import task_reconcile_balances

            await task_reconcile_balances({})

        # 0.001 == 0.001 → NOT > 0.001, so no discrepancy
        mock_db.add.assert_not_called()
