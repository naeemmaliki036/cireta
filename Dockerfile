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
    CMD python -c "import httpx; httpx.get('http://localhost:8000/api/v1/health')" || exit 1

CMD ["/bin/sh", "-c", "echo CONTAINER_STARTING && /app/.venv/bin/python -c \"import sys; print(sys.version)\" && /app/.venv/bin/uvicorn apps.api.main:app --host 0.0.0.0 --port 8000 2>&1"]

# cache-bust: 1772376053
