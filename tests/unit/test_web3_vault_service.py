"""Unit tests for Web3VaultService."""

from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from apps.api.services.web3_vault_service import Web3VaultService


class TestWeb3VaultService:
    """Tests for vault claimable, vesting info, and backing ratio reads."""

    def _mock_service(self) -> Web3VaultService:
        """Create service with mocked tx_svc and registry."""
        svc = Web3VaultService.__new__(Web3VaultService)
        svc.tx_svc = MagicMock()
        svc.tx_svc.w3 = MagicMock()
        svc.tx_svc.w3.eth.contract = MagicMock()
        svc.registry = MagicMock()
        svc.registry.get_abi.return_value = []
        return svc

    def _setup_contract_mock(self, svc: Web3VaultService) -> MagicMock:
        """Set up a mock contract with callable functions."""
        mock_contract = MagicMock()
        svc.tx_svc.w3.eth.contract.return_value = mock_contract
        return mock_contract

    @pytest.mark.asyncio
    async def test_get_claimable(self) -> None:
        """get_claimable returns human-readable decimal amount."""
        svc = self._mock_service()
        mock_contract = self._setup_contract_mock(svc)

        # 50 tokens in raw (50 * 10^18)
        raw_claimable = 50 * 10**18
        mock_contract.functions.getClaimable.return_value.call.return_value = raw_claimable

        result = await svc.get_claimable(
            vault_address="0x" + "a" * 40,
            investor_address="0x" + "b" * 40,
        )

        assert result == Decimal("50")

    @pytest.mark.asyncio
    async def test_get_claimable_zero(self) -> None:
        """get_claimable returns 0 when nothing claimable."""
        svc = self._mock_service()
        mock_contract = self._setup_contract_mock(svc)

        mock_contract.functions.getClaimable.return_value.call.return_value = 0

        result = await svc.get_claimable(
            vault_address="0x" + "a" * 40,
            investor_address="0x" + "b" * 40,
        )

        assert result == Decimal("0")

    @pytest.mark.asyncio
    async def test_get_vesting_info(self) -> None:
        """get_vesting_info returns structured vesting data."""
        svc = self._mock_service()
        mock_contract = self._setup_contract_mock(svc)

        cliff = 90 * 86400
        vesting = 180 * 86400
        start_time = 1700000000
        total_fractions_raw = 100 * 10**18
        claimed_raw = 25 * 10**18
        vested_raw = 50 * 10**18

        # vestingConfig() returns (cliffDuration, vestingDuration)
        mock_contract.functions.vestingConfig.return_value.call.return_value = (cliff, vesting)
        # investorVesting() returns (totalFractions, claimedAmount, vestingStart)
        mock_contract.functions.investorVesting.return_value.call.return_value = (
            total_fractions_raw, claimed_raw, start_time,
        )
        mock_contract.functions.getVested.return_value.call.return_value = vested_raw
        mock_contract.functions.finalized.return_value.call.return_value = True
        mock_contract.functions.vestingStartTime.return_value.call.return_value = start_time

        result = await svc.get_vesting_info(
            vault_address="0x" + "a" * 40,
            investor_address="0x" + "b" * 40,
        )

        assert result["cliff_duration"] == cliff
        assert result["vesting_duration"] == vesting
        assert result["total_fractions"] == Decimal("100")
        assert result["claimed_amount"] == Decimal("25")
        assert result["vested"] == Decimal("50")
        assert result["finalized"] is True
        assert result["vesting_start_time"] == start_time

    @pytest.mark.asyncio
    async def test_get_backing_ratio(self) -> None:
        """get_backing_ratio returns locked and supply data."""
        svc = self._mock_service()
        mock_contract = self._setup_contract_mock(svc)

        locked_raw = 1000 * 10**18
        supply_raw = 800 * 10**18

        mock_contract.functions.getBackingRatio.return_value.call.return_value = (
            locked_raw, supply_raw,
        )

        result = await svc.get_backing_ratio(vault_address="0x" + "a" * 40)

        assert result["locked"] == Decimal("1000")
        assert result["fraction_supply"] == Decimal("800")
        assert result["locked_raw"] == locked_raw
        assert result["fraction_supply_raw"] == supply_raw
        assert result["ratio"] == str(Decimal("1000") / Decimal("800"))

    @pytest.mark.asyncio
    async def test_get_backing_ratio_zero_supply(self) -> None:
        """get_backing_ratio handles zero supply gracefully."""
        svc = self._mock_service()
        mock_contract = self._setup_contract_mock(svc)

        mock_contract.functions.getBackingRatio.return_value.call.return_value = (
            1000 * 10**18, 0,
        )

        result = await svc.get_backing_ratio(vault_address="0x" + "a" * 40)

        assert result["fraction_supply"] == Decimal("0")
        assert result["ratio"] == "N/A"
