"""Sale query service — read-only sale lookups and pagination."""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
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
        """Get a sale by the token's slug, or by sale ID for tokenless sales.

        An issuer can deploy multiple sales for the same token (e.g. a
        seed round followed by a public round, or a mistake draft they
        never deleted). Token slug isn't unique across sales, so we
        prefer the publicly visible one: ACTIVE > APPROVED_COMING_SOON >
        APPROVED > everything else, then newest. Without this ordering
        the route returned None whenever any duplicate existed, surfacing
        as a confusing 404 on the public detail page.
        """
        from sqlalchemy import case

        from apps.api.models.enums import SaleStatus
        from apps.api.models.token import Token

        # Status priority — lower = more public-facing.
        status_priority = case(
            (TokenSale.status == SaleStatus.ACTIVE, 0),
            (TokenSale.status == SaleStatus.APPROVED_COMING_SOON, 1),
            (TokenSale.status == SaleStatus.APPROVED, 2),
            (TokenSale.status == SaleStatus.PENDING_APPROVAL, 3),
            (TokenSale.status == SaleStatus.FINALIZED_SUCCESS, 4),
            else_=5,
        )

        query = (
            select(TokenSale)
            .join(Token, TokenSale.token_id == Token.id)
            .where(Token.slug == slug)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
                selectinload(TokenSale.images),
            )
            .order_by(status_priority.asc(), TokenSale.created_at.desc())
            .limit(1)
        )
        result = await self.db.execute(query)
        sale = result.scalar_one_or_none()
        if sale:
            return sale

        # Fallback: try sale ID (coming-soon sales have no token)
        try:
            sale_uuid = UUID(slug)
        except ValueError:
            return None
        query = (
            select(TokenSale)
            .where(TokenSale.id == sale_uuid)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
                selectinload(TokenSale.images),
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
        # Sort: admin-set display_order first (NULLs last), then status priority
        # (active before coming_soon before others), then newest first.
        status_priority = case(
            (TokenSale.status == SaleStatus.ACTIVE, 0),
            (TokenSale.status == SaleStatus.APPROVED, 1),
            (TokenSale.status.in_([SaleStatus.APPROVED_COMING_SOON]), 2),
            else_=3,
        )
        query = (
            select(TokenSale)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
                selectinload(TokenSale.images),
            )
            .order_by(
                TokenSale.display_order.asc().nulls_last(),
                status_priority,
                TokenSale.created_at.desc(),
            )
        )

        count_query = select(func.count()).select_from(TokenSale)

        if public_only:
            query = query.where(TokenSale.is_visible == True)  # noqa: E712
            count_query = count_query.where(TokenSale.is_visible == True)  # noqa: E712
        if status_filter:
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
                selectinload(TokenSale.images),
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
