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

    # Database (required)
    database_url: str = Field()
    db_pool_size: int = Field(default=DEFAULTS["DB_POOL_SIZE"])
    db_max_overflow: int = Field(default=DEFAULTS["DB_MAX_OVERFLOW"])
    db_pool_recycle: int = Field(default=DEFAULTS["DB_POOL_RECYCLE"])

    # Redis (required)
    redis_url: str = Field()
    cache_ttl: int = Field(default=DEFAULTS["CACHE_TTL"])

    # Security (required)
    jwt_secret_key: str = Field()
    jwt_algorithm: str = Field(default=DEFAULTS["JWT_ALGORITHM"])
    access_token_expire_seconds: int = Field(default=DEFAULTS["ACCESS_TOKEN_EXPIRE_SECONDS"])
    refresh_token_expire_seconds: int = Field(default=DEFAULTS["REFRESH_TOKEN_EXPIRE_SECONDS"])

    # Encryption (required)
    encryption_key: str = Field()

    # Server
    api_host: str = Field(default=DEFAULTS["API_HOST"])
    api_port: int = Field(
        default=DEFAULTS["API_PORT"], validation_alias=AliasChoices("api_port", "PORT")
    )
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

    # Web3 / Blockchain (required)
    chain_id: int = Field()
    web3_rpc_url: str = Field()
    deployer_private_key: str = Field(default="")
    platform_fee_receiver: str = Field(default="")

    # ONCHAINID
    identity_factory_address: str = Field(default="")
    identity_registry_address: str = Field(default="")
    # keccak256 of IdentityProxy init code from the deployed factory.
    # Required for deterministic CREATE2 address computation in production.
    # Set via IDENTITY_INIT_CODE_HASH env var after deploying the factory.
    identity_init_code_hash: str = Field(default="")
    claim_signer_private_key: str = Field(default="")
    claim_issuer_address: str = Field(default="")
    max_wallets_per_investor: int = Field(default=10)

    # Identity mode: "simple" (whitelist) or "erc3643" (full ONCHAINID + claims)
    identity_mode: Literal["simple", "erc3643"] = Field(default="simple")

    # Token factory (deployed via contracts/scripts/deploy.ts)
    token_factory_address: str = Field(default="")
    sale_factory_address: str = Field(default="")
    fraction_factory_address: str = Field(default="")
    modular_compliance_address: str = Field(default=DEFAULTS["MODULAR_COMPLIANCE_ADDRESS"])

    # External services
    pinata_api_key: str = Field(default="")
    pinata_secret_key: str = Field(default="")
    resend_api_key: str = Field(default="")
    frontend_url: str = Field(default="https://cireta.com")
    smtp_from: str = Field(default="noreply@cireta.com")

    # KYC levels
    kyc_min_level_invest: int = Field(default=DEFAULTS["KYC_MIN_LEVEL_INVEST"])
    kyc_min_level_initiate: int = Field(default=DEFAULTS["KYC_MIN_LEVEL_INITIATE"])

    # Wallet screening
    screening_api_key: str = Field(default="")
    screening_block_threshold: float = Field(default=0.7)
    screening_flag_threshold: float = Field(default=0.4)
    web3_fallback_rpc_url: str = Field(default="")

    # Platform
    platform_fee_bps: int = Field(default=DEFAULTS["PLATFORM_FEE_BPS"])

    # File Storage: "gcs" or "local" (auto-detected from GCS_BUCKET presence)
    gcs_bucket: str = Field(default="")  # public bucket (images, videos, banners)
    gcs_private_bucket: str = Field(default="")  # private bucket (docs, whitepapers, legal)
    gcs_project_id: str = Field(default="")
    gcs_credentials_json: str = Field(default="")
    gcs_credentials_file: str = Field(default="")
    upload_dir: str = Field(default="uploads")  # local fallback dir

    # Google OAuth (launchpad SSO only)
    google_client_id: str = Field(default="")
    google_client_secret: str = Field(default="")

    @property
    def storage_backend(self) -> str:
        return "gcs" if self.gcs_bucket else "local"


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

    _KNOWN_DEV_SECRETS = frozenset({
        "dev-only-k8f3j2m9x7q1w4p6r0t5v8b3n2c7y1a9",
        "local-dev-secret-key-cireta-2026-change-me-min32chars",
    })

    def _validate_security(self) -> None:
        """Fail fast if security settings are missing in production."""
        if self.environment in ("production", "staging"):
            if not self.jwt_secret_key:
                raise ValueError("JWT_SECRET_KEY must be set in production/staging environments")
            if self.jwt_secret_key in self._KNOWN_DEV_SECRETS:
                raise ValueError(
                    "JWT_SECRET_KEY is a known dev secret — generate a unique key for production/staging"
                )
            if not self.encryption_key:
                raise ValueError("ENCRYPTION_KEY must be set in production/staging environments")
            if not self.sumsub_secret_key:
                raise ValueError("SUMSUB_SECRET_KEY must be set in production/staging environments")
            if self.debug:
                raise ValueError("DEBUG must be False in production/staging environments")

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
