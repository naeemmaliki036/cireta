"""EmailTemplate model for admin-editable transactional emails."""

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from packages.common.models.base import BaseModel


class EmailTemplate(BaseModel):
    """Admin-editable email template.

    Templates use {{variable}} placeholders rendered at send time.
    """

    __tablename__ = "email_templates"

    key: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    subject: Mapped[str] = mapped_column(String(255))
    html_body: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    def __repr__(self) -> str:
        return f"<EmailTemplate(key={self.key})>"
