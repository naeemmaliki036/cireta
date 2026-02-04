"""Generic repository pattern for database operations."""

from typing import Generic, TypeVar, Type, Sequence

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from packages.common.db.base import Base


T = TypeVar("T", bound=Base)


class Repository(Generic[T]):
    """Generic repository for CRUD operations.

    Provides common database operations for any model type.
    Extend this class for model-specific queries.

    Example:
        class UserRepository(Repository[User]):
            def get_by_email(self, email: str) -> User | None:
                return self.db.execute(
                    select(User).where(User.email == email)
                ).scalar_one_or_none()
    """

    def __init__(self, db: Session, model: Type[T]) -> None:
        """Initialize repository with database session and model class."""
        self.db = db
        self.model = model

    def get(self, id: int) -> T | None:
        """Get a single record by ID."""
        return self.db.get(self.model, id)

    def get_or_raise(self, id: int) -> T:
        """Get a single record by ID, raise if not found."""
        instance = self.get(id)
        if instance is None:
            raise ValueError(f"{self.model.__name__} with id {id} not found")
        return instance

    def get_all(self, *, skip: int = 0, limit: int = 100) -> Sequence[T]:
        """Get all records with pagination."""
        stmt = select(self.model).offset(skip).limit(limit)
        return self.db.execute(stmt).scalars().all()

    def count(self) -> int:
        """Count all records."""
        stmt = select(func.count()).select_from(self.model)
        return self.db.execute(stmt).scalar_one()

    def create(self, obj: T) -> T:
        """Create a new record."""
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        return obj

    def update(self, obj: T) -> T:
        """Update an existing record."""
        self.db.commit()
        self.db.refresh(obj)
        return obj

    def delete(self, obj: T) -> None:
        """Delete a record."""
        self.db.delete(obj)
        self.db.commit()

    def delete_by_id(self, id: int) -> bool:
        """Delete a record by ID. Returns True if deleted, False if not found."""
        obj = self.get(id)
        if obj is None:
            return False
        self.delete(obj)
        return True

    def exists(self, id: int) -> bool:
        """Check if a record exists by ID."""
        stmt = select(func.count()).select_from(self.model).where(self.model.id == id)
        return self.db.execute(stmt).scalar_one() > 0
