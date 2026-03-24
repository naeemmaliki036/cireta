"""Web3 transaction service — submit, receipt polling, event parsing.

Centralises all transaction submission logic with nonce retry,
structured receipt handling, and audit logging.
"""

import asyncio
import logging
from typing import Any
from uuid import UUID

from eth_account import Account
from eth_account.signers.local import LocalAccount
from web3 import Web3
from web3.contract import Contract
from web3.exceptions import TransactionNotFound
from web3.types import TxReceipt

from packages.common.core.config import settings

logger = logging.getLogger(__name__)

MAX_NONCE_RETRIES = 3
DEFAULT_TX_TIMEOUT = 120


class Web3TxService:
    """Transaction lifecycle: build, sign, submit, receipt, events."""

    def __init__(self, w3: Web3 | None = None) -> None:
        self.w3 = w3 or Web3(Web3.HTTPProvider(settings.web3_rpc_url))
        self.chain_id = settings.chain_id
        self._account: LocalAccount | None = None
        if settings.deployer_private_key:
            self._account = Account.from_key(settings.deployer_private_key)

    @property
    def deployer_address(self) -> str | None:
        return self._account.address if self._account else None

    async def submit_transaction(
        self,
        contract: Contract,
        function_name: str,
        *args: Any,
        gas_limit: int = 500_000,
    ) -> str:
        """Build, sign, and submit a contract transaction. Returns tx_hash hex.

        Handles nonce conflicts with auto-retry (max 3 attempts).
        """
        if not self._account:
            raise ValueError("No deployer account configured")

        fn = getattr(contract.functions, function_name)
        last_err: Exception | None = None

        for attempt in range(MAX_NONCE_RETRIES):
            try:
                nonce = await asyncio.to_thread(
                    self.w3.eth.get_transaction_count, self._account.address
                )
                # Use EIP-1559 fee params (Base supports it)
                latest = await asyncio.to_thread(lambda: self.w3.eth.get_block("latest"))
                base_fee = latest.get("baseFeePerGas", 1_000_000_000)
                max_priority = 1_000_000_000  # 1 gwei tip
                max_fee = base_fee * 2 + max_priority

                tx = fn(*args).build_transaction(
                    {
                        "chainId": self.chain_id,
                        "from": self._account.address,
                        "gas": gas_limit,
                        "maxFeePerGas": max_fee,
                        "maxPriorityFeePerGas": max_priority,
                        "nonce": nonce + attempt,  # bump nonce on retry
                        "type": "0x2",
                    }
                )
                tx["gas"] = await asyncio.to_thread(self.w3.eth.estimate_gas, tx)

                signed = self._account.sign_transaction(tx)
                tx_hash = await asyncio.to_thread(
                    self.w3.eth.send_raw_transaction, signed.raw_transaction
                )
                hex_hash = tx_hash.hex()
                logger.info(
                    "TX submitted: %s.%s → %s (attempt %d)",
                    contract.address, function_name, hex_hash, attempt + 1,
                )
                return hex_hash

            except Exception as exc:
                last_err = exc
                err_msg = str(exc).lower()
                if "nonce" in err_msg and attempt < MAX_NONCE_RETRIES - 1:
                    logger.warning(
                        "Nonce conflict on %s.%s (attempt %d), retrying",
                        contract.address, function_name, attempt + 1,
                    )
                    continue
                raise

        raise last_err  # type: ignore[misc]

    async def wait_for_receipt(
        self, tx_hash: str, timeout: int = DEFAULT_TX_TIMEOUT
    ) -> TxReceipt:
        """Poll for a transaction receipt. Raises TimeoutError if not mined."""
        try:
            receipt = await asyncio.to_thread(
                self.w3.eth.wait_for_transaction_receipt,
                tx_hash,
                timeout=timeout,
            )
        except TransactionNotFound as exc:
            raise TimeoutError(f"Transaction {tx_hash} not found after {timeout}s") from exc

        if receipt["status"] != 1:
            raise ValueError(
                f"Transaction {tx_hash} reverted (status=0, gasUsed={receipt['gasUsed']})"
            )
        return receipt

    def parse_events(
        self, receipt: TxReceipt, contract: Contract, event_name: str
    ) -> list[dict[str, Any]]:
        """Extract typed event data from receipt logs."""
        event = getattr(contract.events, event_name)()
        logs = event.process_receipt(receipt, errors=0)
        return [dict(log["args"]) for log in logs]

    async def get_receipt(self, tx_hash: str) -> TxReceipt:
        """Fetch receipt for an already-mined transaction."""
        return await asyncio.to_thread(
            self.w3.eth.get_transaction_receipt, tx_hash
        )

    async def write_tx_audit(
        self,
        db: Any,
        tx_hash: str,
        action: str,
        target_type: str,
        target_id: str,
        actor_id: UUID | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        """Write a tx audit log entry to the audit_logs table."""
        from apps.api.models.audit_log import AuditLog

        audit = AuditLog()
        audit.actor_id = actor_id
        audit.action = action
        audit.target_type = target_type
        audit.target_id = target_id
        audit.payload = {"tx_hash": tx_hash, **(payload or {})}
        db.add(audit)
        await db.flush()
