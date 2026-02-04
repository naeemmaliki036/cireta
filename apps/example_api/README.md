# Example API

FastAPI reference application demonstrating best practices.

## Quick Start

```bash
# From repository root
make dev-api

# Or directly
poetry run uvicorn apps.example_api.main:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000/docs](http://localhost:8000/docs) for API documentation.

## Tech Stack

- **FastAPI** - Modern Python web framework
- **SQLAlchemy 2.0** - ORM with async support
- **Pydantic v2** - Data validation
- **Alembic** - Database migrations

## Directory Structure

```
example_api/
├── __init__.py
├── main.py                 # FastAPI app initialization
├── api/
│   └── v1/
│       ├── __init__.py
│       ├── router.py       # Route registration
│       └── endpoints/
│           ├── __init__.py
│           └── health.py   # Health check endpoint
├── services/
│   ├── __init__.py
│   └── example_service.py  # Business logic
└── core/
    ├── __init__.py
    └── config.py           # App-specific configuration
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/docs` | Swagger UI |
| GET | `/redoc` | ReDoc documentation |

## Configuration

Environment variables are loaded from:
1. `.env` file in repository root
2. `.env.backend` for backend-specific settings

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET_KEY` - JWT signing key (required in production)
- `ENVIRONMENT` - development/staging/production

## Development

### Adding a New Endpoint

1. Create endpoint file in `api/v1/endpoints/`
2. Register router in `api/v1/router.py`
3. Create service in `services/` if needed
4. Add tests in `tests/`

### Running Tests

```bash
poetry run pytest tests/ -v
```

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Coding standards
- [packages/common/README.md](../../packages/common/README.md) - Shared code
