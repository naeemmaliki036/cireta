# STRUCTURE.md - Directory & File Conventions

## When to Add to `apps/` vs `packages/`

### Use `apps/` for:
- Deployable services (APIs, frontends, workers)
- Service-specific configuration
- Entry points (`main.py`, `app/page.tsx`)

### Use `packages/` for:
- Shared utilities across multiple apps
- Common types and interfaces
- Reusable components/modules
- Database models and schemas

## File Naming Conventions

### Directories
- **kebab-case**: `example-api/`, `example-frontend/`
- **lowercase**: `models/`, `services/`, `utils/`

### Python Files
- **snake_case**: `user_service.py`, `base_model.py`
- **Classes**: PascalCase (`class UserService`)
- **Functions/variables**: snake_case (`get_user_by_id`)

### TypeScript/React Files
- **Components**: PascalCase (`BaseButton.tsx`, `TextField.tsx`)
- **Utilities**: camelCase (`formatDate.ts`, `cn.ts`)
- **Types**: PascalCase for types, camelCase for files (`types/index.ts`)
- **Hooks**: camelCase with `use` prefix (`useAuth.ts`)

## Component Hierarchy (Atomic Design)

```
atoms/          → Single HTML element wrappers
  ↓
molecules/      → Groups of atoms working together
  ↓
organisms/      → Complex page sections
  ↓
templates/      → Page layouts without content
  ↓
pages/          → Next.js app/ routes
```

### Placement Rules

| Type | Max Complexity | State | API Calls |
|------|---------------|-------|-----------|
| Atoms | Single element | Props only | Never |
| Molecules | 2-5 atoms | Local state | Never |
| Organisms | Multiple molecules | Complex state | Yes |
| Templates | Layout structure | Context | Via children |

## Service Layer Patterns

### Backend Service Structure

```
services/
├── base_service.py       # Abstract base with common methods
├── user_service.py       # User-specific business logic
└── auth_service.py       # Authentication logic
```

### Service Composition

```python
# Thin orchestrator pattern
class UserService(BaseService[User]):
    def __init__(self, db: Session, auth_service: AuthService):
        super().__init__(db, User)
        self.auth_service = auth_service

    async def create_user(self, data: UserCreate) -> User:
        # Delegate validation to auth service
        self.auth_service.validate_password(data.password)
        return await self.create(data)
```

## Migration Conventions

### File Naming
```
versions/
├── 001_initial_schema.py
├── 002_add_user_roles.py
└── 003_add_encrypted_fields.py
```

### Migration Template
```python
"""Description of changes

Revision ID: xxx
Revises: yyy
Create Date: YYYY-MM-DD
"""
from alembic import op
import sqlalchemy as sa

def upgrade() -> None:
    # Forward migration
    pass

def downgrade() -> None:
    # Reverse migration
    pass
```

## Import Path Conventions

### Backend (Python)
```python
# Always use full paths from project root
from packages.common.models.user import User
from packages.common.db.session import get_db
from apps.example_api.services.example_service import ExampleService
```

### Frontend (TypeScript)
```typescript
// Use path aliases defined in tsconfig.json
import { BaseButton } from '@/atoms/buttons/BaseButton';
import { useAuth } from '@/lib/hooks/useAuth';
import { cn } from '@/lib/utils/cn';
```

## Configuration File Locations

| File | Location | Purpose |
|------|----------|---------|
| `pyproject.toml` | Root | Python dependencies, tools |
| `package.json` | Root | NPM scripts, workspace config |
| `package.json` | `apps/*/` | App-specific dependencies |
| `tsconfig.json` | `apps/*/` | TypeScript configuration |
| `alembic.ini` | `infra/alembic/` | Migration configuration |

## Environment Variable Hierarchy

1. **Process env** - Highest priority (runtime)
2. **`.env.local`** - Local overrides (gitignored)
3. **`.env`** - Environment-specific (gitignored)
4. **`defaults.py`** - Code defaults (version controlled)

## Docker Conventions

### Dockerfile Naming
```
Dockerfile.example-api       # At repository root
Dockerfile.example-frontend  # At repository root
```

### Build Context
All Dockerfiles use repository root as build context to access `packages/`.

### Multi-stage Builds
```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
# ...

# Stage 2: Build
FROM node:20-alpine AS builder
# ...

# Stage 3: Runtime
FROM node:20-alpine AS runner
# ...
```
