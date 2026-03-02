"""Sale phase whitelist — addresses permitted to invest in whitelist-only phases."""

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.models.base import BaseModel


class SalePhaseWhitelist(BaseModel):
    """Whitelisted wallet address for a specific sale phase."""

    __tablename__ = "sale_phase_whitelists"

    phase_id: Mapped[PGUUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("sale_phases.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    wallet_address: Mapped[str] = mapped_column(String(42), nullable=False, index=True)
