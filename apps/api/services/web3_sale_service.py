"""Web3 sale service — deploy sales, record contributions, read on-chain state.

Orchestrates Sale contract interactions via Web3TxService.
"""

import asyncio
import logging
from decimal import Decimal
from typing import Any

from web3 import Web3

from apps.api.core.contract_registry import ContractRegistry
from apps.api.services.web3_tx_service import Web3TxService

logger = logging.getLogger(__name__)

# USDC uses 6 decimals
USDC_DECIMALS = 6


class Web3SaleService:
    """Sale deployment, on-chain contribution recording, and status reads."""

    def __init__(self) -> None:
        self.tx_svc = Web3TxService()
        self.registry = ContractRegistry(self.tx_svc.w3)

    async def deploy_sale(
        self,
        token_address: str,
        payment_token: str,
        identity_registry: str,
        issuer_wallet: str,
        fee_manager: str,
        soft_cap: int,
        hard_cap: int,
        fee_basis_points: int,
        fee_cap_usdc: int,
    ) -> tuple[str, str]:
        """Deploy a Sale via CiretaSaleFactory.deploySale().

        Returns (sale_proxy_address, tx_hash).
        """
        factory = self.registry.get_contract("CiretaSaleFactory")

        # Encode Sale.initialize() calldata
        sale_abi = self.registry.get_abi("Sale")
        sale_iface = self.tx_svc.w3.eth.contract(abi=sale_abi)
        init_data = sale_iface.encode_abi(
            "initialize",
            args=[
                Web3.to_checksum_address(token_address),
                Web3.to_checksum_address(payment_token),
                Web3.to_checksum_address(identity_registry),
                Web3.to_checksum_address(issuer_wallet),
                Web3.to_checksum_address(fee_manager),
                soft_cap,
                hard_cap,
                fee_basis_points,
                fee_cap_usdc,
                Web3.to_checksum_address(issuer_wallet),  # _initialOwner
            ],
        )

        tx_hash = await self.tx_svc.submit_transaction(
            factory,
            "deploySale",
            Web3.to_checksum_address(token_address),
            Web3.to_checksum_address(payment_token),
            Web3.to_checksum_address(issuer_wallet),
            soft_cap,
            hard_cap,
            init_data,
            gas_limit=3_000_000,
        )

        receipt = await self.tx_svc.wait_for_receipt(tx_hash)
        events = self.tx_svc.parse_events(receipt, factory, "SaleDeployed")

        if not events:
            raise ValueError(
                "Sale deployment succeeded but SaleDeployed event not found"
            )

        sale_address = events[0]["sale"]
        logger.info("Sale deployed at %s for token %s", sale_address, token_address)
        return sale_address, tx_hash

    async def record_on_chain_contribution(
        self, tx_hash: str
    ) -> dict[str, Any]:
        """Read a ContributionMade event from a tx receipt.

        Returns dict with: contributor, phaseId, amount, tokensAllocated.
        """
        receipt = await self.tx_svc.get_receipt(tx_hash)

        if receipt["status"] != 1:
            raise ValueError(f"Transaction {tx_hash} reverted (status=0)")

        sale_abi = self.registry.get_abi("Sale")
        # We don't know the exact sale address, so parse from receipt's to
        sale_address = receipt["to"]
        sale_contract = self.tx_svc.w3.eth.contract(
            address=Web3.to_checksum_address(sale_address), abi=sale_abi
        )

        events = self.tx_svc.parse_events(receipt, sale_contract, "ContributionMade")
        if not events:
            raise ValueError(
                f"No ContributionMade event in tx {tx_hash}"
            )

        event = events[0]
        return {
            "contributor": event["contributor"],
            "phase_id": event["phaseId"],
            "amount": Decimal(str(event["amount"])) / Decimal(10**USDC_DECIMALS),
            "amount_raw": event["amount"],
            "tokens_allocated": Decimal(str(event["tokensAllocated"])) / Decimal(10**18),
            "tokens_allocated_raw": event["tokensAllocated"],
            "sale_address": sale_address,
            "block_number": receipt["blockNumber"],
        }

    async def get_sale_status(self, sale_address: str) -> dict[str, Any]:
        """Read on-chain sale status, totalRaised, and phases."""
        sale_abi = self.registry.get_abi("Sale")
        addr = Web3.to_checksum_address(sale_address)
        contract = self.tx_svc.w3.eth.contract(address=addr, abi=sale_abi)

        status_val, total_raised, phase_count, soft_cap, hard_cap = await asyncio.gather(
            asyncio.to_thread(contract.functions.status().call),
            asyncio.to_thread(contract.functions.totalRaised().call),
            asyncio.to_thread(contract.functions.getPhaseCount().call),
            asyncio.to_thread(contract.functions.softCap().call),
            asyncio.to_thread(contract.functions.hardCap().call),
        )

        status_names = [
            "Draft", "Active", "Paused", "FinalizedSuccess", "FinalizedFailed"
        ]

        phases = []
        for i in range(phase_count):
            phase = await asyncio.to_thread(contract.functions.getPhase(i).call)
            phases.append({
                "id": i,
                "name": phase[0],
                "price_per_token": phase[1],
                "allocation": phase[2],
                "sold": phase[3],
                "min_contribution": phase[4],
                "max_contribution": phase[5],
                "start_time": phase[6],
                "end_time": phase[7],
                "whitelist_only": phase[8],
            })

        return {
            "status": status_names[status_val] if status_val < len(status_names) else str(status_val),
            "total_raised": Decimal(str(total_raised)) / Decimal(10**USDC_DECIMALS),
            "total_raised_raw": total_raised,
            "soft_cap": soft_cap,
            "hard_cap": hard_cap,
            "phases": phases,
        }

    async def get_user_contribution(
        self, sale_address: str, wallet_address: str
    ) -> dict[str, Any]:
        """Read on-chain contribution data for a user."""
        sale_abi = self.registry.get_abi("Sale")
        addr = Web3.to_checksum_address(sale_address)
        wallet = Web3.to_checksum_address(wallet_address)
        contract = self.tx_svc.w3.eth.contract(address=addr, abi=sale_abi)

        contrib = await asyncio.to_thread(
            contract.functions.getContribution(wallet).call
        )
        total_contributed = await asyncio.to_thread(
            contract.functions.totalContributed(wallet).call
        )

        return {
            "amount": Decimal(str(contrib[0])) / Decimal(10**USDC_DECIMALS),
            "amount_raw": contrib[0],
            "tokens_allocated": Decimal(str(contrib[1])) / Decimal(10**18),
            "claimed": contrib[2],
            "refunded": contrib[3],
            "is_otc": contrib[4],
            "total_contributed_raw": total_contributed,
        }
