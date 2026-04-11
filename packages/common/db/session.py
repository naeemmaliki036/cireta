"""Database session management with async support."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from packages.common.core.config import settings


def _async_database_url(url: str) -> str:
    """Ensure the DATABASE_URL uses an async SQLAlchemy driver.

    Railway's Postgres service exposes the connection string as
    ``postgresql://...`` (sync psycopg2) when you reference it via the
    variable picker. SQLAlchemy's ``create_async_engine`` requires an
    async driver like ``postgresql+asyncpg://`` — without it, every
    query raises ``InvalidRequestError: ... 'psycopg2' is not async.``

    Rather than forcing every service to manually rewrite the URL in
    its env vars, we rewrite it here at startup. Leaves URLs that
    already have an async driver alone.
    """
    if not url:
        return url
    if url.startswith("postgresql+asyncpg://") or url.startswith("postgres+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        # Some providers (Heroku legacy, etc.) use the short scheme
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    return url


# Create async engine with connection pooling
engine = create_async_engine(
    _async_database_url(settings.database_url),
    pool_pre_ping=True,  # Verify connections before use
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_recycle=settings.db_pool_recycle,  # Recycle connections after N seconds
    echo=settings.debug,  # Log SQL in debug mode
)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides an async database session.

    Usage:
        @router.get("/users")
        async def get_users(db: DbSession):
            result = await db.execute(select(User))
            ...

    The session is automatically closed after the request completes.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# Type alias for cleaner endpoint signatures
DbSession = Annotated[AsyncSession, Depends(get_db)]
