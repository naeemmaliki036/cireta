"""Sale write service — create, contribute, finalize, claim, refund."""

from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.enums import SaleStatus
from apps.api.models.sale_phase import SalePhase
from apps.api.models.token import Token
from apps.api.models.token_sale import TokenSale


class SaleCreateService:
    """Create and setup token sales."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize sale service."""
        self.db = db

    async def create_sale(
        self,
        user_id: UUID,
        token_id: UUID | None,
        payment_token: str,
        soft_cap: Decimal,
        hard_cap: Decimal,
        phases: list[dict],
        title: str | None = None,
        description: str | None = None,
        full_description: str | None = None,
        banner_image_url: str | None = None,
        is_coming_soon: bool = False,
        otc_enabled: bool = False,
        otc_content: str | None = None,
        website_url: str | None = None,
        twitter_url: str | None = None,
        linkedin_url: str | None = None,
        instagram_url: str | None = None,
        facebook_url: str | None = None,
        telegram_url: str | None = None,
        discord_url: str | None = None,
        sale_mode: str = "vested",
        sale_structure: str = "phase_allocated",
        cliff_duration_seconds: int = 0,
        vesting_duration_seconds: int = 365 * 86400,
        is_redeemable: bool = False,
    ) -> TokenSale:
        """Create a new token sale.

        Args:
            user_id: User UUID (must be token issuer).
            token_id: Token UUID.
            payment_token: Payment token address (USDC).
            soft_cap: Minimum funding goal.
            hard_cap: Maximum funding cap.
            phases: List of phase configurations.

        Returns:
            Created token sale.

        Raises:
            HTTPException: If not authorized or invalid configuration.
        """
        from apps.api.models.issuer import Issuer

        # If token_id is provided, validate ownership and deployment
        token = None
        issuer = None
        if token_id:
            result = await self.db.execute(
                select(Token).options(selectinload(Token.issuer)).where(Token.id == token_id)
            )
            token = result.scalar_one_or_none()

            if not token:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "TOKEN_NOT_FOUND", "message": "Token not found"},
                )

            if not token.issuer or token.issuer.user_id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"code": "NOT_AUTHORIZED", "message": "Not authorized to manage this token"},
                )
            issuer = token.issuer
        else:
            # No token — look up issuer directly from user
            issuer_result = await self.db.execute(
                select(Issuer).where(Issuer.user_id == user_id)
            )
            issuer = issuer_result.scalar_one_or_none()
            if not issuer:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"code": "NOT_AUTHORIZED", "message": "Issuer account required"},
                )

        if hard_cap < soft_cap:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "INVALID_CAPS", "message": "Hard cap must be >= soft cap"},
            )

        # Create sale
        sale = TokenSale()
        sale.token_id = token_id if token_id else None
        sale.issuer_id = issuer.id
        sale.payment_token = payment_token
        sale.soft_cap = soft_cap
        sale.hard_cap = hard_cap
        sale.title = title
        sale.description = description
        sale.full_description = full_description
        sale.banner_image_url = banner_image_url
        sale.is_coming_soon = is_coming_soon
        sale.otc_enabled = otc_enabled
        # Auto-load platform default OTC content if enabled and no custom content
        if otc_enabled and not otc_content:
            from apps.api.models.platform_setting import PlatformSetting
            default_result = await self.db.execute(
                select(PlatformSetting).where(PlatformSetting.key == "otc_default_content")
            )
            default_setting = default_result.scalar_one_or_none()
            if default_setting:
                sale.otc_content = default_setting.value
        else:
            sale.otc_content = otc_content
        sale.website_url = website_url
        sale.twitter_url = twitter_url
        sale.linkedin_url = linkedin_url
        sale.instagram_url = instagram_url
        sale.facebook_url = facebook_url
        sale.telegram_url = telegram_url
        sale.discord_url = discord_url
        sale.sale_mode = sale_mode
        sale.sale_structure = sale_structure
        sale.cliff_duration_seconds = cliff_duration_seconds
        sale.vesting_duration_seconds = vesting_duration_seconds
        sale.is_redeemable = is_redeemable
        sale.status = SaleStatus.DRAFT

        self.db.add(sale)
        await self.db.flush()

        # Create phases
        for i, phase_data in enumerate(phases, start=1):
            phase = SalePhase()
            phase.sale_id = sale.id
            phase.phase_number = i
            phase.name = phase_data["name"]
            phase.price_per_token = phase_data["price_per_token"]
            phase.allocation = phase_data["allocation"]
            phase.min_contribution = phase_data.get("min_contribution", Decimal("0"))
            phase.max_contribution = phase_data.get("max_contribution", Decimal("0"))
            phase.start_time = phase_data["start_time"]
            phase.end_time = phase_data["end_time"]
            phase.whitelist_only = phase_data.get("whitelist_only", False)

            self.db.add(phase)

        await self.db.commit()

        # Re-fetch with all relations needed by the endpoint response
        result2 = await self.db.execute(
            select(TokenSale)
            .options(
                selectinload(TokenSale.phases),
                selectinload(TokenSale.token),
                selectinload(TokenSale.issuer),
                selectinload(TokenSale.images),
            )
            .where(TokenSale.id == sale.id)
        )
        return result2.scalar_one()
