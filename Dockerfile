# Dockerfile for cireta-api
# Build from repository root: docker build -f Dockerfile.api -t cireta-api .

FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

ENV POETRY_HOME=/opt/poetry
ENV POETRY_VERSION=1.8.4
RUN curl -sSL https://install.python-poetry.org | python3 -
ENV PATH="$POETRY_HOME/bin:$PATH"

COPY pyproject.toml poetry.lock* ./

RUN poetry config virtualenvs.in-project true && \
    poetry install --no-interaction --no-ansi --only main

FROM python:3.11-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.venv /app/.venv
COPY packages ./packages
COPY apps/api ./apps/api
COPY infra ./infra

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/api/v1/health/live || exit 1

CMD ["/bin/sh", "-c", "echo STARTING PORT=${PORT:-8000} && exec /app/.venv/bin/uvicorn apps.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

# cache-bust: 1772376517
