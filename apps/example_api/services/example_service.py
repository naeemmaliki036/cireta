"""Example service demonstrating service layer pattern."""

from sqlalchemy.orm import Session

from packages.common.services.base_service import BaseService
from packages.common.models.base import BaseModel


class ExampleService(BaseService[BaseModel]):
    """Example service demonstrating service layer architecture.

    Services contain business logic and coordinate between:
    - Repositories (data access)
    - Other services (cross-cutting concerns)
    - External APIs

    Example usage:
        class UserService(BaseService[User]):
            def __init__(self, db: Session, auth_service: AuthService):
                super().__init__(db, User)
                self.auth_service = auth_service

            async def create_user(self, data: UserCreate) -> User:
                # Business logic
                self.auth_service.validate_password(data.password)

                # Create entity
                hashed = self.auth_service.hash_password(data.password)
                user = User(email=data.email, hashed_password=hashed)

                return self.create(user)
    """

    def __init__(self, db: Session) -> None:
        """Initialize example service.

        Args:
            db: Database session for data access.
        """
        # Note: In a real service, pass the actual model class
        # super().__init__(db, YourModel)
        self.db = db

    async def example_operation(self) -> dict[str, str]:
        """Example operation demonstrating service method.

        Returns:
            Example response data.
        """
        return {
            "message": "This is an example service operation",
            "status": "success",
        }
