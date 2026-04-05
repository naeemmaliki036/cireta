"""Unit tests for Web3SaleService."""

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from apps.api.services.web3_sale_service import Web3SaleService


class TestWeb3SaleService:
    """Tests for sale deployment, contribution recording, and status reads."""

    def _mock_service(self) -> Web3SaleService:
        """Create service with mocked tx_svc and registry."""
        svc = Web3SaleService.__new__(Web3SaleService)
        svc.tx_svc = MagicMock()
        svc.tx_svc.w3 = MagicMock()
        svc.tx_svc.w3.eth.contract = MagicMock()
        svc.registry = MagicMock()
        return svc

    @pytest.mark.asyncio
    async def test_deploy_sale_success(self) -> None:
        """deploy_sale returns address and tx_hash."""
        svc = self._mock_service()

        # Mock ABI loading
        svc.registry.get_abi.return_value = [{"name": "initialize", "type": "function", "inputs": []}]
        svc.registry.get_contract.return_value = MagicMock()

        # Mock encodeABI
        mock_iface = MagicMock()
        mock_iface.encodeABI.return_value = b"\x00"
        svc.tx_svc.w3.eth.contract.return_value = mock_iface

        # Mock tx submission + receipt + events
        svc.tx_svc.submit_transaction = AsyncMock(return_value="0x" + "a" * 64)
        svc.tx_svc.wait_for_receipt = AsyncMock(return_value={"status": 1})
        svc.tx_svc.parse_events = MagicMock(return_value=[{"sale": "0x" + "b" * 40}])

        address, tx_hash = await svc.deploy_sale(
            token_address="0x" + "1" * 40,
            payment_token="0x" + "2" * 40,
            identity_registry="0x" + "3" * 40,
            issuer_wallet="0x" + "4" * 40,
            fee_manager="0x" + "5" * 40,
            soft_cap=100000 * 10**6,
            hard_cap=500000 * 10**6,
            fee_basis_points=250,
            fee_cap_usdc=10000 * 10**6,
        )

        assert address == "0x" + "b" * 40
        assert tx_hash == "0x" + "a" * 64

    @pytest.mark.asyncio
    async def test_deploy_sale_no_event(self) -> None:
        """ValueError when SaleDeployed event not found."""
        svc = self._mock_service()
        svc.registry.get_abi.return_value = []
        svc.registry.get_contract.return_value = MagicMock()

        mock_iface = MagicMock()
        mock_iface.encodeABI.return_value = b"\x00"
        svc.tx_svc.w3.eth.contract.return_value = mock_iface

        svc.tx_svc.submit_transaction = AsyncMock(return_value="0x" + "a" * 64)
        svc.tx_svc.wait_for_receipt = AsyncMock(return_value={"status": 1})
        svc.tx_svc.parse_events = MagicMock(return_value=[])

        with pytest.raises(ValueError, match="SaleDeployed event not found"):
            await svc.deploy_sale(
                "0x" + "1" * 40, "0x" + "2" * 40, "0x" + "3" * 40,
                "0x" + "4" * 40, "0x" + "5" * 40, 100000, 500000, 250, 10000,
            )

    @pytest.mark.asyncio
    async def test_record_on_chain_contribution(self) -> None:
        """Contribution data parsed from on-chain event."""
        svc = self._mock_service()
        svc.registry.get_abi.return_value = []

        mock_receipt = {
            "status": 1,
            "to": "0x" + "c" * 40,
            "blockNumber": 12345,
        }
        svc.tx_svc.get_receipt = AsyncMock(return_value=mock_receipt)

        buyer = "0x" + "d" * 40
        svc.tx_svc.parse_events = MagicMock(return_value=[{
            "buyer": buyer,
            "phaseId": 0,
            "amount": 5000 * 10**6,  # 5000 USDC
            "tokensAllocated": 5000 * 10**18,
        }])

        result = await svc.record_on_chain_contribution("0x" + "a" * 64)

        assert result["buyer"] == buyer
        assert result["amount"] == Decimal("5000")
        assert result["phase_id"] == 0
        assert result["block_number"] == 12345

    @pytest.mark.asyncio
    async def test_record_on_chain_contribution_reverted(self) -> None:
        """ValueError when tx reverted."""
        svc = self._mock_service()
        svc.tx_svc.get_receipt = AsyncMock(return_value={"status": 0, "to": "0x" + "c" * 40})

        with pytest.raises(ValueError, match="reverted"):
            await svc.record_on_chain_contribution("0x" + "a" * 64)

    @pytest.mark.asyncio
    async def test_record_on_chain_contribution_no_event(self) -> None:
        """ValueError when no ContributionMade event."""
        svc = self._mock_service()
        svc.registry.get_abi.return_value = []
        svc.tx_svc.get_receipt = AsyncMock(return_value={
            "status": 1, "to": "0x" + "c" * 40, "blockNumber": 100,
        })
        svc.tx_svc.parse_events = MagicMock(return_value=[])

        with pytest.raises(ValueError, match="No Purchase event"):
            await svc.record_on_chain_contribution("0x" + "a" * 64)

    @pytest.mark.asyncio
    async def test_get_sale_status(self) -> None:
        """Sale status data returned from on-chain reads."""
        svc = self._mock_service()
        svc.registry.get_abi.return_value = []

        mock_contract = MagicMock()
        mock_contract.functions.status.return_value.call.return_value = 1  # Active
        mock_contract.functions.totalRaised.return_value.call.return_value = 50000 * 10**6
        mock_contract.functions.getPhaseCount.return_value.call.return_value = 2
        mock_contract.functions.softCap.return_value.call.return_value = 100000 * 10**6
        mock_contract.functions.hardCap.return_value.call.return_value = 500000 * 10**6
        mock_contract.functions.getPhase.return_value.call.return_value = (
            "Seed", 10**6, 100000 * 10**18, 0, 100 * 10**6, 50000 * 10**6,
            1700000000, 1710000000, True,
        )
        svc.tx_svc.w3.eth.contract.return_value = mock_contract

        result = await svc.get_sale_status("0x" + "c" * 40)

        assert result["status"] == "Active"
        assert result["total_raised"] == Decimal("50000")
        assert len(result["phases"]) == 2

    @pytest.mark.asyncio
    async def test_get_user_contribution(self) -> None:
        """User contribution data from on-chain."""
        svc = self._mock_service()
        svc.registry.get_abi.return_value = []

        mock_contract = MagicMock()
        mock_contract.functions.getContribution.return_value.call.return_value = (
            1000 * 10**6, 1000 * 10**18, False, False, False,
        )
        mock_contract.functions.totalContributed.return_value.call.return_value = 1000 * 10**6
        svc.tx_svc.w3.eth.contract.return_value = mock_contract

        result = await svc.get_user_contribution("0x" + "c" * 40, "0x" + "d" * 40)

        assert result["amount"] == Decimal("1000")
        assert result["claimed"] is False
