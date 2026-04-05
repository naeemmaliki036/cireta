"""Web3 issuer registry service — on-chain issuer registration via IssuerRegistry.

Extends Web3BaseService with IssuerRegistry operations.
"""

import json
import logging
from pathlib import Path

from web3 import Web3

from apps.api.services.web3_base_service import Web3BaseService
from packages.common.core.config import settings

logger = logging.getLogger(__name__)

_REGISTRY_ARTIFACT = (
    Path(__file__).resolve().parents[3]
    / "contracts"
    / "artifacts"
    / "src"
    / "platform"
    / "IssuerRegistry.sol"
    / "IssuerRegistry.json"
)


def _load_registry_abi() -> list:
    """Load IssuerRegistry ABI from compiled Hardhat artifact."""
    if not _REGISTRY_ARTIFACT.exists():
        raise FileNotFoundError(
            f"IssuerRegistry artifact not found at {_REGISTRY_ARTIFACT}. "
            "Run 'cd contracts && npx hardhat compile' first."
        )
    with open(_REGISTRY_ARTIFACT) as f:
        artifact = json.load(f)
    return artifact["abi"]


class Web3IssuerRegistryService(Web3BaseService):
    """On-chain issuer registration and status queries."""

    def _get_registry_address(self) -> str:
        addr = settings.issuer_registry_address
        if not addr:
            raise ValueError(
                "ISSUER_REGISTRY_ADDRESS not configured. "
                "Deploy platform contracts first."
            )
        return Web3.to_checksum_address(addr)

    async def is_active_issuer(self, wallet_address: str) -> bool:
        """Check if a wallet is an active issuer on-chain."""
        abi = [
            {
                "inputs": [{"name": "wallet", "type": "address"}],
                "name": "isActiveIssuer",
                "outputs": [{"name": "", "type": "bool"}],
                "stateMutability": "view",
                "type": "function",
            }
        ]
        registry_address = self._get_registry_address()
        checksum = Web3.to_checksum_address(wallet_address)
        return await self.call_contract(registry_address, abi, "isActiveIssuer", checksum)

    async def register_and_activate_issuer(
        self,
        wallet_address: str,
        name: str,
        jurisdiction: str,
    ) -> str:
        """Register and activate an issuer on-chain.

        Calls registerIssuer(wallet, name, jurisdiction) followed by
        activateIssuer(wallet).

        Returns the activate transaction hash as hex string.
        """
        registry_address = self._get_registry_address()
        abi = _load_registry_abi()
        checksum = Web3.to_checksum_address(wallet_address)

        # Step 1: Register
        logger.info("Registering issuer on-chain: %s (%s)", name, checksum)
        await self.execute_contract(
            registry_address, abi, "registerIssuer", checksum, name, jurisdiction or ""
        )

        # Step 2: Activate
        logger.info("Activating issuer on-chain: %s", checksum)
        receipt = await self.execute_contract(
            registry_address, abi, "activateIssuer", checksum
        )

        tx_hash = receipt["transactionHash"].hex()
        logger.info("Issuer registered and activated on-chain: tx=%s", tx_hash)
        return tx_hash
