"""Safe default configuration values.

This file contains safe defaults that are version controlled.
NO SECRETS should ever be placed in this file.

These values are overridden by environment variables at runtime.
"""

DEFAULTS: dict[str, object] = {
    # Environment
    "ENVIRONMENT": "development",
    "DEBUG": True,

    # Database
    "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/scaffold",
    "DB_POOL_SIZE": 5,
    "DB_MAX_OVERFLOW": 10,
    "DB_POOL_RECYCLE": 300,

    # Redis
    "REDIS_URL": None,
    "CACHE_TTL": 3600,

    # Security (no secrets - these are just algorithm/timing configs)
    "JWT_ALGORITHM": "HS256",
    "ACCESS_TOKEN_EXPIRE_SECONDS": 3600,  # 1 hour
    "REFRESH_TOKEN_EXPIRE_SECONDS": 604800,  # 7 days
    "BCRYPT_ROUNDS": 12,

    # Server
    "API_HOST": "0.0.0.0",
    "API_PORT": 8000,
    "WORKERS": 4,

    # CORS
    "CORS_ORIGINS": ["http://localhost:3000", "http://127.0.0.1:3000"],

    # Logging
    "LOG_LEVEL": "INFO",
    "LOG_FORMAT": "console",

    # Rate limiting
    "RATE_LIMIT_REQUESTS": 100,
    "RATE_LIMIT_WINDOW_SECONDS": 60,
}
