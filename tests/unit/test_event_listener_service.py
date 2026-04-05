"""Unit tests for EventListenerService."""

import asyncio
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.contribution import Contribution
from apps.api.models.enums import ContributionStatus, SaleStatus
from apps.api.models.token import Token
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User
from apps.api.services.event_listener_service import (
    REDIS_LAST_BLOCK_KEY,
    EventListenerService,
)


@pytest.fixture
def mock_web3():
    """Create a mock Web3 instance."""
    w3 = MagicMock()
    w3.eth.get_block_number = MagicMock(return_value=1000)
    return w3


@pytest.fixture
def event_service(mock_web3):
    """Create EventListenerService with mocked Web3."""
    with patch(
        "apps.api.services.event_listener_service.Web3"
    ) as mock_web3_cls:
        mock_web3_cls.return_value = mock_web3
        mock_web3_cls.HTTPProvider = MagicMock()
        mock_web3_cls.to_checksum_address = lambda x: x
        svc = EventListenerService()
        svc.w3 = mock_web3
        return svc


class TestGetLastSyncedBlock:
    """Tests for get_last_synced_block."""

    async def test_reads_from_redis(self, event_service) -> None:
        """Returns block number stored in Redis."""
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=b"950")
        mock_redis.aclose = AsyncMock()

        with patch("redis.asyncio.from_url", return_value=mock_redis):
            result = await event_service.get_last_synced_block()

        assert result == 950
        mock_redis.get.assert_called_once_with(REDIS_LAST_BLOCK_KEY)

    async def test_fallback_when_redis_unavailable(self, event_service) -> None:
        """Falls back to latest-100 when Redis is down."""
        event_service.w3.eth.get_block_number = MagicMock(return_value=5000)

        with patch("redis.asyncio.from_url", side_effect=Exception("Connection refused")):
            result = await event_service.get_last_synced_block()

        assert result == 4900

    async def test_fallback_when_redis_returns_none(self, event_service) -> None:
        """Falls back when Redis key doesn't exist."""
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=None)
        mock_redis.aclose = AsyncMock()
        event_service.w3.eth.get_block_number = MagicMock(return_value=2000)

        with patch("redis.asyncio.from_url", return_value=mock_redis):
            result = await event_service.get_last_synced_block()

        assert result == 1900

    async def test_fallback_clamps_to_zero(self, event_service) -> None:
        """If latest block < 100, fallback clamps to 0."""
        event_service.w3.eth.get_block_number = MagicMock(return_value=50)

        with patch("redis.asyncio.from_url", side_effect=Exception("down")):
            result = await event_service.get_last_synced_block()

        assert result == 0


class TestSetLastSyncedBlock:
    """Tests for set_last_synced_block."""

    async def test_writes_to_redis(self, event_service) -> None:
        """Stores block number in Redis."""
        mock_redis = AsyncMock()
        mock_redis.set = AsyncMock()
        mock_redis.aclose = AsyncMock()

        with patch("redis.asyncio.from_url", return_value=mock_redis):
            await event_service.set_last_synced_block(1234)

        mock_redis.set.assert_called_once_with(REDIS_LAST_BLOCK_KEY, "1234")

    async def test_redis_failure_does_not_raise(self, event_service) -> None:
        """Redis write failure is swallowed (logged only)."""
        with patch("redis.asyncio.from_url", side_effect=Exception("down")):
            # Should not raise
            await event_service.set_last_synced_block(999)


class TestPollEvents:
    """Tests for poll_events."""

    async def test_no_new_blocks_returns_zero(self, event_service) -> None:
        """When from_block >= latest, returns 0."""
        event_service.get_last_synced_block = AsyncMock(return_value=1000)
        event_service.w3.eth.get_block_number = MagicMock(return_value=1000)

        result = await event_service.poll_events()
        assert result == 0

    async def test_processes_sale_events(self, event_service) -> None:
        """Polls and processes sale events from contract addresses."""
        event_service.get_last_synced_block = AsyncMock(return_value=900)
        event_service.w3.eth.get_block_number = MagicMock(return_value=950)
        event_service._get_contract_addresses = AsyncMock(
            return_value=(["0x" + "aa" * 20], [], [])
        )
        event_service._poll_sale_events = AsyncMock(return_value=3)
        event_service._poll_transfer_events = AsyncMock(return_value=0)
        event_service._poll_fraction_events = AsyncMock(return_value=0)
        event_service.set_last_synced_block = AsyncMock()

        result = await event_service.poll_events()

        assert result == 3
        event_service._poll_sale_events.assert_called_once()
        event_service.set_last_synced_block.assert_called_once_with(950)

    async def test_processes_transfer_events(self, event_service) -> None:
        """Polls ERC-20 Transfer events."""
        event_service.get_last_synced_block = AsyncMock(return_value=100)
        event_service.w3.eth.get_block_number = MagicMock(return_value=120)
        event_service._get_contract_addresses = AsyncMock(
            return_value=([], ["0x" + "bb" * 20], [])
        )
        event_service._poll_sale_events = AsyncMock(return_value=0)
        event_service._poll_transfer_events = AsyncMock(return_value=5)
        event_service._poll_fraction_events = AsyncMock(return_value=0)
        event_service.set_last_synced_block = AsyncMock()

        result = await event_service.poll_events()
        assert result == 5

    async def test_processes_fraction_events(self, event_service) -> None:
        """Polls fraction mint/burn events."""
        event_service.get_last_synced_block = AsyncMock(return_value=200)
        event_service.w3.eth.get_block_number = MagicMock(return_value=210)
        event_service._get_contract_addresses = AsyncMock(
            return_value=([], [], ["0x" + "cc" * 20])
        )
        event_service._poll_sale_events = AsyncMock(return_value=0)
        event_service._poll_transfer_events = AsyncMock(return_value=0)
        event_service._poll_fraction_events = AsyncMock(return_value=2)
        event_service.set_last_synced_block = AsyncMock()

        result = await event_service.poll_events()
        assert result == 2

    async def test_caps_block_range(self, event_service) -> None:
        """Block range is capped at POLL_BLOCK_RANGE (50)."""
        event_service.get_last_synced_block = AsyncMock(return_value=100)
        event_service.w3.eth.get_block_number = MagicMock(return_value=500)
        event_service._get_contract_addresses = AsyncMock(
            return_value=([], [], [])
        )
        event_service.set_last_synced_block = AsyncMock()

        await event_service.poll_events()

        # Should sync to 150 (100 + 50), not 500
        event_service.set_last_synced_block.assert_called_once_with(150)


class TestHandleSaleEvent:
    """Tests for _handle_sale_event via DB fixtures."""

    async def test_contribution_made_updates_db(
        self,
        db_session: AsyncSession,
        test_sale: TokenSale,
    ) -> None:
        """ContributionMade event is logged (dedup check)."""
        # Set a contract address on the sale
        test_sale.contract_address = "0x" + "dd" * 20
        await db_session.commit()

        tx_hash_bytes = bytes.fromhex("ab" * 32)
        log = {"transactionHash": tx_hash_bytes}
        args = {
            "buyer": "0x" + "11" * 20,
            "amount": 1000 * 10**6,  # 1000 USDC
            "tokensAllocated": 1000 * 10**18,
            "phaseId": 0,
        }

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls:
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None  # No existing contribution
            mock_db.execute = AsyncMock(return_value=mock_result)

            # Second query: find sale by contract address
            mock_sale_result = MagicMock()
            mock_sale_result.scalar_one_or_none.return_value = test_sale
            mock_db.execute = AsyncMock(side_effect=[mock_result, mock_sale_result])

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            svc = EventListenerService.__new__(EventListenerService)
            await svc._handle_sale_event(
                "Purchase", args, "0x" + "dd" * 20, log
            )

    async def test_contribution_made_dedup(
        self,
        db_session: AsyncSession,
    ) -> None:
        """Duplicate ContributionMade event is skipped."""
        tx_hash_bytes = bytes.fromhex("cc" * 32)
        log = {"transactionHash": tx_hash_bytes}
        args = {"buyer": "0x" + "22" * 20, "amount": 500 * 10**6}

        existing_contrib = MagicMock()

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls:
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = existing_contrib  # Already exists
            mock_db.execute = AsyncMock(return_value=mock_result)

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            svc = EventListenerService.__new__(EventListenerService)
            await svc._handle_sale_event(
                "Purchase", args, "0x" + "dd" * 20, log
            )

            # Should only execute the dedup query, then return
            assert mock_db.execute.call_count == 1

    async def test_tokens_claimed_marks_claimed(self) -> None:
        """TokensClaimed event marks contributions as CLAIMED."""
        tx_hash_bytes = bytes.fromhex("dd" * 32)
        log = {"transactionHash": tx_hash_bytes}
        args = {"claimer": "0x" + "33" * 20, "amount": 1000 * 10**18}

        mock_contrib = MagicMock()
        mock_contrib.status = ContributionStatus.CONFIRMED

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls:
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [mock_contrib]
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            svc = EventListenerService.__new__(EventListenerService)
            await svc._handle_sale_event(
                "TokensClaimed", args, "0x" + "dd" * 20, log
            )

        assert mock_contrib.status == ContributionStatus.CLAIMED
        assert mock_contrib.claim_tx_hash == "dd" * 32

    async def test_refund_claimed_marks_refunded(self) -> None:
        """RefundClaimed event marks contributions as REFUNDED."""
        tx_hash_bytes = bytes.fromhex("ee" * 32)
        log = {"transactionHash": tx_hash_bytes}
        args = {"claimer": "0x" + "44" * 20, "amount": 500 * 10**6}

        mock_contrib = MagicMock()
        mock_contrib.status = ContributionStatus.CONFIRMED

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls:
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [mock_contrib]
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            svc = EventListenerService.__new__(EventListenerService)
            await svc._handle_sale_event(
                "RefundClaimed", args, "0x" + "dd" * 20, log
            )

        assert mock_contrib.status == ContributionStatus.REFUNDED
        assert mock_contrib.claim_tx_hash == "ee" * 32

    async def test_sale_finalized_success(self) -> None:
        """SaleFinalized with success=True sets FINALIZED status."""
        tx_hash_bytes = bytes.fromhex("ff" * 32)
        log = {"transactionHash": tx_hash_bytes}
        args = {"totalRaised": 200000 * 10**6, "success": True}

        mock_sale = MagicMock()

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls:
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_sale
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            svc = EventListenerService.__new__(EventListenerService)
            await svc._handle_sale_event(
                "SaleFinalized", args, "0x" + "dd" * 20, log
            )

        assert mock_sale.status == SaleStatus.FINALIZED

    async def test_sale_finalized_failure(self) -> None:
        """SaleFinalized with success=False sets FAILED status."""
        tx_hash_bytes = bytes.fromhex("aa" * 32)
        log = {"transactionHash": tx_hash_bytes}
        args = {"totalRaised": 50000 * 10**6, "success": False}

        mock_sale = MagicMock()

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls:
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_sale
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            svc = EventListenerService.__new__(EventListenerService)
            await svc._handle_sale_event(
                "SaleFinalized", args, "0x" + "dd" * 20, log
            )

        assert mock_sale.status == SaleStatus.FAILED

    async def test_sale_finalized_sale_not_found(self) -> None:
        """SaleFinalized for unknown sale address is a no-op."""
        tx_hash_bytes = bytes.fromhex("bb" * 32)
        log = {"transactionHash": tx_hash_bytes}
        args = {"totalRaised": 0, "success": False}

        with patch(
            "packages.common.db.session.AsyncSessionLocal"
        ) as mock_session_cls:
            mock_db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()

            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

            svc = EventListenerService.__new__(EventListenerService)
            # Should not raise
            await svc._handle_sale_event(
                "SaleFinalized", args, "0xunknown", log
            )

            # commit should not be called when sale not found
            mock_db.commit.assert_not_called()
