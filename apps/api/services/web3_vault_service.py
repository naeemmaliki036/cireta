"""Web3 vault service — read on-chain vesting, claimable, and backing data.

Reads CiretaVault contract state for portfolio views.
"""

import asyncio
import logging
from decimal import Decimal
from typing import Any

from web3 import Web3

from apps.api.core.contract_registry import ContractRegistry
from apps.api.services.web3_tx_service import Web3TxService

logger = logging.getLogger(__name__)

TOKEN_DECIMALS = 18


class Web3VaultService:
    """Read vesting info, claimable amounts, and backing ratio from CiretaVault."""

    def __init__(self) -> None:
        self.tx_svc = Web3TxService()
        self.registry = ContractRegistry(self.tx_svc.w3)

    def _vault_contract(self, vault_address: str) -> Any:
        """Get a web3 contract instance for a vault."""
        abi = self.registry.get_abi("CiretaVault")
        return self.tx_svc.w3.eth.contract(
            address=Web3.to_checksum_address(vault_address), abi=abi
        )

    async def get_claimable(
        self, vault_address: str, investor_address: str
    ) -> Decimal:
        """Read vault.getClaimable() for an investor.

        Returns the claimable amount in human-readable token units.
        """
        contract = self._vault_contract(vault_address)
        wallet = Web3.to_checksum_address(investor_address)

        raw = await asyncio.to_thread(
            contract.functions.getClaimable(wallet).call
        )
        return Decimal(str(raw)) / Decimal(10**TOKEN_DECIMALS)

    async def get_vesting_info(
        self, vault_address: str, investor_address: str
    ) -> dict[str, Any]:
        """Read vesting config + investor-specific vesting data.

        Returns structured vesting info with cliff, duration, vested, claimed.
        """
        contract = self._vault_contract(vault_address)
        wallet = Web3.to_checksum_address(investor_address)

        config, investor_data, vested, finalized, start_time = await asyncio.gather(
            asyncio.to_thread(contract.functions.vestingConfig().call),
            asyncio.to_thread(contract.functions.investorVesting(wallet).call),
            asyncio.to_thread(contract.functions.getVested(wallet).call),
            asyncio.to_thread(contract.functions.finalized().call),
            asyncio.to_thread(contract.functions.vestingStartTime().call),
        )

        return {
            "cliff_duration": config[0],
            "vesting_duration": config[1],
            "total_fractions": Decimal(str(investor_data[0])) / Decimal(10**TOKEN_DECIMALS),
            "claimed_amount": Decimal(str(investor_data[1])) / Decimal(10**TOKEN_DECIMALS),
            "vesting_start": investor_data[2] if investor_data[2] > 0 else start_time,
            "vested": Decimal(str(vested)) / Decimal(10**TOKEN_DECIMALS),
            "finalized": finalized,
            "vesting_start_time": start_time,
        }

    async def get_backing_ratio(
        self, vault_address: str
    ) -> dict[str, Any]:
        """Read vault.getBackingRatio().

        Returns locked tokens and outstanding fraction supply.
        """
        contract = self._vault_contract(vault_address)

        result = await asyncio.to_thread(
            contract.functions.getBackingRatio().call
        )
        locked = result[0]
        fraction_supply = result[1]

        return {
            "locked": Decimal(str(locked)) / Decimal(10**TOKEN_DECIMALS),
            "locked_raw": locked,
            "fraction_supply": Decimal(str(fraction_supply)) / Decimal(10**TOKEN_DECIMALS),
            "fraction_supply_raw": fraction_supply,
            "ratio": (
                str(Decimal(str(locked)) / Decimal(str(fraction_supply)))
                if fraction_supply > 0
                else "N/A"
            ),
        }
