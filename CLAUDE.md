# CLAUDE.md - Master Coding Standards

## Project Overview

This is a product-agnostic scaffold/template monorepo demonstrating best practices for structuring applications. It serves as a reference for developers and AI agents building monorepo applications with FastAPI backends and Next.js frontends.

## Architecture

### Request Flow
```
Client → API Gateway → FastAPI Router → Service Layer → Repository → Database
                                              ↓
                                        External APIs
```

### Key Principles
- **Thin Controllers**: Endpoints delegate to services
- **Service Layer**: Business logic lives in services/
- **Repository Pattern**: Database access abstracted
- **Dependency Injection**: All dependencies via FastAPI `Depends()`

## Directory Structure

```
scaffold/
├── apps/                    # Deployable applications
│   ├── example-frontend/    # Next.js 16 reference app
│   └── example-api/         # FastAPI reference app
├── packages/                # Shared code libraries
│   └── common/              # Python shared code (backend)
├── infra/                   # Infrastructure (migrations, monitoring)
├── tests/                   # Test suites
├── docs/                    # Documentation
└── scripts/                 # Development scripts
```

## Service Naming Conventions

- Service names: `example-api`, `example-frontend` (kebab-case)
- Dockerfiles: `Dockerfile.{service-name}` at repository root
- Environment files: `.env.dockerfile.{service-name}` for Docker builds

## Code Quality Rules

### Universal Standards

| Rule | Enforcement |
|------|-------------|
| **Max 300 LOC** | Split file when exceeding |
| **SOLID principles** | Single responsibility per file |
| **DRY** | Shared code → packages/ |
| **No secrets in code** | Use .env files exclusively |
| **Full paths in docs** | `packages/common/models/user.py` style |

### Import Organization

```python
# 1. Standard library
import os
from datetime import datetime

# 2. Third-party packages
from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session

# 3. Local imports (full paths)
from packages.common.db.session import get_db
from packages.common.models.user import User
```

### Backend Rules

| Rule | Pattern |
|------|---------|
| Service layer | Business logic in `services/` |
| `Depends()` | All injection via FastAPI |
| Pydantic | All request/response validation |
| Alembic | All schema changes via migrations |
| Encrypted fields | Sensitive data uses `EncryptedString` |

### Frontend Rules

| Rule | Pattern |
|------|---------|
| Atomic hierarchy | atoms → molecules → organisms |
| forwardRef | All atoms wrapping HTML elements |
| CSS variables | `[var(--brand-color)]` syntax |
| Repository pattern | Never raw `fetch()` |
| TypeScript strict | No `any`, explicit types |

## Configuration Pattern

### Two-Tier System

1. **`defaults.py`** - Safe defaults, version controlled, no secrets
2. **`config.py`** - Settings class, reads env vars, validates security

### Security Validation

```python
# Fail fast in production/staging
if not JWT_SECRET_KEY and ENVIRONMENT in ("production", "staging"):
    raise ValueError("JWT_SECRET_KEY must be set")
```

### Environment Files

- `.env.example` - Root template (copy to `.env`)
- `.env.backend.example` - Backend template with all options
- `.env.dockerfile.{service}` - Per-service Docker build env

## Database Patterns

### ID Strategy

- **UUID**: Distributed entities (conversations, messages)
- **Integer**: Auth entities (users, api_keys)

### Model Conventions

```python
class BaseModel(Base):
    __abstract__ = True
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, onupdate=lambda: datetime.now(UTC))
```

### Encrypted Fields

Use `EncryptedString` for sensitive data (API keys, tokens, PII).

## Error Handling

```python
from fastapi import HTTPException

# Use specific error codes
raise HTTPException(
    status_code=404,
    detail={"code": "USER_NOT_FOUND", "message": "User does not exist"}
)
```

## Middleware Stack (Order Matters)

1. Logging (correlation IDs)
2. Security headers
3. CORS
4. Authentication

## Development Workflow

```bash
# Start all services
make dev

# Run specific service
make dev-api
make dev-frontend

# Database operations
make db-migrate
make db-upgrade
```

## Testing Conventions

- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`
- Fixtures in `tests/conftest.py`

## Git Conventions

- Feature branches: `feature/{ticket}-{description}`
- Bug fixes: `fix/{ticket}-{description}`
- Commits: Conventional commits format
