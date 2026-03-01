"""App-specific configuration for Cireta API.

Re-exports common settings for convenience.
"""

from packages.common.core.config import Settings, get_settings, settings

__all__ = ["Settings", "get_settings", "settings"]
