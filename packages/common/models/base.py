"""Base model with common fields."""

from datetime import datetime, UTC

from sqlalchemy import DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.db.base import Base


class BaseModel(Base):
    """Abstract base model with common fields.

    Provides:
    - Auto-incrementing integer ID
    - Created/updated timestamps with automatic management

    All models should inherit from this class.

    Example:
        class User(BaseModel):
            __tablename__ = "users"

            email: Mapped[str] = mapped_column(String(255), unique=True)
    """

    __abstract__ = True

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
        init=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default_factory=lambda: datetime.now(UTC),
        init=False,
    )

    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=None,
        onupdate=lambda: datetime.now(UTC),
        init=False,
    )
