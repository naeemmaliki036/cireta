# Infrastructure

Infrastructure configuration and tooling.

## Structure

```
infra/
├── alembic/           # Database migrations
│   ├── alembic.ini    # Alembic configuration
│   ├── env.py         # Migration environment
│   └── versions/      # Migration files
│
├── grafana/           # Monitoring dashboards (optional)
└── prometheus/        # Metrics collection (optional)
```

## Database Migrations

### Creating a Migration

```bash
make db-migrate MSG="add user roles"
```

### Applying Migrations

```bash
make db-upgrade
```

### Rolling Back

```bash
make db-downgrade
```

## Local Development

Start PostgreSQL and Redis for local development:

```bash
docker-compose -f docker-compose.local-db.yml up -d
```

## Production Deployment

Production deployments use Railway templates (not docker-compose).
See project README for deployment instructions.
