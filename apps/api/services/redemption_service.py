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
        shipping_address_id: UUID | None = None,
        delivery_name: str | None = None,
        delivery_address: str | None = None,
        delivery_phone: str | None = None,
        delivery_country: str | None = None,
    ) -> RedemptionRequest:
        """Create a new redemption request.

        For physical fulfilment, the caller supplies either:
          - shipping_address_id pointing at an existing book row (preferred),
            in which case the snapshot fields are copied from that row, or
          - explicit delivery_name/address/phone/country fields for an
            address the user didn't save.

        The free-text delivery_* columns on the redemption row are the
        immutable snapshot — they don't track the book row after creation,
        so editing the book later won't rewrite past redemptions.

        Args:
            user_id: User UUID.
            token_id: Token UUID.
            amount: Amount to redeem.
            fulfillment_method: Physical delivery or cash.
            notes: Optional notes.
            shipping_address_id: Optional FK to user's saved address.
            delivery_*: Inline address fields when no book row is used.

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

        # Resolve the picked book row (if any) into snapshot fields. The
        # snapshot is what the issuer ships against — the book row is just
        # a convenience pointer for analytics + the "I shipped this same
        # address before" UX.
        snapshot_country: str | None = delivery_country
        snapshot_name = delivery_name
        snapshot_addr = delivery_address
        snapshot_phone = delivery_phone

        if shipping_address_id is not None:
            from apps.api.models.shipping_address import ShippingAddress

            addr_result = await self.db.execute(
                select(ShippingAddress).where(
                    ShippingAddress.id == shipping_address_id,
                    ShippingAddress.user_id == user_id,
                )
            )
            book_row = addr_result.scalar_one_or_none()
            if book_row is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={
                        "code": "ADDRESS_NOT_FOUND",
                        "message": "Shipping address not found in your book",
                    },
                )
            snapshot_name = book_row.recipient_name
            snapshot_addr = self._format_address(book_row)
            snapshot_phone = book_row.phone
            snapshot_country = book_row.country

        # Compute the cross-country flag (soft warning, never blocks).
        country_mismatch = self._country_mismatch(user, snapshot_country)

        redemption = RedemptionRequest()
        redemption.user_id = user_id
        redemption.token_id = token_id
        redemption.amount = amount
        redemption.fulfillment_method = fulfillment_method
        redemption.notes = notes
        redemption.shipping_address_id = shipping_address_id
        redemption.delivery_name = snapshot_name
        redemption.delivery_address = snapshot_addr
        redemption.delivery_phone = snapshot_phone
        redemption.shipping_country_mismatch = country_mismatch

        self.db.add(redemption)
        await self.db.commit()
        await self.db.refresh(redemption)

        return redemption

    @staticmethod
    def _format_address(addr) -> str:
        """Flatten a ShippingAddress into the single-string snapshot the
        issuer reads on the redemption row."""
        lines = [
            addr.line1,
            addr.line2,
            ", ".join(filter(None, [addr.city, addr.region, addr.postal_code])),
            addr.country,
        ]
        return "\n".join(line for line in lines if line)

    @staticmethod
    def _country_mismatch(user: User, shipping_country: str | None) -> bool:
        """True iff shipping country differs from the user's verified home
        country. Falls back to self-reported country when verified is unset.
        Always False when we have no shipping country (cash redemption)."""
        if not shipping_country:
            return False
        # Corporate users use company jurisdiction; retail uses residence.
        kyc_type = getattr(user, "kyc_type", None)
        is_corporate = kyc_type == "corporate" or getattr(user, "kyc_level", 0) == 4
        if is_corporate:
            home = (
                getattr(user, "verified_company_jurisdiction", None)
                or getattr(user, "company_jurisdiction", None)
            )
        else:
            home = (
                getattr(user, "verified_country_of_residence", None)
                or getattr(user, "country_of_residence", None)
            )
        if not home:
            return False
        return shipping_country.upper() != home.upper()

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
