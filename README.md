# Scaffold Monorepo

A product-agnostic scaffold/template monorepo demonstrating best practices for structuring applications with FastAPI backends and Next.js frontends.

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 17+
- Redis (optional, for caching)

### Setup

1. **Clone and install dependencies**

```bash
# Install Python dependencies
poetry install

# Install Node dependencies
npm install
```

2. **Configure environment**

```bash
# Copy environment templates
cp .env.example .env
cp .env.backend.example .env.backend

# Edit with your settings
vim .env
```

3. **Start local database** (optional)

```bash
docker-compose -f docker-compose.local-db.yml up -d
```

4. **Run migrations**

```bash
make db-upgrade
```

5. **Start development servers**

```bash
# Start all services
make dev

# Or start individually
make dev-api      # FastAPI on :8000
make dev-frontend # Next.js on :3000
```

## Project Structure

```
scaffold/
├── apps/                    # Deployable applications
│   ├── example-frontend/    # Next.js 16 reference
│   └── example-api/         # FastAPI reference
├── packages/                # Shared libraries
│   └── common/              # Python shared code
├── infra/                   # Infrastructure
│   └── alembic/             # Database migrations
├── tests/                   # Test suites
├── docs/                    # Documentation
└── scripts/                 # Dev scripts
```

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Master coding standards
- [STRUCTURE.md](./STRUCTURE.md) - Directory conventions
- [apps/README.md](./apps/README.md) - Application guide
- [packages/README.md](./packages/README.md) - Shared packages guide

## Development Commands

```bash
# Development
make dev              # Start all services
make dev-api          # Start API only
make dev-frontend     # Start frontend only

# Database
make db-migrate MSG="description"  # Create migration
make db-upgrade                     # Apply migrations
make db-downgrade                   # Rollback one migration

# Testing
make test             # Run all tests
make test-unit        # Run unit tests
make test-integration # Run integration tests

# Code Quality
make lint             # Run linters
make format           # Format code
make typecheck        # Type checking
```

## Environment Variables

See [.env.example](./.env.example) for all available options.

Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_URL` | Redis connection string | Optional |
| `JWT_SECRET_KEY` | JWT signing key | Required in prod |
| `ENVIRONMENT` | `development`/`staging`/`production` | `development` |

## Architecture Decisions

### Why Monorepo?
- Shared code between services
- Atomic commits across services
- Unified tooling and CI/CD

### Why Atomic Design?
- Clear component hierarchy
- Predictable file locations
- Easier onboarding

### Why Service Layer?
- Testable business logic
- Thin controllers
- Dependency injection

## Contributing

1. Read [CLAUDE.md](./CLAUDE.md) for coding standards
2. Create feature branch from `main`
3. Write tests for new features
4. Submit PR with description

## License

MIT
# deploy-bust-1772418534
