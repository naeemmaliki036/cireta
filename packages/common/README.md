# Common Package (Backend)

Shared Python code for backend applications.

## Structure

```
common/
├── core/              # Core utilities
│   ├── config.py      # Settings class with env validation
│   ├── logging.py     # Structured logging with PII filter
│   ├── auth_deps.py   # Authentication dependencies
│   └── service_deps.py # Service factory functions
│
├── config/
│   └── defaults.py    # Safe defaults (no secrets)
│
├── db/
│   ├── session.py     # Database session management
│   ├── base.py        # SQLAlchemy declarative base
│   └── repository.py  # Generic repository pattern
│
├── models/
│   ├── base.py        # BaseModel with timestamps
│   ├── user.py        # User model and roles
│   └── encrypted_types.py  # Encrypted field types
│
├── services/
│   ├── base_service.py    # Abstract service base
│   └── auth_service.py    # Authentication service
│
├── schemas/
│   └── base.py        # Pydantic base schemas
│
├── middleware/
│   ├── logging_middleware.py  # Request logging
│   └── security_headers.py    # Security headers
│
└── utils/
    └── base_client.py  # HTTP client utilities
```

## Usage

```python
from packages.common.core.config import settings
from packages.common.db.session import get_db
from packages.common.models.user import User, UserRole
from packages.common.services.auth_service import AuthService
```

## Configuration

The configuration uses a two-tier system:

1. **defaults.py** - Safe defaults, version controlled
2. **config.py** - Settings class, reads environment variables

```python
# Safe defaults
from packages.common.config.defaults import DEFAULTS

# Runtime settings (with env overrides)
from packages.common.core.config import settings
```
