# CLAUDE.md - Backend Coding Standards

## Tech Stack

- **Framework**: FastAPI
- **ORM**: SQLAlchemy 2.0
- **Migrations**: Alembic
- **Validation**: Pydantic v2
- **Language**: Python 3.11+

## Architecture

### Request Flow

```
Router (api/v1/) → Service Layer (services/) → Repository → Database
                          ↓
                    External APIs
```

### Key Principles

- **Thin Controllers**: Endpoints delegate to services
- **Service Layer**: Business logic lives in services/
- **Dependency Injection**: All dependencies via `Depends()`
- **Type Safety**: Full type annotations throughout

## Service Layer Architecture

### Pattern

```python
# Thin endpoint - just routing and validation
@router.post("/users", response_model=UserResponse)
async def create_user(
    data: UserCreate,
    service: Annotated[UserService, Depends(get_user_service)],
) -> User:
    return await service.create_user(data)

# Service - business logic
class UserService(BaseService[User]):
    def __init__(self, db: Session, auth_service: AuthService):
        super().__init__(db, User)
        self.auth_service = auth_service

    async def create_user(self, data: UserCreate) -> User:
        # Validation
        self.auth_service.validate_password(data.password)

        # Business logic
        hashed = self.auth_service.hash_password(data.password)
        user = User(email=data.email, hashed_password=hashed)

        return self.create(user)
```

### Service Factory Functions

```python
# packages/common/core/service_deps.py
async def get_user_service(
    db: Annotated[Session, Depends(get_db)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> UserService:
    return UserService(db, auth_service)
```

## Dependency Injection

Always use `Depends()` for:
- Database sessions
- Services
- Authentication
- Configuration

```python
@router.get("/protected")
async def protected_route(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ExampleService, Depends(get_example_service)],
) -> Response:
    ...
```

## Model Patterns

### ID Strategy

- **Integer**: Auth entities (users, api_keys) - better query performance
- **UUID**: Distributed entities (conversations, messages) - no collisions

### Encrypted Fields

```python
from packages.common.models.encrypted_types import EncryptedString

class ApiKey(BaseModel):
    __tablename__ = "api_keys"

    # Encrypted at rest
    secret: Mapped[str] = mapped_column(EncryptedString())
```

## Error Handling

Use HTTPException with structured error responses:

```python
from fastapi import HTTPException, status

raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail={
        "code": "USER_NOT_FOUND",
        "message": "User with this ID does not exist",
    },
)
```

## Middleware Stack

Order matters - applied bottom to top:

```python
# main.py
app.add_middleware(CORSMiddleware, ...)  # 4. CORS
app.add_middleware(SecurityHeadersMiddleware)  # 3. Security
app.add_middleware(LoggingMiddleware)  # 2. Logging
# 1. Request processing
```

## File Organization

```
example_api/
├── __init__.py
├── main.py           # FastAPI app initialization
├── api/
│   └── v1/
│       ├── __init__.py
│       ├── router.py  # Route registration
│       └── endpoints/
│           └── health.py
├── services/
│   └── example_service.py
└── core/
    └── config.py     # App-specific config
```

## Import Conventions

```python
# 1. Standard library
from typing import Annotated

# 2. Third-party
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

# 3. Packages (shared code)
from packages.common.db.session import get_db
from packages.common.models.user import User

# 4. Local
from apps.example_api.services.example_service import ExampleService
```

## Testing

```python
# Use dependency overrides for testing
app.dependency_overrides[get_db] = lambda: test_db
app.dependency_overrides[get_current_user] = lambda: mock_user
```
