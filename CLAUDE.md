# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Product-agnostic scaffold monorepo for FastAPI backends and Next.js frontends. See `apps/example_api/CLAUDE.md` and `apps/example-frontend/CLAUDE.md` for stack-specific standards.

## Build & Development Commands

```bash
# Install dependencies
make install                    # or: poetry install && npm install

# Start all services
make dev                        # Uses honcho with Procfile.dev

# Start individual services
make dev-api                    # FastAPI on :8000
make dev-frontend               # Next.js on :3000

# Run tests
make test                       # All pytest tests
make test-unit                  # Unit tests only
make test-integration           # Integration tests only
poetry run pytest tests/unit/test_example.py -v           # Single test file
poetry run pytest tests/unit/test_example.py::test_name   # Single test function

# Frontend tests (from apps/example-frontend)
npm run test --workspace=apps/example-frontend            # Watch mode
npm run test:run --workspace=apps/example-frontend        # Single run

# Code quality
make lint                       # Ruff + ESLint
make format                     # Ruff format + Prettier
make typecheck                  # mypy + tsc

# Database
make db-migrate MSG="description"  # Create Alembic migration
make db-upgrade                    # Apply migrations
make db-downgrade                  # Rollback one migration
```

## Architecture

```
Client → FastAPI Router → Service Layer → Repository → Database
                               ↓
                         External APIs
```

**Key patterns:**
- **Thin Controllers**: Endpoints delegate to services in `services/`
- **Dependency Injection**: All dependencies via FastAPI `Depends()`
- **Repository Pattern**: Database access abstracted; frontend uses repositories (no raw `fetch()`)

## Directory Structure

```
scaffold/
├── apps/
│   ├── example_api/        # FastAPI app (Python)
│   └── example-frontend/   # Next.js app (TypeScript)
├── packages/
│   └── common/             # Shared Python code (models, db, utils)
├── infra/
│   └── alembic/            # Database migrations
└── tests/                  # pytest suites (unit/, integration/, e2e/)
```

## Code Standards

### File Limits
- Max **300 LOC** per file (split when exceeding)
- Max **150 LOC** per React hook

### Import Order
```python
# Python: stdlib → third-party → packages → local
from datetime import datetime
from fastapi import Depends
from packages.common.db.session import get_db
from apps.example_api.services import ExampleService
```

```typescript
// TypeScript: react/next → third-party → @/ aliases → relative
import { useState } from 'react';
import { clsx } from 'clsx';
import { BaseButton } from '@/atoms/buttons/BaseButton';
import { localHelper } from './helpers';
```

### Backend
- Pydantic for all request/response validation
- Alembic for all schema changes
- `EncryptedString` for sensitive data (API keys, tokens, PII)
- HTTPException with structured detail: `{"code": "ERROR_CODE", "message": "..."}`

### Frontend
- Atomic design: atoms → molecules → organisms → templates
- `forwardRef` on atoms wrapping HTML elements
- CSS variables via Tailwind arbitrary values: `bg-[var(--brand-primary)]`
- TypeScript strict mode, no `any`

## Configuration

Two-tier system:
1. `defaults.py` - Safe defaults, version controlled
2. `config.py` - Settings class with env var overrides

Environment files:
- `.env.example` → copy to `.env`
- `.env.backend.example` → copy to `.env.backend`
- `.env.dockerfile.{service}` for Docker builds

## Naming Conventions

- Service names: kebab-case (`example-api`, `example-frontend`)
- Python packages: snake_case (`example_api`)
- Dockerfiles: `Dockerfile.{service-name}` at repo root
