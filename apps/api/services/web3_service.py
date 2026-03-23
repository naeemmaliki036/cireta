"""Web3 service — shim re-export for backwards compatibility.

Implementation is split across:
  web3_base_service.py     — connection, balances, tx, contract calls
  web3_token_service.py    — ERC-3643 token deployment, pause/unpause
  web3_identity_service.py — identity registry, claims, freeze/forced-transfer
"""

from apps.api.services.web3_identity_service import Web3IdentityService

# Web3Service is the full-featured class (inherits all layers)
Web3Service = Web3IdentityService

# Lazy singleton — instantiated on first access to avoid import-time side effects
_web3_service: Web3Service | None = None


def get_web3_service() -> Web3Service:
    """Return the singleton Web3Service, creating it on first call."""
    global _web3_service  # noqa: PLW0603
    if _web3_service is None:
        _web3_service = Web3Service()
    return _web3_service


# Backwards-compatible property-like access
class _LazyProxy:
    """Proxy that defers Web3Service instantiation until attribute access."""

    def __getattr__(self, name: str):
        return getattr(get_web3_service(), name)


web3_service = _LazyProxy()

__all__ = ["Web3Service", "web3_service", "get_web3_service"]
