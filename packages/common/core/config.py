"""Centralized configuration for Cireta RWA Launchpad."""

from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from packages.common.config.defaults import DEFAULTS


class Settings(BaseSettings):
    """Application settings with environment variable overrides.

    Uses two-tier configuration:
    1. Safe defaults from defaults.py (version controlled)
    2. Environment variable overrides (runtime)
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Environment
    environment: Literal["development", "staging", "production"] = Field(
        default=DEFAULTS["ENVIRONMENT"]
    )
    debug: bool = Field(default=DEFAULTS["DEBUG"])

    # Database
    database_url: str = Field(default=DEFAULTS["DATABASE_URL"])
    db_pool_size: int = Field(default=DEFAULTS["DB_POOL_SIZE"])
    db_max_overflow: int = Field(default=DEFAULTS["DB_MAX_OVERFLOW"])
    db_pool_recycle: int = Field(default=DEFAULTS["DB_POOL_RECYCLE"])

    # Redis
    redis_url: str | None = Field(default=DEFAULTS["REDIS_URL"])
    cache_ttl: int = Field(default=DEFAULTS["CACHE_TTL"])

    # Security
    jwt_secret_key: str = Field(default="")
    jwt_algorithm: str = Field(default=DEFAULTS["JWT_ALGORITHM"])
    access_token_expire_seconds: int = Field(
        default=DEFAULTS["ACCESS_TOKEN_EXPIRE_SECONDS"]
    )
    refresh_token_expire_seconds: int = Field(
        default=DEFAULTS["REFRESH_TOKEN_EXPIRE_SECONDS"]
    )

    # Encryption
    encryption_key: str = Field(default="")

    # Server
    api_host: str = Field(default=DEFAULTS["API_HOST"])
    api_port: int = Field(default=DEFAULTS["API_PORT"], validation_alias=AliasChoices("api_port", "PORT"))
    workers: int = Field(default=DEFAULTS["WORKERS"])

    # CORS
    cors_origins: str | list[str] = Field(default=DEFAULTS["CORS_ORIGINS"])

    # Logging
    log_level: str = Field(default=DEFAULTS["LOG_LEVEL"])
    log_format: Literal["json", "console"] = Field(default=DEFAULTS["LOG_FORMAT"])

    # Rate limiting
    rate_limit_default: int = Field(default=DEFAULTS["RATE_LIMIT_DEFAULT"])
    rate_limit_login: int = Field(default=DEFAULTS["RATE_LIMIT_LOGIN"])
    rate_limit_register: int = Field(default=DEFAULTS["RATE_LIMIT_REGISTER"])
    rate_limit_contribute: int = Field(default=DEFAULTS["RATE_LIMIT_CONTRIBUTE"])

    # Sumsub KYC
    sumsub_app_token: str = Field(default="")
    sumsub_secret_key: str = Field(default="")
    sumsub_base_url: str = Field(default="https://api.sumsub.com")

    # Web3 / Blockchain
    chain_id: int = Field(default=DEFAULTS["CHAIN_ID"])
    web3_rpc_url: str = Field(default=DEFAULTS["WEB3_RPC_URL"])
    deployer_private_key: str = Field(default="")
    platform_fee_receiver: str = Field(default="")

    # ONCHAINID
    identity_factory_address: str = Field(default="")
    identity_registry_address: str = Field(default="")

    # Token factory (deployed via contracts/scripts/deploy.ts)
    token_factory_address: str = Field(default="")

    # External services
    pinata_api_key: str = Field(default="")
    pinata_secret_key: str = Field(default="")
    resend_api_key: str = Field(default="")
    frontend_url: str = Field(default="https://cireta.com")
    smtp_from: str = Field(default="noreply@cireta.com")

    # KYC levels
    kyc_min_level_invest: int = Field(default=DEFAULTS["KYC_MIN_LEVEL_INVEST"])
    kyc_min_level_initiate: int = Field(default=DEFAULTS["KYC_MIN_LEVEL_INITIATE"])

    # Platform
    platform_fee_bps: int = Field(default=DEFAULTS["PLATFORM_FEE_BPS"])

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Parse CORS origins from comma-separated string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    def model_post_init(self, _context: object) -> None:
        """Validate security settings after initialization."""
        self._validate_security()

    def _validate_security(self) -> None:
        """Fail fast if security settings are missing in production."""
        if self.environment in ("production", "staging"):
            if not self.jwt_secret_key:
                raise ValueError(
                    "JWT_SECRET_KEY must be set in production/staging environments"
                )
            if not self.encryption_key:
                raise ValueError(
                    "ENCRYPTION_KEY must be set in production/staging environments"
                )
            if not self.sumsub_secret_key:
                raise ValueError(
                    "SUMSUB_SECRET_KEY must be set in production/staging environments"
                )
            if self.debug:
                raise ValueError(
                    "DEBUG must be False in production/staging environments"
                )

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.environment == "development"

    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance
settings = get_settings()
