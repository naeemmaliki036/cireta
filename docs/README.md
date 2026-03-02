# Documentation

Project documentation for the Cireta RWA Launchpad.

## Backend

**Framework: FastAPI (Python 3.11+)** — Final decision. NestJS was evaluated and ruled out permanently.

The backend uses FastAPI with SQLAlchemy 2.0 (async), Pydantic v2 validation, arq (Redis-backed) background workers, and JWT authentication with httpOnly cookie refresh tokens.

See [SPEC_AUDIT.md](./SPEC_AUDIT.md) for the full architectural audit.

## Structure

```
docs/
├── README.md           # This file
├── SPEC_AUDIT.md       # Spec compliance audit
├── BUILD_LOG.md        # Build progress tracker
├── architecture/       # Architecture decisions
├── api/                # API documentation
└── guides/             # Developer guides
```

## Quick Links

- [CLAUDE.md](../CLAUDE.md) - Master coding standards
- [STRUCTURE.md](../STRUCTURE.md) - Directory conventions
- [apps/README.md](../apps/README.md) - Application guide
- [packages/README.md](../packages/README.md) - Shared packages guide

## API Documentation

When running locally, API documentation is available at:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Adding Documentation

1. Create markdown files in appropriate subdirectory
2. Keep documentation close to code when possible
3. Update this README with new documentation links
