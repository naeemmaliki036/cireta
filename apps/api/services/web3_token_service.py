"""Web3 token service — ERC-3643 token deployment, pause/unpause.

Extends Web3BaseService with token lifecycle operations.
Deploys tokens via CiretaTokenFactory.deployToken().
"""

import asyncio
import json
import logging
from pathlib import Path

from web3 import Web3
from web3.types import TxReceipt

from apps.api.services.web3_base_service import Web3BaseService
from packages.common.core.config import settings

logger = logging.getLogger(__name__)

# Path to compiled factory artifact (relative to repo root)
_FACTORY_ARTIFACT = (
    Path(__file__).resolve().parents[3]
    / "contracts"
    / "artifacts"
    / "src"
    / "platform"
    / "CiretaTokenFactory.sol"
    / "CiretaTokenFactory.json"
)


def _load_factory_abi() -> list:
    """Load CiretaTokenFactory ABI from compiled Hardhat artifact."""
    if not _FACTORY_ARTIFACT.exists():
        raise FileNotFoundError(
            f"Factory artifact not found at {_FACTORY_ARTIFACT}. "
            "Run 'cd contracts && npx hardhat compile' first."
        )
    with open(_FACTORY_ARTIFACT) as f:
        artifact = json.load(f)
    return artifact["abi"]


class Web3TokenService(Web3BaseService):
    """Token deployment and lifecycle operations."""

    async def deploy_erc3643_token(
        self,
        name: str,
        symbol: str,
        decimals: int,
        issuer_wallet: str,
    ) -> tuple[str, TxReceipt]:
        """Deploy an ERC-3643 token via CiretaTokenFactory.

        Calls factory.deployToken(name, symbol, decimals, issuer) which
        deploys a UUPS-proxied CiretaToken + IdentityRegistry +
        ModularCompliance, wires them together, and returns the addresses.

        Args:
            name: Token name (e.g. "Cireta Gold").
            symbol: Token symbol (e.g. "cGOLD").
            decimals: Token decimals (usually 18).
            issuer_wallet: Issuer's wallet address (gets AGENT role on token).

        Returns:
            Tuple of (token_proxy_address, tx_receipt).

        Raises:
            ValueError: If factory address not configured or no deployer.
        """
        factory_address = settings.token_factory_address
        if not factory_address:
            raise ValueError(
                "TOKEN_FACTORY_ADDRESS not configured. "
                "Deploy platform contracts first via: cd contracts && npm run deploy:base"
            )

        if not self._account:
            raise ValueError("No deployer account configured")

        factory_abi = _load_factory_abi()
        factory = self.w3.eth.contract(
            address=Web3.to_checksum_address(factory_address),
            abi=factory_abi,
        )

        issuer_checksum = Web3.to_checksum_address(issuer_wallet)

        # Build and send the deployToken transaction
        nonce = await asyncio.to_thread(self.w3.eth.get_transaction_count, self._account.address, "pending")
        latest = await asyncio.to_thread(lambda: self.w3.eth.get_block("latest"))
        base_fee = latest.get("baseFeePerGas", 1_000_000_000)
        max_priority = 2_000_000_000  # 2 gwei tip
        max_fee = base_fee * 3 + max_priority

        tx = factory.functions.deployToken(
            name, symbol, decimals, issuer_checksum
        ).build_transaction(
            {
                "chainId": self.chain_id,
                "from": self._account.address,
                "gas": 5_000_000,  # Factory deploys 3 proxies — needs more gas
                "maxFeePerGas": max_fee,
                "maxPriorityFeePerGas": max_priority,
                "nonce": nonce,
                "type": "0x2",
            }
        )
        tx["gas"] = await asyncio.to_thread(self.w3.eth.estimate_gas, tx)

        signed = self._account.sign_transaction(tx)
        tx_hash = await asyncio.to_thread(self.w3.eth.send_raw_transaction, signed.raw_transaction)
        receipt = await asyncio.to_thread(self.w3.eth.wait_for_transaction_receipt, tx_hash)

        # Parse return values from the transaction receipt
        # The factory emits a TokenDeployed event with the addresses
        token_deployed_event = factory.events.TokenDeployed()
        logs = token_deployed_event.process_receipt(receipt)

        if logs:
            token_address = logs[0]["args"]["token"]
            identity_registry = logs[0]["args"]["identityRegistry"]
            compliance = logs[0]["args"]["compliance"]
            logger.info(
                "ERC-3643 token deployed: %s (identity=%s, compliance=%s)",
                token_address,
                identity_registry,
                compliance,
            )
        else:
            raise ValueError(
                "Token deployment succeeded but TokenDeployed event not found in receipt. "
                "Cannot determine token address."
            )

        return token_address, identity_registry, compliance, receipt

    async def pause_token(self, token_address: str) -> TxReceipt:
        """Pause all transfers for a token (ERC-3643 pause)."""
        abi = [
            {
                "inputs": [],
                "name": "pause",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(token_address, abi, "pause")

    async def unpause_token(self, token_address: str) -> TxReceipt:
        """Unpause transfers for a token."""
        abi = [
            {
                "inputs": [],
                "name": "unpause",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(token_address, abi, "unpause")

    async def freeze_address(self, token_address: str, wallet_address: str) -> TxReceipt:
        """Freeze a wallet address (ERC-3643 setAddressFrozen)."""
        abi = [
            {
                "inputs": [
                    {"name": "_userAddress", "type": "address"},
                    {"name": "_freeze", "type": "bool"},
                ],
                "name": "setAddressFrozen",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(
            token_address,
            abi,
            "setAddressFrozen",
            Web3.to_checksum_address(wallet_address),
            True,
        )

    async def unfreeze_address(self, token_address: str, wallet_address: str) -> TxReceipt:
        """Unfreeze a wallet address (ERC-3643 setAddressFrozen)."""
        abi = [
            {
                "inputs": [
                    {"name": "_userAddress", "type": "address"},
                    {"name": "_freeze", "type": "bool"},
                ],
                "name": "setAddressFrozen",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(
            token_address,
            abi,
            "setAddressFrozen",
            Web3.to_checksum_address(wallet_address),
            False,
        )

    async def forced_transfer(
        self,
        token_address: str,
        from_addr: str,
        to_addr: str,
        amount: int,
    ) -> TxReceipt:
        """Execute a forced transfer (ERC-3643 forcedTransfer)."""
        abi = [
            {
                "inputs": [
                    {"name": "_from", "type": "address"},
                    {"name": "_to", "type": "address"},
                    {"name": "_amount", "type": "uint256"},
                ],
                "name": "forcedTransfer",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(
            token_address,
            abi,
            "forcedTransfer",
            Web3.to_checksum_address(from_addr),
            Web3.to_checksum_address(to_addr),
            amount,
        )

    async def recover_tokens(
        self,
        token_address: str,
        from_addr: str,
        amount: int,
    ) -> TxReceipt:
        """Recover a specific amount of tokens from an address via forced transfer.

        Transfers `amount` tokens from `from_addr` to the deployer/platform wallet.
        """
        deployer = self.deployer_address
        if not deployer:
            raise ValueError("No deployer account configured for recovery")
        return await self.forced_transfer(
            token_address,
            from_addr,
            deployer,
            amount,
        )
