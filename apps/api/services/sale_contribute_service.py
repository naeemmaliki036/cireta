"""Sale contribute service — contribute, finalize, claim, refund."""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.contribution import Contribution
from apps.api.models.enums import ContributionStatus, SaleStatus
from apps.api.models.token_sale import TokenSale
from apps.api.models.user import User


class SaleContributeService:
    """Contribution lifecycle: contribute, finalize, claim, refund."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialise with async DB session."""
        self.db = db

    async def contribute(
        self,
        user_id: UUID,
        sale_id: UUID,
        amount: Decimal,
        tx_hash: str,
        wallet_address: str | None = None,
    ) -> Contribution:
        """Record a contribution to a token sale from an on-chain transaction.

        Verifies the tx_hash on-chain, parses the ContributionMade event,
        and records data sourced from the chain event (not user input).
        Deduplicates on tx_hash — returns existing if already recorded.

        Args:
            user_id: User UUID.
            sale_id: Sale UUID.
            amount: Contribution amount (used as fallback if on-chain verify unavailable).
            tx_hash: Blockchain transaction hash (source of truth).

        Returns:
            Created or existing contribution.

        Raises:
            HTTPException: If not eligible or sale not active.
        """
        # Get user and check KYC
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )

        if not user.can_invest:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "KYC_REQUIRED",
                    "message": "KYC level 2 required to invest",
                },
            )

        # Dedup: if tx_hash already recorded, return existing (idempotent)
        existing = await self.db.execute(
            select(Contribution).where(Contribution.tx_hash == tx_hash)
        )
        existing_contrib = existing.scalar_one_or_none()
        if existing_contrib:
            return existing_contrib

        # Verify on-chain and extract event data
        on_chain_data = await self._verify_on_chain(tx_hash, user)

        # Get sale with phases (SELECT FOR UPDATE to prevent race conditions)
        sale_result = await self.db.execute(
            select(TokenSale)
            .options(selectinload(TokenSale.phases))
            .where(TokenSale.id == sale_id)
            .with_for_update()
        )
        sale = sale_result.scalar_one_or_none()

        if not sale:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"},
            )

        if not sale.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "SALE_NOT_ACTIVE", "message": "Sale is not active"},
            )

        # Resolve contribution data: prefer on-chain, fallback to request
        contrib_amount = on_chain_data["amount"] if on_chain_data else amount
        contrib_tokens = on_chain_data["tokens_allocated"] if on_chain_data else None
        contrib_wallet = on_chain_data["contributor"] if on_chain_data else wallet_address
        chain_phase_id = on_chain_data["phase_id"] if on_chain_data else None

        # Find the matching phase
        active_phase = None
        if chain_phase_id is not None:
            # Match on-chain phase index to DB phase
            sorted_phases = sorted(sale.phases, key=lambda p: p.phase_number)
            if chain_phase_id < len(sorted_phases):
                active_phase = sorted_phases[chain_phase_id]
        if not active_phase:
            for phase in sale.phases:
                if phase.is_active:
                    active_phase = phase
                    break

        if not active_phase:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "NO_ACTIVE_PHASE", "message": "No active sale phase"},
            )

        # Whitelist check for whitelist-only phases
        if getattr(active_phase, "whitelist_only", False):
            from apps.api.models.sale_phase_whitelist import SalePhaseWhitelist

            resolved_wallet = contrib_wallet or wallet_address
            if not resolved_wallet:
                from apps.api.models.wallet import Wallet

                wallet_q = await self.db.execute(
                    select(Wallet).where(
                        Wallet.user_id == user_id,
                        Wallet.is_primary.is_(True),
                    )
                )
                primary_wallet = wallet_q.scalar_one_or_none()
                resolved_wallet = primary_wallet.address if primary_wallet else None

            if not resolved_wallet:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "NO_WALLET",
                        "message": "Wallet address required for whitelist-only phases",
                    },
                )

            whitelist_result = await self.db.execute(
                select(SalePhaseWhitelist).where(
                    SalePhaseWhitelist.phase_id == active_phase.id,
                    SalePhaseWhitelist.wallet_address == resolved_wallet.lower(),
                )
            )
            if not whitelist_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "code": "NOT_WHITELISTED",
                        "message": "This phase is restricted to whitelisted investors",
                    },
                )

        # Pre-flight limit checks (defense in depth — contract also checks)
        if active_phase.min_contribution > 0 and contrib_amount < active_phase.min_contribution:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "BELOW_MINIMUM",
                    "message": f"Minimum contribution is {active_phase.min_contribution}",
                },
            )

        if active_phase.max_contribution > 0:
            # Read on-chain cumulative total for authoritative check
            cumulative = await self._get_on_chain_cumulative(
                sale, contrib_wallet, contrib_amount
            )
            if cumulative is not None and cumulative > active_phase.max_contribution:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "ABOVE_MAXIMUM",
                        "message": f"Maximum cumulative contribution is {active_phase.max_contribution}. "
                        f"On-chain total would be {cumulative}.",
                    },
                )
            # DB fallback when on-chain check unavailable
            if cumulative is None:
                from sqlalchemy import func

                existing_sum_result = await self.db.execute(
                    select(func.coalesce(func.sum(Contribution.amount), 0)).where(
                        Contribution.user_id == user_id,
                        Contribution.sale_id == sale_id,
                        Contribution.phase_id == active_phase.id,
                    )
                )
                existing_total = existing_sum_result.scalar()
                if (existing_total + contrib_amount) > active_phase.max_contribution:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "code": "ABOVE_MAXIMUM",
                            "message": f"Maximum cumulative contribution is {active_phase.max_contribution}. "
                            f"You have already contributed {existing_total}.",
                        },
                    )

        # Calculate tokens if not from chain
        tokens_allocated = contrib_tokens or (contrib_amount / active_phase.price_per_token)

        # Create contribution (data sourced from on-chain event)
        contribution = Contribution()
        contribution.user_id = user_id
        contribution.sale_id = sale_id
        contribution.phase_id = active_phase.id
        contribution.amount = contrib_amount
        contribution.tokens_allocated = tokens_allocated
        contribution.tx_hash = tx_hash
        contribution.wallet_address = contrib_wallet
        contribution.status = ContributionStatus.CONFIRMED if on_chain_data else ContributionStatus.PENDING

        self.db.add(contribution)

        # Hard cap check
        if sale.hard_cap and (sale.total_raised + contrib_amount) > sale.hard_cap:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "EXCEEDS_HARD_CAP", "message": "Exceeds hard cap"},
            )

        # Update sale total raised
        sale.total_raised = sale.total_raised + contrib_amount

        await self.db.commit()
        await self.db.refresh(contribution)

        return contribution

    async def _get_on_chain_cumulative(
        self, sale: TokenSale, wallet_address: str | None, new_amount: Decimal
    ) -> Decimal | None:
        """Read on-chain cumulative contribution for a user.

        Returns total (existing + new_amount) or None if unavailable.
        """
        if not wallet_address or not getattr(sale, "contract_address", None):
            return None
        try:
            from apps.api.services.web3_sale_service import Web3SaleService

            web3_sale = Web3SaleService()
            data = await web3_sale.get_user_contribution(
                sale.contract_address, wallet_address
            )
            return data["amount"] + new_amount
        except Exception:
            import logging
            logging.getLogger(__name__).debug(
                "On-chain cumulative check unavailable for sale=%s wallet=%s",
                sale.id, wallet_address,
            )
            return None

    async def _verify_on_chain(
        self, tx_hash: str, user: User
    ) -> dict | None:
        """Verify a tx_hash on-chain and parse the ContributionMade event.

        Returns parsed event data or None if verification is unavailable.
        """
        try:
            from apps.api.services.web3_sale_service import Web3SaleService

            web3_sale = Web3SaleService()
            event_data = await web3_sale.record_on_chain_contribution(tx_hash)

            # Verify contributor matches user's wallet
            from apps.api.models.wallet import Wallet

            wallet_result = await self.db.execute(
                select(Wallet).where(Wallet.user_id == user.id)
            )
            user_wallets = [w.address.lower() for w in wallet_result.scalars().all()]

            contributor = event_data["contributor"].lower()
            if user_wallets and contributor not in user_wallets:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "code": "CONTRIBUTOR_MISMATCH",
                        "message": "Transaction contributor does not match your wallet",
                    },
                )

            return event_data

        except HTTPException:
            raise
        except Exception:
            import logging
            logging.getLogger(__name__).warning(
                "On-chain verification failed for tx=%s, using request data",
                tx_hash,
                exc_info=True,
            )
            return None

    async def finalize_sale(self, user_id: UUID, sale_id: UUID) -> TokenSale:
        """Finalize a token sale.

        Args:
            user_id: User UUID (must be issuer).
            sale_id: Sale UUID.

        Returns:
            Updated sale.

        Raises:
            HTTPException: If not authorized or cannot finalize.
        """
        sale_result = await self.db.execute(
            select(TokenSale).options(selectinload(TokenSale.issuer)).where(TokenSale.id == sale_id)
        )
        sale = sale_result.scalar_one_or_none()

        if not sale:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"},
            )

        if sale.issuer.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "NOT_AUTHORIZED", "message": "Not authorized"},
            )

        if sale.status != SaleStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "NOT_ACTIVE", "message": "Sale is not active"},
            )

        # Determine final status
        if sale.soft_cap_reached:
            sale.status = SaleStatus.FINALIZED

            # Confirm all pending contributions
            await self.db.execute(
                Contribution.__table__.update()
                .where(Contribution.sale_id == sale_id)
                .where(Contribution.status == ContributionStatus.PENDING)
                .values(status=ContributionStatus.CONFIRMED)
            )
        else:
            sale.status = SaleStatus.FAILED

        await self.db.commit()
        await self.db.refresh(sale)

        return sale

    async def claim_tokens(self, user_id: UUID, sale_id: UUID) -> list[Contribution]:
        """Claim tokens from a finalized sale.

        Args:
            user_id: User UUID.
            sale_id: Sale UUID.

        Returns:
            List of claimed contributions.

        Raises:
            HTTPException: If nothing to claim.
        """
        # Get user's confirmed contributions
        result = await self.db.execute(
            select(Contribution)
            .where(Contribution.user_id == user_id)
            .where(Contribution.sale_id == sale_id)
            .where(Contribution.status == ContributionStatus.CONFIRMED)
        )
        contributions = list(result.scalars().all())

        if not contributions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "NOTHING_TO_CLAIM", "message": "No claimable contributions"},
            )

        # Mark as claimed
        now = datetime.now(UTC)
        for contrib in contributions:
            contrib.status = ContributionStatus.CLAIMED
            contrib.claimed_at = now

        # Trigger on-chain token transfer
        sale_result = await self.db.execute(
            select(TokenSale).options(selectinload(TokenSale.token)).where(TokenSale.id == sale_id)
        )
        sale = sale_result.scalar_one_or_none()
        if (
            sale
            and sale.token
            and sale.token.contract_address
            and sale.token.contract_address != ("0x" + "0" * 40)
        ):
            try:
                from apps.api.models.wallet import Wallet
                from apps.api.services.web3_token_service import Web3TokenService

                wallet_result = await self.db.execute(
                    select(Wallet).where(Wallet.user_id == user_id, Wallet.is_primary.is_(True))
                )
                wallet = wallet_result.scalar_one_or_none()
                if wallet:
                    web3_svc = Web3TokenService()
                    total_tokens = sum(c.tokens_allocated for c in contributions)
                    amount_int = int(
                        Decimal(str(total_tokens)) * Decimal(10 ** (sale.token.decimals or 18))
                    )
                    await web3_svc.forced_transfer(
                        sale.token.contract_address,
                        web3_svc.deployer_address or "",
                        wallet.address,
                        amount_int,
                    )
            except Exception:
                import logging

                logging.getLogger(__name__).error(
                    "On-chain token transfer failed during claim for user=%s sale=%s",
                    user_id,
                    sale_id,
                    exc_info=True,
                )
                # Revert claim status so DB stays consistent with on-chain state
                for contrib in contributions:
                    contrib.status = ContributionStatus.CONFIRMED
                    contrib.claimed_at = None
                await self.db.commit()
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={
                        "code": "ONCHAIN_TRANSFER_FAILED",
                        "message": "On-chain token transfer failed. Please retry.",
                    },
                ) from None

        await self.db.commit()

        return contributions

    async def claim_refund(self, user_id: UUID, sale_id: UUID) -> list[Contribution]:
        """Claim refund from a failed sale.

        Args:
            user_id: User UUID.
            sale_id: Sale UUID.

        Returns:
            List of refunded contributions.

        Raises:
            HTTPException: If nothing to refund.
        """
        # Get sale
        sale_result = await self.db.execute(select(TokenSale).where(TokenSale.id == sale_id))
        sale = sale_result.scalar_one_or_none()

        if not sale:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"},
            )

        if sale.status != SaleStatus.FAILED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "SALE_NOT_FAILED", "message": "Sale is not failed"},
            )

        # Get user's pending contributions
        result = await self.db.execute(
            select(Contribution)
            .where(Contribution.user_id == user_id)
            .where(Contribution.sale_id == sale_id)
            .where(Contribution.status == ContributionStatus.PENDING)
        )
        contributions = list(result.scalars().all())

        if not contributions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "NOTHING_TO_REFUND", "message": "No refundable contributions"},
            )

        # Mark as refunded
        for contrib in contributions:
            contrib.status = ContributionStatus.REFUNDED

        # Trigger on-chain USDC refund
        try:
            from apps.api.models.wallet import Wallet
            from apps.api.services.web3_base_service import Web3BaseService

            wallet_result = await self.db.execute(
                select(Wallet).where(Wallet.user_id == user_id, Wallet.is_primary.is_(True))
            )
            wallet = wallet_result.scalar_one_or_none()
            if wallet and sale.payment_token:
                web3_svc = Web3BaseService()
                total_refund = sum(c.amount for c in contributions)
                # ERC-20 transfer ABI for USDC refund
                transfer_abi = [
                    {
                        "inputs": [
                            {"name": "_to", "type": "address"},
                            {"name": "_value", "type": "uint256"},
                        ],
                        "name": "transfer",
                        "outputs": [{"name": "", "type": "bool"}],
                        "stateMutability": "nonpayable",
                        "type": "function",
                    }
                ]
                from web3 import Web3 as _W3

                amount_int = int(Decimal(str(total_refund)) * Decimal(10**6))  # USDC = 6 decimals
                await web3_svc.execute_contract(
                    sale.payment_token,
                    transfer_abi,
                    "transfer",
                    _W3.to_checksum_address(wallet.address),
                    amount_int,
                )
        except Exception:
            import logging

            logging.getLogger(__name__).error(
                "On-chain USDC refund failed during claim_refund for user=%s sale=%s",
                user_id,
                sale_id,
                exc_info=True,
            )
            # Revert refund status so DB stays consistent with on-chain state
            for contrib in contributions:
                contrib.status = ContributionStatus.PENDING
            await self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "code": "ONCHAIN_REFUND_FAILED",
                    "message": "On-chain USDC refund failed. Please retry.",
                },
            ) from None

        await self.db.commit()

        return contributions
