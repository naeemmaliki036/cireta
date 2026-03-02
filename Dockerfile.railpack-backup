FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install poetry
RUN pip install --no-cache-dir poetry==1.8.5

# Install deps only (no root package — avoids README.md requirement)
COPY pyproject.toml poetry.lock ./
RUN poetry config virtualenvs.in-project true && \
    poetry install --no-interaction --no-ansi --only main --no-root

# Copy app code
COPY . .

# Ensure venv is on PATH and PYTHONPATH set
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app"

EXPOSE 8000

# ENTRYPOINT (not CMD) so Railway cannot override with its uvicorn --port $PORT injection
ENTRYPOINT ["python", "start.py"]
