"""SQLAlchemy declarative base."""

from sqlalchemy.orm import DeclarativeBase, MappedAsDataclass


class Base(DeclarativeBase, MappedAsDataclass):
    """Base class for all SQLAlchemy models.

    Combines DeclarativeBase with MappedAsDataclass for modern SQLAlchemy 2.0 patterns.
    All models should inherit from this class.

    Example:
        class User(Base):
            __tablename__ = "users"

            id: Mapped[int] = mapped_column(primary_key=True, init=False)
            email: Mapped[str] = mapped_column(String(255), unique=True)
    """
    pass
