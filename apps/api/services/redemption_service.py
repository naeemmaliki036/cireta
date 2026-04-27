"""Redemption service for commodity token redemptions."""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.enums import RedemptionStatus
from apps.api.models.redemption_request import RedemptionRequest
from apps.api.models.token import Token
from apps.api.models.user import User


class RedemptionService:
    """Service for redemption operations."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize redemption service."""
        self.db = db

    async def create_request(
        self,
        user_id: UUID,
        token_id: UUID,
        amount: Decimal,
        fulfillment_method: str,
        notes: str | None = None,
    ) -> RedemptionRequest:
        """Create a new redemption request.

        Args:
            user_id: User UUID.
            token_id: Token UUID.
            amount: Amount to redeem.
            fulfillment_method: Physical delivery or cash.
            notes: Optional notes.

        Returns:
            Created redemption request.

        Raises:
            HTTPException: If not eligible.
        """
        # Check user KYC
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )

        if not user.can_invest:  # Same KYC requirement as investing
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "KYC_REQUIRED", "message": "KYC level 2 required"},
            )

        # Check token exists
        token_result = await self.db.execute(select(Token).where(Token.id == token_id))
        token = token_result.scalar_one_or_none()

        if not token:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "TOKEN_NOT_FOUND", "message": "Token not found"},
            )

        # Create redemption request
        redemption = RedemptionRequest()
        redemption.user_id = user_id
        redemption.token_id = token_id
        redemption.amount = amount
        redemption.fulfillment_method = fulfillment_method
        redemption.notes = notes

        self.db.add(redemption)
        await self.db.commit()
        await self.db.refresh(redemption)

        return redemption

    async def get_user_requests(self, user_id: UUID) -> list[RedemptionRequest]:
        """Get all redemption requests for a user.

        Args:
            user_id: User UUID.

        Returns:
            List of redemption requests with token info.
        """
        result = await self.db.execute(
            select(RedemptionRequest)
            .options(selectinload(RedemptionRequest.token))
            .where(RedemptionRequest.user_id == user_id)
            .order_by(RedemptionRequest.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_requests(
        self,
        user_id: UUID,
        token_id: UUID | None = None,
    ) -> list[RedemptionRequest]:
        """Get redemption requests for a user, optionally filtered by token.

        Args:
            user_id: User UUID.
            token_id: Optional token UUID filter.

        Returns:
            List of redemption requests.
        """
        query = (
            select(RedemptionRequest)
            .options(selectinload(RedemptionRequest.token))
            .where(RedemptionRequest.user_id == user_id)
        )
        if token_id is not None:
            query = query.where(RedemptionRequest.token_id == token_id)
        query = query.order_by(RedemptionRequest.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def cancel_request(
        self,
        user_id: UUID,
        request_id: UUID,
    ) -> RedemptionRequest:
        """Cancel a pending redemption request (investor-initiated).

        Only the requester may cancel, and only while still PENDING.
        Issuer/admin cancellations go through update_fulfillment.
        """
        result = await self.db.execute(
            select(RedemptionRequest).where(RedemptionRequest.id == request_id)
        )
        redemption = result.scalar_one_or_none()

        if not redemption:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "REQUEST_NOT_FOUND", "message": "Redemption request not found"},
            )

        if redemption.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "NOT_OWNER", "message": "You can only cancel your own redemption requests"},
            )

        current = redemption.status if isinstance(redemption.status, RedemptionStatus) else RedemptionStatus(redemption.status)
        if current != RedemptionStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "NOT_CANCELLABLE",
                    "message": f"Cannot cancel request in {current.value} state — only pending requests can be cancelled.",
                },
            )

        redemption.status = RedemptionStatus.CANCELLED
        await self.db.commit()
        await self.db.refresh(redemption)
        return redemption

    async def update_fulfillment(
        self,
        request_id: UUID,
        status: str | RedemptionStatus,
        tx_hash: str | None = None,
        notes: str | None = None,
    ) -> RedemptionRequest:
        """Update redemption fulfillment status.

        This is an admin/issuer operation.

        Args:
            request_id: Request UUID.
            status: New status.
            tx_hash: Burn transaction hash.
            notes: Additional notes.

        Returns:
            Updated redemption request.
        """
        result = await self.db.execute(
            select(RedemptionRequest).where(RedemptionRequest.id == request_id)
        )
        redemption = result.scalar_one_or_none()

        if not redemption:
            raise HTTPException(
                status_code=404,
                detail={"code": "REQUEST_NOT_FOUND", "message": "Redemption request not found"},
            )

        # Coerce string to enum
        if isinstance(status, str):
            status = RedemptionStatus(status)

        redemption.status = status
        if tx_hash:
            redemption.tx_hash = tx_hash
        if notes:
            redemption.notes = notes

        if status in (RedemptionStatus.FULFILLED, "fulfilled"):
            redemption.fulfilled_at = datetime.now(UTC)

            # Wire approval to on-chain RedemptionManager
            await self._approve_on_chain(redemption)

        await self.db.commit()
        await self.db.refresh(redemption)

        return redemption

    async def _approve_on_chain(self, redemption: RedemptionRequest) -> None:
        """Call RedemptionManager.fulfil(id) on-chain to burn held tokens."""
        import logging

        log = logging.getLogger(__name__)

        try:
            token_result = await self.db.execute(
                select(Token).where(Token.id == redemption.token_id)
            )
            token = token_result.scalar_one_or_none()
            if not token or not getattr(token, "redemption_manager_address", None):
                log.warning(
                    "No redemption_manager_address for token=%s, skipping on-chain fulfilment",
                    redemption.token_id,
                )
                return

            from apps.api.services.web3_base_service import Web3BaseService

            abi = [
                {
                    "inputs": [{"name": "id", "type": "uint256"}],
                    "name": "fulfil",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function",
                }
            ]
            on_chain_id = getattr(redemption, "on_chain_request_id", None)
            if on_chain_id is None:
                log.warning(
                    "No on_chain_request_id for redemption=%s, skipping on-chain fulfilment",
                    redemption.id,
                )
                return

            svc = Web3BaseService()
            receipt = await svc.execute_contract(
                token.redemption_manager_address,
                abi,
                "fulfil",
                on_chain_id,
            )
            redemption.tx_hash = receipt.transactionHash.hex()
            log.info(
                "On-chain fulfil called for redemption=%s token=%s tx=%s",
                redemption.id,
                redemption.token_id,
                redemption.tx_hash,
            )
        except Exception:
            log.error(
                "Failed to call on-chain fulfil for redemption=%s",
                redemption.id,
                exc_info=True,
            )
