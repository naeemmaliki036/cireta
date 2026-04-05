"""Unit tests for Web3TxService."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from apps.api.services.web3_tx_service import Web3TxService


class TestWeb3TxService:
    """Tests for transaction lifecycle."""

    def _make_service(self) -> Web3TxService:
        """Create a service with mocked web3."""
        with patch("apps.api.services.web3_tx_service.settings") as mock_settings:
            mock_settings.web3_rpc_url = "http://localhost:8545"
            mock_settings.chain_id = 8453
            mock_settings.identity_signer_private_key = ""
            svc = Web3TxService.__new__(Web3TxService)
            svc.w3 = MagicMock()
            svc.chain_id = 8453
            svc._account = None
            return svc

    @pytest.mark.asyncio
    async def test_wait_for_receipt_success(self) -> None:
        """Receipt is returned when tx is mined."""
        svc = self._make_service()
        mock_receipt = {"status": 1, "gasUsed": 21000, "blockNumber": 100}
        svc.w3.eth.wait_for_transaction_receipt = MagicMock(return_value=mock_receipt)

        receipt = await svc.wait_for_receipt("0x" + "a" * 64)
        assert receipt["status"] == 1

    @pytest.mark.asyncio
    async def test_wait_for_receipt_reverted(self) -> None:
        """ValueError raised when tx reverts."""
        svc = self._make_service()
        mock_receipt = {"status": 0, "gasUsed": 21000}
        svc.w3.eth.wait_for_transaction_receipt = MagicMock(return_value=mock_receipt)

        with pytest.raises(ValueError, match="reverted"):
            await svc.wait_for_receipt("0x" + "a" * 64)

    def test_parse_events(self) -> None:
        """Event data extracted from receipt logs."""
        svc = self._make_service()
        mock_contract = MagicMock()
        mock_event = MagicMock()
        mock_event.return_value.process_receipt.return_value = [
            {"args": {"contributor": "0x" + "b" * 40, "phaseId": 0, "amount": 1000000, "tokensAllocated": 10**18}}
        ]
        mock_contract.events.ContributionMade = mock_event

        events = svc.parse_events({}, mock_contract, "ContributionMade")
        assert len(events) == 1
        assert events[0]["contributor"] == "0x" + "b" * 40
        assert events[0]["amount"] == 1000000

    @pytest.mark.asyncio
    async def test_submit_transaction_no_account(self) -> None:
        """ValueError raised when no deployer configured."""
        svc = self._make_service()
        with pytest.raises(ValueError, match="No deployer"):
            await svc.submit_transaction(MagicMock(), "someFunction")

    @pytest.mark.asyncio
    async def test_get_receipt(self) -> None:
        """get_receipt returns the receipt."""
        svc = self._make_service()
        mock_receipt = {"status": 1, "to": "0x" + "c" * 40}
        svc.w3.eth.get_transaction_receipt = MagicMock(return_value=mock_receipt)

        receipt = await svc.get_receipt("0x" + "a" * 64)
        assert receipt["status"] == 1

    @pytest.mark.asyncio
    async def test_write_tx_audit(self) -> None:
        """Audit log entry is created for tx."""
        svc = self._make_service()
        mock_db = AsyncMock()
        mock_db.add = MagicMock()

        await svc.write_tx_audit(
            db=mock_db,
            tx_hash="0x" + "a" * 64,
            action="deploy_sale",
            target_type="sale",
            target_id=str(uuid4()),
        )

        mock_db.add.assert_called_once()
        mock_db.flush.assert_awaited_once()
