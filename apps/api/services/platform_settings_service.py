"""Service for platform-wide settings (persisted to database)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.platform_setting import PlatformSetting

_DEFAULT_SETTINGS: dict[str, str] = {
    "default_fee_bps": "200",
    "blocked_countries": "US",
    "kyc_min_level": "2",
}


class PlatformSettingsService:
    """Manages platform settings in the database with fallback defaults."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def load(self) -> dict[str, str]:
        """Load all platform settings, merging stored values with defaults."""
        result = await self._db.execute(select(PlatformSetting))
        rows = result.scalars().all()
        stored = {row.key: row.value for row in rows}
        return {**_DEFAULT_SETTINGS, **stored}

    async def upsert(self, key: str, value: str) -> None:
        """Insert or update a single platform setting."""
        result = await self._db.execute(
            select(PlatformSetting).where(PlatformSetting.key == key)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = value
        else:
            self._db.add(PlatformSetting(key=key, value=value))

    async def update_many(
        self,
        *,
        default_fee_bps: str | None = None,
        blocked_countries: str | None = None,
        kyc_min_level: str | None = None,
    ) -> dict[str, str]:
        """Update multiple settings and return the full current settings dict."""
        if default_fee_bps is not None:
            await self.upsert("default_fee_bps", default_fee_bps)
        if blocked_countries is not None:
            await self.upsert("blocked_countries", blocked_countries)
        if kyc_min_level is not None:
            await self.upsert("kyc_min_level", kyc_min_level)
        await self._db.commit()
        return await self.load()
