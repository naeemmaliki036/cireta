# Packages

Shared code libraries used across multiple applications.

## Structure

```
packages/
└── common/              # Python shared code (backend)
    ├── core/            # Configuration, auth, dependencies
    ├── config/          # Safe defaults
    ├── db/              # Database utilities
    ├── models/          # SQLAlchemy models
    ├── services/        # Business logic
    ├── schemas/         # Pydantic schemas
    ├── middleware/      # FastAPI middleware
    └── utils/           # Utilities
```

## Usage

### Backend (Python)

```python
from packages.common.db.session import get_db
from packages.common.models.user import User
from packages.common.core.config import settings
```

## Guidelines

- Keep packages focused and minimal
- Avoid circular dependencies
- Document public APIs
- Write tests for shared code
