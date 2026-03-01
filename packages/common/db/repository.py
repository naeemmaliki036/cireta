"""Generic async repository pattern for database operations."""

from collections.abc import Sequence
from typing import Any, Generic, TypeVar
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.common.db.base import Base
from packages.common.utils.http_errors import raise_conflict, raise_not_found

T = TypeVar("T", bound=Base)
IdType = UUID | str


class Repository(Generic[T]):
    """Generic async repository for CRUD operations.

    Provides common database operations for any model type.
    Extend this class for model-specific queries.

    Example:
        class UserRepository(Repository[User]):
            async def get_by_email(self, email: str) -> User | None:
                result = await self.db.execute(
                    select(User).where(User.email == email)
                )
                return result.scalar_one_or_none()
    """

    def __init__(self, db: AsyncSession, model: type[T]) -> None:
        """Initialize repository with async database session and model class."""
        self.db = db
        self.model = model

    async def get(self, id: IdType) -> T | None:
        """Get a single record by ID."""
        return await self.db.get(self.model, id)

    async def get_or_raise(self, id: IdType) -> T:
        """Get a single record by ID, raise ValueError if not found."""
        instance = await self.get(id)
        if instance is None:
            raise ValueError(f"{self.model.__name__} with id {id} not found")
        return instance

    async def get_or_404(
        self,
        id: IdType,
        *,
        entity_type: str | None = None,
        error_code: str | None = None,
    ) -> T:
        """Get a single record by ID, raise HTTPException 404 if not found.

        Args:
            id: Primary key value (UUID)
            entity_type: Human-readable entity name (defaults to model class name)
            error_code: Custom error code (auto-generated if not provided)

        Returns:
            Model instance

        Raises:
            HTTPException: 404 with structured error if not found
        """
        instance = await self.get(id)
        if instance is None:
            entity = entity_type or self.model.__name__
            raise_not_found(entity, id, error_code=error_code)
        return instance

    async def get_by(self, **filters: Any) -> T | None:
        """Get a single record by arbitrary field(s).

        Args:
            **filters: Field=value pairs for filtering

        Returns:
            Model instance or None if not found

        Example:
            user = await repo.get_by(email="test@example.com")
        """
        stmt = select(self.model)
        for field, value in filters.items():
            column = getattr(self.model, field)
            stmt = stmt.where(column == value)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_or_404(
        self,
        *,
        entity_type: str | None = None,
        error_code: str | None = None,
        **filters: Any,
    ) -> T:
        """Get a single record by field(s), raise HTTPException 404 if not found.

        Args:
            entity_type: Human-readable entity name (defaults to model class name)
            error_code: Custom error code (auto-generated if not provided)
            **filters: Field=value pairs for filtering

        Returns:
            Model instance

        Raises:
            HTTPException: 404 with structured error if not found
        """
        instance = await self.get_by(**filters)
        if instance is None:
            entity = entity_type or self.model.__name__
            raise_not_found(entity, error_code=error_code)
        return instance

    async def check_exists_or_409(
        self,
        *,
        entity_type: str | None = None,
        error_code: str | None = None,
        message: str | None = None,
        **filters: Any,
    ) -> None:
        """Raise 409 Conflict if a record exists.

        Useful for checking duplicate entries before create operations.

        Args:
            entity_type: Human-readable entity name (defaults to model class name)
            error_code: Custom error code (auto-generated if not provided)
            message: Custom error message (auto-generated if not provided)
            **filters: Field=value pairs for filtering

        Raises:
            HTTPException: 409 with structured error if record exists
        """
        if await self.get_by(**filters) is not None:
            entity = entity_type or self.model.__name__
            msg = message or f"{entity} already exists"
            raise_conflict(msg, error_code=error_code)

    async def get_all(self, *, skip: int = 0, limit: int = 100) -> Sequence[T]:
        """Get all records with pagination."""
        stmt = select(self.model).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def count(self) -> int:
        """Count all records."""
        stmt = select(func.count()).select_from(self.model)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def create(self, obj: T) -> T:
        """Create a new record."""
        self.db.add(obj)
        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def update(self, obj: T) -> T:
        """Update an existing record."""
        await self.db.flush()
        await self.db.refresh(obj)
        return obj

    async def delete(self, obj: T) -> None:
        """Delete a record."""
        await self.db.delete(obj)
        await self.db.flush()

    async def delete_by_id(self, id: IdType) -> bool:
        """Delete a record by ID. Returns True if deleted, False if not found."""
        obj = await self.get(id)
        if obj is None:
            return False
        await self.delete(obj)
        return True

    async def exists(self, id: IdType) -> bool:
        """Check if a record exists by ID."""
        stmt = select(func.count()).select_from(self.model).where(self.model.id == id)
        result = await self.db.execute(stmt)
        return result.scalar_one() > 0
