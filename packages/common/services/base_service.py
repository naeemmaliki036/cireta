"""Base service class with common operations."""

from typing import Generic, TypeVar, Type, Sequence

from sqlalchemy.orm import Session

from packages.common.db.base import Base
from packages.common.db.repository import Repository


T = TypeVar("T", bound=Base)


class BaseService(Generic[T]):
    """Base service class providing common CRUD operations.

    Services contain business logic and delegate data access to repositories.
    Extend this class for domain-specific business logic.

    Example:
        class UserService(BaseService[User]):
            def create_user(self, data: UserCreate) -> User:
                # Business logic (validation, side effects)
                self._validate_email_unique(data.email)

                user = User(email=data.email, ...)
                return self.create(user)
    """

    def __init__(self, db: Session, model: Type[T]) -> None:
        """Initialize service with database session and model class."""
        self.db = db
        self.model = model
        self.repository = Repository(db, model)

    def get(self, id: int) -> T | None:
        """Get a single record by ID."""
        return self.repository.get(id)

    def get_or_raise(self, id: int) -> T:
        """Get a single record by ID, raise if not found."""
        return self.repository.get_or_raise(id)

    def get_all(self, *, skip: int = 0, limit: int = 100) -> Sequence[T]:
        """Get all records with pagination."""
        return self.repository.get_all(skip=skip, limit=limit)

    def count(self) -> int:
        """Count all records."""
        return self.repository.count()

    def create(self, obj: T) -> T:
        """Create a new record."""
        return self.repository.create(obj)

    def update(self, obj: T) -> T:
        """Update an existing record."""
        return self.repository.update(obj)

    def delete(self, obj: T) -> None:
        """Delete a record."""
        self.repository.delete(obj)

    def delete_by_id(self, id: int) -> bool:
        """Delete a record by ID. Returns True if deleted."""
        return self.repository.delete_by_id(id)

    def exists(self, id: int) -> bool:
        """Check if a record exists by ID."""
        return self.repository.exists(id)
