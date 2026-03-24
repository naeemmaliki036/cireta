"""Web3 base service — core connection, balance, tx, and contract calls.

Chain ID: 8453 (Base Mainnet)
"""

import asyncio
import logging
from decimal import Decimal
from typing import Any

from eth_account import Account
from eth_account.signers.local import LocalAccount
from web3 import Web3
from web3.types import TxReceipt

from packages.common.core.config import settings

logger = logging.getLogger(__name__)


class Web3BaseService:
    """Core Web3 operations: connection, balances, transactions, contract calls."""

    def __init__(self) -> None:
        """Initialize Web3 service with Base L2 connection (circuit breaker)."""
        from apps.api.core.web3_provider import get_web3_provider

        try:
            self.w3 = get_web3_provider()
        except ConnectionError:
            # Fallback to raw provider if circuit breaker blocks
            self.w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url))
        self.chain_id = settings.chain_id
        self._account: LocalAccount | None = None
        if settings.deployer_private_key:
            self._account = Account.from_key(settings.deployer_private_key)

    @property
    def deployer_address(self) -> str | None:
        """Get deployer wallet address."""
        return self._account.address if self._account else None

    async def is_connected(self) -> bool:
        """Check if connected to blockchain."""
        return await asyncio.to_thread(self.w3.is_connected)

    async def get_balance(self, address: str) -> Decimal:
        """Get ETH balance for an address in ETH."""
        checksum_address = Web3.to_checksum_address(address)
        balance_wei = await asyncio.to_thread(self.w3.eth.get_balance, checksum_address)
        return Decimal(str(Web3.from_wei(balance_wei, "ether")))

    async def get_token_balance(
        self, contract_address: str, wallet_address: str, decimals: int = 18
    ) -> Decimal:
        """Get ERC-20 token balance."""
        abi = [
            {
                "inputs": [{"name": "account", "type": "address"}],
                "name": "balanceOf",
                "outputs": [{"name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function",
            }
        ]
        contract = self.w3.eth.contract(address=Web3.to_checksum_address(contract_address), abi=abi)
        fn = contract.functions.balanceOf(Web3.to_checksum_address(wallet_address))
        balance = await asyncio.to_thread(fn.call)
        return Decimal(balance) / Decimal(10**decimals)

    async def send_transaction(self, to: str, value: int = 0, data: bytes = b"") -> TxReceipt:
        """Sign and send a raw transaction."""
        if not self._account:
            raise ValueError("No deployer account configured")
        checksum_to = Web3.to_checksum_address(to)
        nonce = await asyncio.to_thread(self.w3.eth.get_transaction_count, self._account.address)
        gas_price = await asyncio.to_thread(lambda: self.w3.eth.gas_price)
        tx: dict[str, Any] = {
            "chainId": self.chain_id,
            "to": checksum_to,
            "value": value,
            "gas": 500000,
            "gasPrice": gas_price,
            "nonce": nonce,
            "data": data,
        }
        tx["gas"] = await asyncio.to_thread(self.w3.eth.estimate_gas, tx)
        signed = self._account.sign_transaction(tx)
        tx_hash = await asyncio.to_thread(self.w3.eth.send_raw_transaction, signed.raw_transaction)
        return await asyncio.to_thread(self.w3.eth.wait_for_transaction_receipt, tx_hash)

    async def call_contract(
        self, contract_address: str, abi: list, function_name: str, *args: Any
    ) -> Any:
        """Call a contract view function (no gas)."""
        try:
            contract = self.w3.eth.contract(address=Web3.to_checksum_address(contract_address), abi=abi)
            function = getattr(contract.functions, function_name)
            return await asyncio.to_thread(function(*args).call)
        except Exception:
            logger.error(
                "On-chain view call failed: %s.%s at %s",
                contract_address, function_name, contract_address,
                exc_info=True,
            )
            raise

    async def execute_contract(
        self, contract_address: str, abi: list, function_name: str, *args: Any
    ) -> TxReceipt:
        """Execute a state-changing contract function."""
        if not self._account:
            raise ValueError("No deployer account configured")
        try:
            contract = self.w3.eth.contract(address=Web3.to_checksum_address(contract_address), abi=abi)
            function = getattr(contract.functions, function_name)
            nonce = await asyncio.to_thread(self.w3.eth.get_transaction_count, self._account.address)
            gas_price = await asyncio.to_thread(lambda: self.w3.eth.gas_price)
            tx = function(*args).build_transaction(
                {
                    "chainId": self.chain_id,
                    "from": self._account.address,
                    "gas": 500000,
                    "gasPrice": gas_price,
                    "nonce": nonce,
                }
            )
            tx["gas"] = await asyncio.to_thread(self.w3.eth.estimate_gas, tx)
            signed = self._account.sign_transaction(tx)
            tx_hash = await asyncio.to_thread(self.w3.eth.send_raw_transaction, signed.raw_transaction)
            return await asyncio.to_thread(self.w3.eth.wait_for_transaction_receipt, tx_hash)
        except Exception:
            logger.error(
                "On-chain execute failed: %s.%s at %s",
                contract_address, function_name, contract_address,
                exc_info=True,
            )
            raise
