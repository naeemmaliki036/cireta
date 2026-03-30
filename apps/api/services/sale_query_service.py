"""Sale query service — read-only sale lookups and pagination."""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.enums import SaleStatus
from apps.api.models.token_sale import TokenSale


class SaleQueryService:
    """Read-only sale queries: list, get, get-by-slug."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialise with async DB session."""
        self.db = db

    async def get_sale_by_token_slug(self, slug: str) -> TokenSale | None:
        """Get a sale by the token's slug."""
        from apps.api.models.token import Token

        query = (
            select(TokenSale)
            .join(Token, TokenSale.token_id == Token.id)
            .where(Token.slug == slug)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_sales(
        self,
        page: int = 1,
        size: int = 20,
        status_filter: SaleStatus | None = None,
        public_only: bool = False,
    ) -> tuple[list[TokenSale], int]:
        """List sales with pagination and optional status filter.

        If public_only=True, only returns ACTIVE and APPROVED_COMING_SOON sales.
        """
        query = (
            select(TokenSale)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
            )
            .order_by(TokenSale.created_at.desc())
        )

        count_query = select(func.count()).select_from(TokenSale)

        if public_only:
            visible = [SaleStatus.ACTIVE, SaleStatus.APPROVED_COMING_SOON]
            query = query.where(TokenSale.status.in_(visible))
            count_query = count_query.where(TokenSale.status.in_(visible))
        elif status_filter:
            query = query.where(TokenSale.status == status_filter)
            count_query = count_query.where(TokenSale.status == status_filter)

        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        query = query.offset((page - 1) * size).limit(size)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_sale(self, sale_id: UUID) -> TokenSale:
        """Get a sale by ID with all relations eagerly loaded."""
        result = await self.db.execute(
            select(TokenSale)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
            )
            .where(TokenSale.id == sale_id)
        )
        sale = result.scalar_one_or_none()
        if not sale:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "SALE_NOT_FOUND", "message": "Sale not found"},
            )
        return sale
