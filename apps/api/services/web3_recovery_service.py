"""Web3 service for token recovery — both ERC-3643 and ERC-1155 fractions.

Supports cross-user force-transfers (wallet A user X → wallet B user Y)
for inheritance, court orders, compliance seizure.
"""

from __future__ import annotations

import logging

from web3 import Web3
from web3.types import TxReceipt

from apps.api.services.web3_base_service import Web3BaseService

logger = logging.getLogger(__name__)

# Minimal ABIs — only the functions we call.
_FRACTION_RECOVER_ABI = [
    {
        "inputs": [
            {"name": "from", "type": "address"},
            {"name": "to", "type": "address"},
            {"name": "id", "type": "uint256"},
            {"name": "amount", "type": "uint256"},
            {"name": "reason", "type": "bytes"},
        ],
        "name": "recoverFractions",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]

_ERC3643_FORCE_TRANSFER_ABI = [
    {
        "inputs": [
            {"name": "from", "type": "address"},
            {"name": "to", "type": "address"},
            {"name": "amount", "type": "uint256"},
            {"name": "reason", "type": "string"},
        ],
        "name": "forceTransfer",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]

_ERC3643_RECOVERY_ABI = [
    {
        "inputs": [
            {"name": "lostWallet", "type": "address"},
            {"name": "newWallet", "type": "address"},
            {"name": "investorOnchainID", "type": "address"},
        ],
        "name": "recoveryAddress",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]


class Web3RecoveryService(Web3BaseService):
    """On-chain recovery operations for project tokens and fraction tokens."""

    async def recover_fractions(
        self,
        fraction_token_address: str,
        from_addr: str,
        to_addr: str,
        fraction_id: int,
        amount: int,
        reason: str,
    ) -> TxReceipt:
        """Force-transfer ERC-1155 fractions via RECOVERY_ROLE."""
        reason_bytes = reason.encode("utf-8") if reason else b""
        return await self.execute_contract(
            fraction_token_address,
            _FRACTION_RECOVER_ABI,
            "recoverFractions",
            Web3.to_checksum_address(from_addr),
            Web3.to_checksum_address(to_addr),
            fraction_id,
            amount,
            reason_bytes,
        )

    async def force_transfer_erc3643(
        self,
        token_address: str,
        from_addr: str,
        to_addr: str,
        amount: int,
        reason: str,
    ) -> TxReceipt:
        """Cross-user force-transfer of ERC-3643 tokens via RECOVERY_ROLE."""
        return await self.execute_contract(
            token_address,
            _ERC3643_FORCE_TRANSFER_ABI,
            "forceTransfer",
            Web3.to_checksum_address(from_addr),
            Web3.to_checksum_address(to_addr),
            amount,
            reason,
        )

    async def recovery_address_erc3643(
        self,
        token_address: str,
        lost_wallet: str,
        new_wallet: str,
        onchain_id: str = "0x0000000000000000000000000000000000000000",
    ) -> TxReceipt:
        """Same-user wallet-swap recovery. Pass onchain_id=address(0) for
        simple-whitelist mode."""
        return await self.execute_contract(
            token_address,
            _ERC3643_RECOVERY_ABI,
            "recoveryAddress",
            Web3.to_checksum_address(lost_wallet),
            Web3.to_checksum_address(new_wallet),
            Web3.to_checksum_address(onchain_id),
        )
