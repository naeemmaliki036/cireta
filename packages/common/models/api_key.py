"""API key model for programmatic access.

Provides API key management for applications that need
to support programmatic access in addition to user authentication.
"""

from __future__ import annotations

from datetime import datetime, UTC
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from packages.common.models.base import BaseModel

if TYPE_CHECKING:
    from packages.common.models.user import User


class APIKey(BaseModel):
    """API key for programmatic access.

    API keys provide an alternative authentication mechanism for
    automated systems and integrations. Keys are stored as hashes
    and can have scoped permissions and expiration.

    Attributes:
        user_id: Owner of the API key.
        name: Human-readable name for identification.
        key_prefix: First 8 characters of the key for identification.
        key_hash: Hashed key value (never store plaintext).
        scopes: List of permitted actions (e.g., ["read:users", "write:data"]).
        expires_at: Optional expiration timestamp.
        last_used_at: Timestamp of last successful use.
        is_active: Whether the key is currently active.
    """

    __tablename__ = "api_keys"

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    key_prefix: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        index=True,
    )
    key_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    scopes: Mapped[list[str] | None] = mapped_column(
        ARRAY(String(100)),
        nullable=True,
        default=list,
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="api_keys")

    def __repr__(self) -> str:
        return (
            f"<APIKey(id={self.id}, name='{self.name}', "
            f"prefix='{self.key_prefix}...', active={self.is_active})>"
        )

    @property
    def is_expired(self) -> bool:
        """Check if the API key has expired."""
        if self.expires_at is None:
            return False
        return datetime.now(UTC) > self.expires_at

    @property
    def is_valid(self) -> bool:
        """Check if the API key is valid (active and not expired)."""
        return self.is_active and not self.is_expired

    def has_scope(self, scope: str) -> bool:
        """Check if the API key has a specific scope.

        Supports wildcard matching (e.g., "read:*" matches "read:users").
        """
        if self.scopes is None:
            return False

        for key_scope in self.scopes:
            if key_scope == scope:
                return True
            if key_scope.endswith(":*"):
                prefix = key_scope[:-1]  # Remove "*"
                if scope.startswith(prefix):
                    return True
            if key_scope == "*":
                return True

        return False

    def update_last_used(self) -> None:
        """Update the last_used_at timestamp."""
        self.last_used_at = datetime.now(UTC)
