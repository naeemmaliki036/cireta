"""Web3 service — shim re-export for backwards compatibility.

Implementation is split across:
  web3_base_service.py     — connection, balances, tx, contract calls
  web3_token_service.py    — ERC-3643 token deployment, pause/unpause
  web3_identity_service.py — identity registry, claims, freeze/forced-transfer
"""

from apps.api.services.web3_identity_service import Web3IdentityService

# Web3Service is the full-featured class (inherits all layers)
Web3Service = Web3IdentityService

# Singleton instance
web3_service = Web3Service()

__all__ = ["Web3Service", "web3_service"]
