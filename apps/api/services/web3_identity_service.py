"""Web3 identity service — ONCHAINID registration, claims, compliance actions.

Extends Web3TokenService with identity and compliance operations.
"""

from web3 import Web3
from web3.types import TxReceipt

from apps.api.services.web3_token_service import Web3TokenService


class Web3IdentityService(Web3TokenService):
    """Identity registry and compliance operations."""

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
