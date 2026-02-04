"""App-specific configuration overrides.

This file extends the base configuration from packages/common/core/config.py
with any app-specific settings.

For most cases, use the shared settings:
    from packages.common.core.config import settings

Only create app-specific settings if you need configuration that's
unique to this application and shouldn't be shared.
"""

from packages.common.core.config import Settings as BaseSettings


class AppSettings(BaseSettings):
    """App-specific settings.

    Extends base settings with example-api specific configuration.
    """

    # Add app-specific settings here
    # example_api_specific_setting: str = "default_value"

    class Config:
        env_prefix = "EXAMPLE_API_"


# For most use cases, import from packages.common.core.config
# Only use this for app-specific settings
# app_settings = AppSettings()
