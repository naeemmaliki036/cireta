"""Safe default configuration values for Cireta RWA Launchpad.

This file contains safe defaults that are version controlled.
NO SECRETS should ever be placed in this file.

These values are overridden by environment variables at runtime.
Critical values (DATABASE_URL, REDIS_URL, JWT_SECRET_KEY, etc.) have no
defaults and MUST be set via environment variables.
"""

DEFAULTS: dict[str, object] = {
    # Environment
    "ENVIRONMENT": "development",
    "DEBUG": True,
    # Database pool tuning (connection string is required via env)
    "DB_POOL_SIZE": 5,
    "DB_MAX_OVERFLOW": 10,
    "DB_POOL_RECYCLE": 300,
    # Cache TTL (Redis URL is required via env)
    "CACHE_TTL": 3600,
    # Security (no secrets - these are just algorithm/timing configs)
    "JWT_ALGORITHM": "HS256",
    "ACCESS_TOKEN_EXPIRE_SECONDS": 900,  # 15 minutes per CLAUDE.md
    "REFRESH_TOKEN_EXPIRE_SECONDS": 604800,  # 7 days per CLAUDE.md (investors)
    "REFRESH_TOKEN_EXPIRE_SECONDS_ADMIN": 28800,  # 8 hours for admin/issuer roles

    "BCRYPT_ROUNDS": 12,
    # Server
    "API_HOST": "0.0.0.0",
    "API_PORT": 3010,
    "WORKERS": 4,
    # CORS
    "CORS_ORIGINS": [
        "http://localhost:4010",
        "http://localhost:5010",
        "https://launchpad.cireta.com",
        "https://admin.cireta.com",
    ],
    # Logging
    "LOG_LEVEL": "INFO",
    "LOG_FORMAT": "console",
    # Rate limiting (per minute)
    "RATE_LIMIT_DEFAULT": 100,
    "RATE_LIMIT_LOGIN": 5,
    "RATE_LIMIT_REGISTER": 10,
    "RATE_LIMIT_CONTRIBUTE": 20,
    "RATE_LIMIT_WINDOW_SECONDS": 60,
    # KYC
    "KYC_MIN_LEVEL_INVEST": 2,
    "KYC_MIN_LEVEL_INITIATE": 1,
    # Contract addresses (populated per-environment via env vars)
    "MODULAR_COMPLIANCE_ADDRESS": "",
    # Platform
    "PLATFORM_FEE_BPS": 200,  # 2% default platform fee
}
