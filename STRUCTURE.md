# STRUCTURE.md - Directory & File Conventions

## Project Layout

```
scaffold/
├── apps/                           # Deployable applications
│   ├── example-api/                # FastAPI backend reference
│   │   ├── api/v1/endpoints/       # Route handlers
│   │   ├── services/               # Business logic
│   │   └── main.py                 # Application entry
│   └── example-frontend/           # Next.js frontend reference
│       ├── src/
│       │   ├── app/                # Next.js App Router pages
│       │   ├── components/         # UI components (atomic design)
│       │   ├── contexts/           # React contexts
│       │   └── lib/                # Utilities, hooks, types
│       └── __tests__/              # Test files
│
├── packages/                       # Shared code libraries
│   └── common/                     # Python shared code
│       ├── config/                 # Configuration defaults
│       ├── core/                   # Core utilities (config, logging, auth, cache)
│       ├── db/                     # Database (session, repository, base)
│       ├── models/                 # SQLAlchemy models
│       ├── services/               # Business logic services
│       ├── schemas/                # Pydantic schemas
│       ├── middleware/             # HTTP middleware
│       ├── monitoring/             # Metrics collection
│       ├── decorators/             # Function decorators
│       └── utils/                  # Utility functions
│
├── infra/                          # Infrastructure
│   └── alembic/                    # Database migrations
│
├── tests/                          # Test suites
│   ├── unit/                       # Unit tests
│   ├── integration/                # Integration tests
│   └── e2e/                        # End-to-end tests
│
├── docs/                           # Documentation
└── scripts/                        # Development scripts
```

## When to Add to `apps/` vs `packages/`

### Use `apps/` for:
- Deployable services (APIs, frontends, workers)
- Service-specific configuration
- Entry points (`main.py`, `app/page.tsx`)
- API endpoint handlers

### Use `packages/` for:
- Shared utilities across multiple apps
- Common types and interfaces
- Reusable components/modules
- Database models and schemas
- Business logic services

## Backend Architecture

### Request Flow
```
Client → Middleware Stack → Router → Endpoint → Service → Repository → Database
                                        ↓
                                  External APIs
```

### Middleware Stack (Order Matters)
1. **LoggingMiddleware** - Correlation IDs, request logging
2. **SecurityHeadersMiddleware** - OWASP security headers
3. **RateLimitMiddleware** - Request rate limiting (optional)
4. **CORS** - Cross-origin resource sharing
5. **Authentication** - JWT validation (via dependencies)

### Key Patterns

| Pattern | Location | Purpose |
|---------|----------|---------|
| **Repository** | `db/repository.py` | Database CRUD abstraction |
| **Service** | `services/` | Business logic layer |
| **Dependency Injection** | `core/auth_deps.py`, `core/service_deps.py` | FastAPI `Depends()` |
| **Configuration** | `config/defaults.py` + `core/config.py` | Two-tier settings |

### Backend File Reference

```
packages/common/
├── config/
│   └── defaults.py           # Safe defaults (no secrets)
├── core/
│   ├── config.py             # Pydantic Settings, env loading
│   ├── logging.py            # Structured logging, PII filtering
│   ├── auth_deps.py          # JWT auth dependencies
│   ├── service_deps.py       # Service factory dependencies
│   └── cache.py              # Redis cache with fallback
├── db/
│   ├── base.py               # SQLAlchemy declarative base
│   ├── session.py            # Connection pooling, get_db
│   └── repository.py         # Generic CRUD, get_or_404
├── models/
│   ├── base.py               # Timestamps mixin
│   ├── user.py               # User model with roles
│   ├── api_key.py            # API key management
│   └── encrypted_types.py    # EncryptedString, EncryptedJSON
├── services/
│   ├── base_service.py       # Generic service CRUD
│   └── auth_service.py       # JWT, password hashing
├── schemas/
│   └── base.py               # Pydantic base schemas
├── middleware/
│   ├── logging_middleware.py # Correlation IDs
│   ├── security_headers.py   # OWASP headers
│   └── rate_limit.py         # Request rate limiting
├── monitoring/
│   └── metrics.py            # Metrics collection
├── decorators/
│   └── error_handling.py     # @handle_endpoint_errors
└── utils/
    ├── http_errors.py        # Structured HTTP errors
    ├── error_handlers.py     # Exception handlers
    └── base_client.py        # HTTP client with retries
```

## Frontend Architecture

### Component Hierarchy (Atomic Design)

```
atoms/          → Single HTML element wrappers (Button, Input, Spinner)
  ↓
molecules/      → Groups of atoms working together (TextField, TabNav)
  ↓
organisms/      → Complex page sections (Header, Sidebar, DataTable)
  ↓
templates/      → Page layouts without content (DashboardLayout)
  ↓
pages/          → Next.js app/ routes with content
```

### Placement Rules

| Type | Max Complexity | State | API Calls |
|------|---------------|-------|-----------|
| Atoms | Single element | Props only | Never |
| Molecules | 2-5 atoms | Local state | Never |
| Organisms | Multiple molecules | Complex state | Yes |
| Templates | Layout structure | Context | Via children |

### Key Patterns

| Pattern | Location | Purpose |
|---------|----------|---------|
| **Repository** | `lib/api/repositories/` | API call abstraction |
| **Context** | `contexts/` | Global state (auth, theme) |
| **Hooks** | `lib/hooks/` | Reusable stateful logic |
| **ApiError** | `lib/api/errors.ts` | Structured error handling |

### Frontend File Reference

```
apps/example-frontend/src/
├── app/                      # Next.js App Router
├── components/
│   ├── atoms/                # Base components (forwardRef)
│   ├── molecules/            # Composed components
│   ├── organisms/            # Complex sections
│   ├── templates/            # Page layouts
│   └── providers/            # Provider composition
├── contexts/
│   ├── AuthContext.tsx       # Auth state, token refresh
│   └── ThemeContext.tsx      # Theme management
└── lib/
    ├── api/
    │   ├── config/           # API URLs, endpoints
    │   ├── errors.ts         # ApiError class
    │   └── repositories/
    │       └── base/         # BaseRepository
    ├── hooks/                # Custom hooks
    ├── types/                # TypeScript types
    └── utils/
        ├── cn.ts             # Class name utility
        └── logger.ts         # Frontend logging
```

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
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils/cn';
import { ApiError } from '@/lib/api/errors';
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

## Configuration

### Two-Tier System

1. **`defaults.py`** - Safe defaults, version controlled, no secrets
2. **`config.py`** - Pydantic Settings, reads env vars, validates security

### Environment Variable Hierarchy

1. **Process env** - Highest priority (runtime)
2. **`.env.local`** - Local overrides (gitignored)
3. **`.env`** - Environment-specific (gitignored)
4. **`defaults.py`** - Code defaults (version controlled)

### Configuration Files

| File | Location | Purpose |
|------|----------|---------|
| `pyproject.toml` | Root | Python dependencies, tools |
| `package.json` | Root | NPM scripts, workspace config |
| `package.json` | `apps/*/` | App-specific dependencies |
| `tsconfig.json` | `apps/*/` | TypeScript configuration |
| `vitest.config.ts` | `apps/*/` | Test configuration |
| `alembic.ini` | `infra/alembic/` | Migration configuration |

## Docker Conventions

### Dockerfile Naming
```
Dockerfile.example-api       # At repository root
Dockerfile.example-frontend  # At repository root
```

### Environment Files
```
.env.example                 # Template (committed)
.env.dockerfile.example-api  # Docker build env
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

## Testing

### Backend Tests
```
tests/
├── unit/           # Fast, isolated tests
├── integration/    # Database, external services
├── e2e/            # Full system tests
└── conftest.py     # Shared fixtures
```

### Frontend Tests
```
apps/example-frontend/
├── __tests__/
│   ├── setup.ts           # Test setup
│   ├── api/               # API utilities tests
│   ├── contexts/          # Context tests
│   └── hooks/             # Hook tests
└── vitest.config.ts       # Vitest configuration
```

### Running Tests
```bash
# Backend
poetry run pytest tests/unit/
poetry run pytest tests/integration/

# Frontend
npm run test --workspace=apps/example-frontend
npm run test:coverage --workspace=apps/example-frontend
```
