"""Contract registry — loads ABIs and provides web3 contract instances.

Resolves ABIs from two locations (in order):
1. Hardhat artifacts: contracts/artifacts/contracts/<Name>.sol/<Name>.json
2. Fallback ABI dir:  apps/api/core/abi/<Name>.json

Maps contract names to deployed addresses from environment/config.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from web3 import Web3
from web3.contract import Contract

from packages.common.core.config import settings

logger = logging.getLogger(__name__)

# Directories searched for ABI files (order matters)
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_HARDHAT_ARTIFACTS = _PROJECT_ROOT / "contracts" / "artifacts" / "src"
_FALLBACK_ABI_DIR = Path(__file__).resolve().parent / "abi"

# Well-known contract names → settings attribute that holds the address
_ADDRESS_MAP: dict[str, str] = {
    "CiretaTokenFactory": "token_factory_address",
    "CiretaSaleFactory": "sale_factory_address",
    "CiretaFractionFactory": "fraction_factory_address",
    "IdentityRegistry": "identity_registry_address",
    "IdentityFactory": "identity_factory_address",
    "ModularCompliance": "modular_compliance_address",
}


class ContractRegistry:
    """Loads compiled ABIs and provides ready-to-call web3 contract instances."""

    def __init__(self, w3: Web3 | None = None) -> None:
        self._w3 = w3 or Web3(Web3.HTTPProvider(settings.web3_rpc_url))
        self._abi_cache: dict[str, list[dict[str, Any]]] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_contract(self, name: str, address: str | None = None) -> Contract:
        """Return a web3 contract instance for *name* at *address*.

        If *address* is ``None``, the registry looks up the address from
        environment config via ``_ADDRESS_MAP``.
        """
        abi = self._load_abi(name)

        if address is None:
            attr = _ADDRESS_MAP.get(name)
            if attr is None:
                raise ValueError(
                    f"No default address mapping for '{name}'. "
                    "Pass an explicit address or register the contract in _ADDRESS_MAP."
                )
            address = getattr(settings, attr, None)
            if not address:
                raise ValueError(f"Address for '{name}' not configured (settings.{attr} is empty).")

        checksum = Web3.to_checksum_address(address)
        return self._w3.eth.contract(address=checksum, abi=abi)

    def get_abi(self, name: str) -> list[dict[str, Any]]:
        """Return the raw ABI list for *name*."""
        return self._load_abi(name)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _load_abi(self, name: str) -> list[dict[str, Any]]:
        if name in self._abi_cache:
            return self._abi_cache[name]

        abi = self._try_hardhat(name) or self._try_fallback(name)
        if abi is None:
            raise FileNotFoundError(
                f"ABI for '{name}' not found. Looked in:\n"
                f"  1. {_HARDHAT_ARTIFACTS} (recursive search for {name}.json)\n"
                f"  2. {_FALLBACK_ABI_DIR / name}.json"
            )

        self._abi_cache[name] = abi
        return abi

    def _try_hardhat(self, name: str) -> list[dict[str, Any]] | None:
        # Hardhat nests: artifacts/contracts/src/<subdir>/<Name>.sol/<Name>.json
        # Search recursively under _HARDHAT_ARTIFACTS for <Name>.json
        if not _HARDHAT_ARTIFACTS.exists():
            return None
        matches = list(_HARDHAT_ARTIFACTS.rglob(f"{name}.json"))
        # Filter out .dbg.json files
        matches = [m for m in matches if not m.name.endswith(".dbg.json")]
        if not matches:
            return None
        artifact = json.loads(matches[0].read_text())
        return artifact.get("abi", artifact)

    def _try_fallback(self, name: str) -> list[dict[str, Any]] | None:
        path = _FALLBACK_ABI_DIR / f"{name}.json"
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        # Support both raw ABI arrays and {abi: [...]} wrapper
        if isinstance(data, list):
            return data
        return data.get("abi", data)
