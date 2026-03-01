"""Base model with common fields."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.db.base import Base


class BaseModel(Base):
    """Abstract base model with common fields.

    Provides:
    - UUID primary key (auto-generated)
    - Created/updated timestamps with automatic management

    All models should inherit from this class.

    Example:
        class User(BaseModel):
            __tablename__ = "users"

            email: Mapped[str] = mapped_column(String(255), unique=True)
    """

    __abstract__ = True

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        insert_default=datetime.now,
    )

    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=None,
        onupdate=lambda: datetime.now(UTC),
    )
