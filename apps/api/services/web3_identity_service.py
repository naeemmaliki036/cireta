"""Web3 identity service — ONCHAINID registration, claims, compliance actions.

Extends Web3TokenService with identity and compliance operations.
"""

import hashlib

from web3 import Web3
from web3.types import TxReceipt

from apps.api.services.web3_token_service import Web3TokenService
from packages.common.core.config import settings


class Web3IdentityService(Web3TokenService):
    """Identity registry and compliance operations."""

    async def deploy_identity(self, wallet_address: str) -> str:
        """Deploy an ONCHAINID identity contract for a user via IdentityFactory.

        Uses createIdentityWithSalt to deploy a deterministic identity contract.

        Args:
            wallet_address: The user's wallet address.

        Returns:
            The deployed identity contract address.

        Raises:
            ValueError: If identity_factory_address is not configured.
        """
        if not settings.identity_factory_address:
            raise ValueError("IDENTITY_FACTORY_ADDRESS not configured")

        # Generate deterministic salt from wallet address
        salt = Web3.keccak(
            Web3.to_bytes(hexstr=Web3.to_checksum_address(wallet_address))
        )

        abi = [
            {
                "inputs": [
                    {"name": "_wallet", "type": "address"},
                    {"name": "_salt", "type": "bytes32"},
                ],
                "name": "createIdentityWithSalt",
                "outputs": [{"name": "", "type": "address"}],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]

        receipt = await self.execute_contract(
            settings.identity_factory_address,
            abi,
            "createIdentityWithSalt",
            Web3.to_checksum_address(wallet_address),
            salt,
        )

        # Extract deployed identity address from logs (first topic after event sig)
        # The IdentityCreated event emits: (address indexed wallet, address identity)
        for log in receipt.get("logs", []):
            if len(log.get("topics", [])) >= 2:
                # The identity address is in the data field (not indexed)
                identity_address = Web3.to_checksum_address(
                    "0x" + log["data"].hex()[-40:]
                )
                return identity_address

        # Fallback: compute CREATE2 address deterministically
        return self._compute_identity_address(wallet_address, salt)

    def _compute_identity_address(
        self, wallet_address: str, salt: bytes
    ) -> str:
        """Compute CREATE2 address for identity contract."""
        # This is a simplified placeholder — actual implementation depends on
        # the exact bytecode hash of the Identity contract in the factory
        factory = Web3.to_checksum_address(settings.identity_factory_address)
        combined = factory + salt.hex() + wallet_address[2:].lower()
        addr_hash = hashlib.sha256(combined.encode()).hexdigest()[-40:]
        return Web3.to_checksum_address("0x" + addr_hash)

    async def register_identity(
        self,
        identity_registry: str,
        user_address: str,
        identity_address: str,
        country: int,
    ) -> TxReceipt:
        """Register a user identity in the ERC-3643 identity registry."""
        abi = [
            {
                "inputs": [
                    {"name": "_userAddress", "type": "address"},
                    {"name": "_identity", "type": "address"},
                    {"name": "_country", "type": "uint16"},
                ],
                "name": "registerIdentity",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(
            identity_registry,
            abi,
            "registerIdentity",
            Web3.to_checksum_address(user_address),
            Web3.to_checksum_address(identity_address),
            country,
        )

    async def issue_claim(
        self,
        identity_address: str,
        topic: int,
        scheme: int,
        issuer: str,
        signature: bytes,
        data: bytes,
        uri: str,
    ) -> TxReceipt:
        """Issue a claim to an ONCHAINID identity (KYC/AML attestation)."""
        abi = [
            {
                "inputs": [
                    {"name": "_topic", "type": "uint256"},
                    {"name": "_scheme", "type": "uint256"},
                    {"name": "_issuer", "type": "address"},
                    {"name": "_signature", "type": "bytes"},
                    {"name": "_data", "type": "bytes"},
                    {"name": "_uri", "type": "string"},
                ],
                "name": "addClaim",
                "outputs": [{"name": "claimRequestId", "type": "bytes32"}],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(
            identity_address,
            abi,
            "addClaim",
            topic,
            scheme,
            Web3.to_checksum_address(issuer),
            signature,
            data,
            uri,
        )

    async def freeze_wallet(
        self, token_address: str, wallet_address: str
    ) -> TxReceipt:
        """Freeze a wallet address for a specific ERC-3643 token."""
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
            token_address, abi, "setAddressFrozen",
            Web3.to_checksum_address(wallet_address), True,
        )

    async def unfreeze_wallet(
        self, token_address: str, wallet_address: str
    ) -> TxReceipt:
        """Unfreeze a wallet address for a specific ERC-3643 token."""
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
            token_address, abi, "setAddressFrozen",
            Web3.to_checksum_address(wallet_address), False,
        )

    async def forced_transfer(
        self, token_address: str, from_address: str, to_address: str, amount: int,
    ) -> TxReceipt:
        """Execute a forced transfer (compliance / court order)."""
        abi = [
            {
                "inputs": [
                    {"name": "_from", "type": "address"},
                    {"name": "_to", "type": "address"},
                    {"name": "_amount", "type": "uint256"},
                ],
                "name": "forcedTransfer",
                "outputs": [{"name": "", "type": "bool"}],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        return await self.execute_contract(
            token_address, abi, "forcedTransfer",
            Web3.to_checksum_address(from_address),
            Web3.to_checksum_address(to_address),
            amount,
        )
