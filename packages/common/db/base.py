"""SQLAlchemy declarative base."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models.

    Uses DeclarativeBase for modern SQLAlchemy 2.0 patterns.
    All models should inherit from this class.

    Example:
        class User(Base):
            __tablename__ = "users"

            id: Mapped[int] = mapped_column(primary_key=True)
            email: Mapped[str] = mapped_column(String(255), unique=True)
    """

    pass
