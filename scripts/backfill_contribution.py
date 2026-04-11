"""Backfill a single Contribution row from an on-chain Purchase tx.

Usage:
    railway run --service api -- poetry run python scripts/backfill_contribution.py <tx_hash>

Reads the Purchase event from the tx receipt, finds the matching Sale by
contract address, looks up the user by buyer wallet, and inserts a
Contribution row (or updates an existing one with that tx_hash).

Idempotent: re-running on the same tx_hash is a no-op.
"""

from __future__ import annotations

import asyncio
import sys
from decimal import Decimal

from sqlalchemy import select

from apps.api.models.contribution import Contribution
from apps.api.models.enums import ContributionStatus
from apps.api.models.token_sale import TokenSale
from apps.api.models.wallet import Wallet
from apps.api.services.web3_sale_service import Web3SaleService
from packages.common.db.session import AsyncSessionLocal


async def backfill(tx_hash: str) -> None:
    print(f"[backfill] tx={tx_hash}")

    # 1. Pull the Purchase event off chain.
    svc = Web3SaleService()
    event = await svc.record_on_chain_contribution(tx_hash)
    print(f"[backfill] event={event}")

    buyer = event["buyer"]
    sale_address = event["sale_address"]
    amount_usdc = event["amount"]  # Decimal in whole USDC
    tokens_alloc = event["tokens_allocated"]  # Decimal in whole tokens
    chain_phase_id = event["phase_id"]
    is_otc = event["is_otc"]

    async with AsyncSessionLocal() as db:
        # 2. Idempotency — bail if already recorded.
        existing = await db.execute(
            select(Contribution).where(Contribution.tx_hash == tx_hash)
        )
        if existing.scalar_one_or_none():
            print(f"[backfill] Contribution for {tx_hash} already exists — nothing to do.")
            return

        # 3. Find the sale by contract address (case-insensitive).
        sale_result = await db.execute(
            select(TokenSale).where(TokenSale.contract_address.ilike(sale_address))
        )
        sale = sale_result.scalar_one_or_none()
        if not sale:
            raise SystemExit(f"[backfill] No sale found for contract {sale_address}")

        # 4. Find the user via the buyer wallet (try checksum + lowercase).
        wallet_result = await db.execute(
            select(Wallet).where(Wallet.address.ilike(buyer))
        )
        wallet = wallet_result.scalar_one_or_none()
        if not wallet:
            raise SystemExit(
                f"[backfill] Buyer wallet {buyer} not linked to any user — "
                "investor must add wallet to their profile first."
            )

        # 5. Resolve phase by on-chain index.
        from apps.api.models.sale_phase import SalePhase

        phase_result = await db.execute(
            select(SalePhase)
            .where(SalePhase.sale_id == sale.id)
            .order_by(SalePhase.start_time)
        )
        phases = list(phase_result.scalars().all())
        if not (0 <= chain_phase_id < len(phases)):
            raise SystemExit(
                f"[backfill] Phase index {chain_phase_id} out of range "
                f"(sale has {len(phases)} phases)"
            )
        phase = phases[chain_phase_id]

        # 6. Insert the contribution.
        contrib = Contribution()
        contrib.user_id = wallet.user_id
        contrib.sale_id = sale.id
        contrib.phase_id = phase.id
        contrib.amount = amount_usdc
        contrib.payment_amount = Decimal("0") if is_otc else amount_usdc
        contrib.otc_amount = amount_usdc if is_otc else Decimal("0")
        contrib.tokens_allocated = tokens_alloc
        contrib.tx_hash = tx_hash
        contrib.wallet_address = buyer.lower()
        contrib.status = ContributionStatus.CONFIRMED
        contrib.is_otc = is_otc
        contrib.phase_index = chain_phase_id
        db.add(contrib)

        # 7. Update sale.total_raised (only payment-token buys, not OTC).
        if not is_otc:
            sale.total_raised = (sale.total_raised or Decimal("0")) + amount_usdc

        await db.commit()
        await db.refresh(contrib)

        print(
            f"[backfill] Inserted contribution id={contrib.id} "
            f"user={wallet.user_id} sale={sale.id} phase={phase.id} "
            f"amount={amount_usdc} tokens={tokens_alloc} otc={is_otc}"
        )


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: backfill_contribution.py <tx_hash>")
    tx_hash = sys.argv[1]
    if not tx_hash.startswith("0x") or len(tx_hash) != 66:
        raise SystemExit(f"Invalid tx hash: {tx_hash}")
    asyncio.run(backfill(tx_hash))


if __name__ == "__main__":
    main()
