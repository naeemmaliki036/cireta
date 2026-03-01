"""Issuer service for managing token issuers."""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.enums import IssuerStatus
from apps.api.models.issuer import Issuer
from apps.api.models.user import User


class IssuerService:
    """Service for issuer management."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize issuer service."""
        self.db = db

    async def onboard_issuer(
        self,
        user_id: UUID,
        name: str,
        slug: str,
        legal_entity_name: str | None = None,
        jurisdiction: str | None = None,
        wallet_address: str | None = None,
    ) -> Issuer:
        """Onboard a new issuer.

        Args:
            user_id: User UUID to become issuer.
            name: Issuer display name.
            slug: URL-friendly unique identifier.
            legal_entity_name: Legal entity name.
            jurisdiction: Legal jurisdiction.
            wallet_address: Issuer wallet address.

        Returns:
            Created issuer.

        Raises:
            HTTPException: If user not found or already issuer.
        """
        # Check user exists
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            )

        # Check not already an issuer
        existing_result = await self.db.execute(
            select(Issuer).where(Issuer.user_id == user_id)
        )
        if existing_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_ISSUER", "message": "User is already an issuer"},
            )

        # Check slug uniqueness
        slug_result = await self.db.execute(
            select(Issuer).where(Issuer.slug == slug)
        )
        if slug_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "SLUG_EXISTS", "message": "Slug already in use"},
            )

        # Create issuer
        issuer = Issuer()
        issuer.user_id = user_id
        issuer.name = name
        issuer.slug = slug
        issuer.legal_entity_name = legal_entity_name
        issuer.jurisdiction = jurisdiction
        issuer.wallet_address = wallet_address
        issuer.status = IssuerStatus.PENDING

        self.db.add(issuer)
        await self.db.commit()
        await self.db.refresh(issuer)

        return issuer

    async def list_issuers(
        self, page: int = 1, size: int = 20, status_filter: IssuerStatus | None = None
    ) -> tuple[list[Issuer], int]:
        """List issuers with pagination.

        Args:
            page: Page number (1-indexed).
            size: Page size.
            status_filter: Optional status filter.

        Returns:
            Tuple of (issuers, total_count).
        """
        query = select(Issuer).order_by(Issuer.created_at.desc())

        if status_filter:
            query = query.where(Issuer.status == status_filter)

        # Count total
        count_query = select(func.count()).select_from(Issuer)
        if status_filter:
            count_query = count_query.where(Issuer.status == status_filter)
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Paginate
        query = query.offset((page - 1) * size).limit(size)
        result = await self.db.execute(query)
        issuers = list(result.scalars().all())

        return issuers, total

    async def set_fee(self, issuer_id: UUID, fee_bps: int) -> Issuer:
        """Update issuer fee.

        Args:
            issuer_id: Issuer UUID.
            fee_bps: Fee in basis points (0-10000).

        Returns:
            Updated issuer.
        """
        result = await self.db.execute(select(Issuer).where(Issuer.id == issuer_id))
        issuer = result.scalar_one_or_none()

        if not issuer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "ISSUER_NOT_FOUND", "message": "Issuer not found"},
            )

        if not (0 <= fee_bps <= 10000):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_FEE", "message": "Fee must be between 0 and 10000 bps"},
            )

        issuer.fee_bps = fee_bps
        await self.db.commit()
        await self.db.refresh(issuer)

        return issuer

    async def revoke_issuer(self, issuer_id: UUID) -> Issuer:
        """Revoke/suspend an issuer.

        Args:
            issuer_id: Issuer UUID.

        Returns:
            Updated issuer.
        """
        result = await self.db.execute(select(Issuer).where(Issuer.id == issuer_id))
        issuer = result.scalar_one_or_none()

        if not issuer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "ISSUER_NOT_FOUND", "message": "Issuer not found"},
            )

        issuer.status = IssuerStatus.SUSPENDED
        await self.db.commit()
        await self.db.refresh(issuer)

        return issuer

    async def activate_issuer(self, issuer_id: UUID) -> Issuer:
        """Activate a pending issuer.

        Args:
            issuer_id: Issuer UUID.

        Returns:
            Updated issuer.
        """
        result = await self.db.execute(select(Issuer).where(Issuer.id == issuer_id))
        issuer = result.scalar_one_or_none()

        if not issuer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "ISSUER_NOT_FOUND", "message": "Issuer not found"},
            )

        issuer.status = IssuerStatus.ACTIVE
        await self.db.commit()
        await self.db.refresh(issuer)

        return issuer
