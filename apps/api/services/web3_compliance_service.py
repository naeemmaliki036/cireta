"""Web3 compliance service — ModularCompliance + module management.

Manages on-chain compliance modules (CountryAllowModule, MaxHolderCountModule)
attached to ERC-3643 token compliance contracts.
"""

import logging

from web3 import Web3

from apps.api.services.compliance_abis import (
    COMPLIANCE_MODULE_ABI,
    COUNTRY_ALLOW_MODULE_ABI,
    MAX_HOLDER_COUNT_MODULE_ABI,
    MODULAR_COMPLIANCE_ABI,
)
from apps.api.services.web3_base_service import Web3BaseService

logger = logging.getLogger(__name__)

# Common ISO 3166-1 numeric codes to probe for allowed status
_COMMON_COUNTRY_CODES = [
    36, 40, 56, 76, 124, 156, 208, 246, 250, 276,
    344, 356, 372, 380, 392, 410, 458, 484, 528,
    554, 578, 616, 620, 634, 682, 702, 710, 724,
    752, 756, 784, 826, 840,
]


class Web3ComplianceService(Web3BaseService):
    """On-chain compliance module management."""

    async def get_compliance_modules(self, compliance_address: str) -> list[dict]:
        """Get all modules attached to a compliance contract with config."""
        addr = Web3.to_checksum_address(compliance_address)
        modules = await self.call_contract(addr, MODULAR_COMPLIANCE_ABI, "getModules")
        result = []
        for module_addr in modules:
            result.append(await self._get_module_info(module_addr, addr))
        return result

    async def _get_module_info(self, module_address: str, compliance_address: str) -> dict:
        """Get module name and config for a bound module."""
        module_addr = Web3.to_checksum_address(module_address)
        compliance_addr = Web3.to_checksum_address(compliance_address)
        try:
            name = await self.call_contract(module_addr, COMPLIANCE_MODULE_ABI, "name")
        except Exception:
            name = "Unknown"

        info: dict = {"address": module_addr, "name": name, "config": {}}
        if name == "CountryAllowModule":
            info["config"] = await self._get_country_config(module_addr, compliance_addr)
        elif name == "MaxHolderCountModule":
            info["config"] = await self._get_max_holder_config(module_addr, compliance_addr)
        return info

    async def _get_country_config(self, module_address: str, compliance_address: str) -> dict:
        """Check common country codes for allowed status."""
        allowed = []
        for code in _COMMON_COUNTRY_CODES:
            try:
                is_allowed = await self.call_contract(
                    module_address, COUNTRY_ALLOW_MODULE_ABI,
                    "isCountryAllowed", Web3.to_checksum_address(compliance_address), code,
                )
                if is_allowed:
                    allowed.append(code)
            except Exception:
                continue
        return {"allowed_countries": allowed}

    async def _get_max_holder_config(self, module_address: str, compliance_address: str) -> dict:
        """Get max holder count and current count."""
        addr = Web3.to_checksum_address(compliance_address)
        max_count = await self.call_contract(
            module_address, MAX_HOLDER_COUNT_MODULE_ABI, "getMaxHolderCount", addr,
        )
        holder_count = await self.call_contract(
            module_address, MAX_HOLDER_COUNT_MODULE_ABI, "getHolderCount", addr,
        )
        return {"max_holder_count": max_count, "current_holder_count": holder_count}

    async def add_module(self, compliance_address: str, module_address: str) -> str:
        """Add a module to compliance and bind it.

        1. compliance.addModule(module)
        2. module.bindCompliance(compliance)
        """
        c_addr = Web3.to_checksum_address(compliance_address)
        m_addr = Web3.to_checksum_address(module_address)

        receipt = await self.execute_contract(c_addr, MODULAR_COMPLIANCE_ABI, "addModule", m_addr)
        logger.info("Module %s added to compliance %s (tx: %s)", m_addr, c_addr, receipt["transactionHash"].hex())

        receipt2 = await self.execute_contract(m_addr, COMPLIANCE_MODULE_ABI, "bindCompliance", c_addr)
        logger.info("Compliance %s bound on module %s (tx: %s)", c_addr, m_addr, receipt2["transactionHash"].hex())
        return receipt["transactionHash"].hex()

    async def remove_module(self, compliance_address: str, module_address: str) -> str:
        """Remove a module: unbind then remove.

        1. module.unbindCompliance(compliance)
        2. compliance.removeModule(module)
        """
        c_addr = Web3.to_checksum_address(compliance_address)
        m_addr = Web3.to_checksum_address(module_address)

        r1 = await self.execute_contract(m_addr, COMPLIANCE_MODULE_ABI, "unbindCompliance", c_addr)
        logger.info("Compliance %s unbound from module %s (tx: %s)", c_addr, m_addr, r1["transactionHash"].hex())

        r2 = await self.execute_contract(c_addr, MODULAR_COMPLIANCE_ABI, "removeModule", m_addr)
        logger.info("Module %s removed from compliance %s (tx: %s)", m_addr, c_addr, r2["transactionHash"].hex())
        return r2["transactionHash"].hex()

    async def add_allowed_country(
        self, module_address: str, compliance_address: str, country_code: int,
    ) -> str:
        """Add an allowed country to a CountryAllowModule."""
        receipt = await self.execute_contract(
            Web3.to_checksum_address(module_address), COUNTRY_ALLOW_MODULE_ABI,
            "addAllowedCountry", Web3.to_checksum_address(compliance_address), country_code,
        )
        return receipt["transactionHash"].hex()

    async def remove_allowed_country(
        self, module_address: str, compliance_address: str, country_code: int,
    ) -> str:
        """Remove an allowed country from a CountryAllowModule."""
        receipt = await self.execute_contract(
            Web3.to_checksum_address(module_address), COUNTRY_ALLOW_MODULE_ABI,
            "removeAllowedCountry", Web3.to_checksum_address(compliance_address), country_code,
        )
        return receipt["transactionHash"].hex()

    async def batch_allow_countries(
        self, module_address: str, compliance_address: str, country_codes: list[int],
    ) -> str:
        """Batch add allowed countries to a CountryAllowModule."""
        receipt = await self.execute_contract(
            Web3.to_checksum_address(module_address), COUNTRY_ALLOW_MODULE_ABI,
            "batchAllowCountries", Web3.to_checksum_address(compliance_address), country_codes,
        )
        return receipt["transactionHash"].hex()

    async def set_max_holder_count(
        self, module_address: str, compliance_address: str, max_count: int,
    ) -> str:
        """Set max holder count on a MaxHolderCountModule."""
        receipt = await self.execute_contract(
            Web3.to_checksum_address(module_address), MAX_HOLDER_COUNT_MODULE_ABI,
            "setMaxHolderCount", Web3.to_checksum_address(compliance_address), max_count,
        )
        return receipt["transactionHash"].hex()
