"""Wallet screening service — sanctions/risk checks for linked wallets."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.wallet import Wallet
from packages.common.core.config import settings

logger = logging.getLogger(__name__)

# Configurable thresholds (env vars with sensible defaults)
BLOCK_THRESHOLD = float(getattr(settings, "screening_block_threshold", 0.7))
FLAG_THRESHOLD = float(getattr(settings, "screening_flag_threshold", 0.4))


class WalletScreeningProvider:
    """Base screening provider — stub for dev, override for production.

    TODO(mainnet): Replace this stub with a real screening provider before mainnet.
    Integrate Chainalysis Sanctions API or Elliptic Lens for production screening.
    See: https://www.chainalysis.com/free-cryptocurrency-sanctions-screening-tools/
    """

    async def screen(self, address: str) -> dict:
        """Screen an address. Returns {"risk_score": float, "sanctioned": bool}."""
        logger.warning(
            "Using STUB wallet screening provider — address=%s will get risk_score=0. "
            "Integrate a real provider (Chainalysis/Elliptic) before mainnet.",
            address[:10],
        )
        return {"risk_score": 0.0, "sanctioned": False}


class WalletScreeningService:
    """Screen wallet addresses for sanctions and risk."""

    def __init__(self, db: AsyncSession, provider: WalletScreeningProvider | None = None) -> None:
        self.db = db
        self.provider = provider or WalletScreeningProvider()

    async def screen_address(self, address: str) -> dict:
        """Screen a single address via the configured provider.

        Returns:
            {"risk_score": float, "sanctioned": bool}
        """
        result = await self.provider.screen(address)
        logger.info(
            "Screened address=%s risk=%.2f sanctioned=%s",
            address[:10],
            result["risk_score"],
            result["sanctioned"],
        )
        return result

    async def check_sanctions(self, address: str) -> bool:
        """Check if address is sanctioned (OFAC/SDN). Returns True if sanctioned."""
        result = await self.screen_address(address)
        return result["sanctioned"]

    async def screen_on_link(self, address: str) -> dict:
        """Screen address during wallet linking. Raises if sanctioned."""
        result = await self.screen_address(address)
        if result["sanctioned"] or result["risk_score"] >= BLOCK_THRESHOLD:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "WALLET_SANCTIONED",
                    "message": "This wallet address cannot be linked due to compliance restrictions",
                },
            )
        return result

    async def screen_before_contribute(self, wallet: Wallet) -> None:
        """Screen wallet before a contribution. Raises if blocked."""
        result = await self.screen_address(wallet.address_checksum)

        # Update wallet screening data
        wallet.risk_score = result["risk_score"]
        wallet.last_screened_at = datetime.now(UTC)

        if result["sanctioned"] or result["risk_score"] >= BLOCK_THRESHOLD:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "WALLET_BLOCKED",
                    "message": "Contribution blocked — wallet flagged by compliance screening",
                },
            )

        if result["risk_score"] >= FLAG_THRESHOLD:
            logger.warning(
                "Wallet %s flagged with risk_score=%.2f (above flag threshold %.2f)",
                wallet.address_checksum[:10],
                result["risk_score"],
                FLAG_THRESHOLD,
            )

    async def update_wallet_screening(self, wallet: Wallet, result: dict) -> None:
        """Persist screening results on the wallet model."""
        wallet.risk_score = result["risk_score"]
        wallet.last_screened_at = datetime.now(UTC)


async def task_rescreen_wallets(ctx: dict) -> None:  # noqa: ARG001
    """Daily re-screening of all linked wallets."""
    from packages.common.db.session import AsyncSessionLocal

    logger.info("Starting daily wallet re-screening")
    screened = 0
    flagged = 0

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Wallet))
        wallets = list(result.scalars().all())

        svc = WalletScreeningService(db)
        for wallet in wallets:
            try:
                screen_result = await svc.screen_address(wallet.address_checksum)
                wallet.risk_score = screen_result["risk_score"]
                wallet.last_screened_at = datetime.now(UTC)
                screened += 1
                if screen_result["risk_score"] >= FLAG_THRESHOLD:
                    flagged += 1
                    logger.warning(
                        "Re-screen flagged wallet=%s risk=%.2f",
                        wallet.address_checksum[:10],
                        screen_result["risk_score"],
                    )
            except Exception:
                logger.error(
                    "Re-screen failed for wallet=%s", wallet.id, exc_info=True
                )

        await db.commit()

    logger.info("Re-screening complete: %d screened, %d flagged", screened, flagged)
