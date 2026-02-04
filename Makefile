.PHONY: dev dev-api dev-frontend install lint format test db-migrate db-upgrade db-downgrade clean

# Development
dev:
	honcho start -f Procfile.dev

dev-api:
	poetry run uvicorn apps.example_api.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	npm run dev --workspace=apps/example-frontend

# Installation
install:
	poetry install
	npm install

# Code Quality
lint:
	poetry run ruff check .
	npm run lint --workspaces --if-present

format:
	poetry run ruff format .
	npm run format --workspaces --if-present

typecheck:
	poetry run mypy packages apps
	npm run typecheck --workspaces --if-present

# Testing
test:
	poetry run pytest

test-unit:
	poetry run pytest tests/unit -v

test-integration:
	poetry run pytest tests/integration -v

test-cov:
	poetry run pytest --cov=packages --cov=apps --cov-report=html

# Database
db-migrate:
	@if [ -z "$(MSG)" ]; then \
		echo "Usage: make db-migrate MSG='migration description'"; \
		exit 1; \
	fi
	cd infra/alembic && poetry run alembic revision --autogenerate -m "$(MSG)"

db-upgrade:
	cd infra/alembic && poetry run alembic upgrade head

db-downgrade:
	cd infra/alembic && poetry run alembic downgrade -1

db-history:
	cd infra/alembic && poetry run alembic history

# Docker
docker-db:
	docker-compose -f docker-compose.local-db.yml up -d

docker-db-down:
	docker-compose -f docker-compose.local-db.yml down

docker-build-api:
	docker build -f Dockerfile.example-api -t example-api .

docker-build-frontend:
	docker build -f Dockerfile.example-frontend -t example-frontend .

# Cleanup
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null || true
	rm -rf dist build *.egg-info htmlcov .coverage
