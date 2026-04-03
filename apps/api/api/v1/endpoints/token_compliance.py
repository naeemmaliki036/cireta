"""Token compliance endpoints — manage on-chain compliance modules.

Allows issuers/admins to attach, configure, and remove compliance
modules on a token's ModularCompliance contract.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from apps.api.models.enums import UserRole
from apps.api.models.token import Token
from apps.api.models.user import User
from apps.api.schemas.token_compliance import (
    AddModuleRequest,
    ComplianceStatusResponse,
    ComplianceTxResponse,
    CountryAllowRequest,
    MaxHolderCountRequest,
)
from apps.api.services.web3_compliance_service import Web3ComplianceService
from packages.common.core.auth_deps import RequireIssuerOrAdmin
from packages.common.db.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tokens", tags=["token-compliance"])


def _http(code: int, error_code: str, message: str) -> HTTPException:
    return HTTPException(status_code=code, detail={"code": error_code, "message": message})


async def _load_token(token_id: UUID, user_id: UUID, db: AsyncSession) -> Token:
    """Load token, verify compliance address and ownership."""
    result = await db.execute(
        select(Token).options(selectinload(Token.issuer)).where(Token.id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise _http(404, "TOKEN_NOT_FOUND", "Token not found")
    if not token.compliance_address:
        raise _http(400, "NO_COMPLIANCE", "Token has no compliance contract deployed")
    if not token.issuer:
        raise _http(403, "NO_ISSUER", "Token has no associated issuer")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    is_admin = user and user.role == UserRole.ADMIN
    if not is_admin and token.issuer.user_id != user_id:
        raise _http(403, "NOT_AUTHORIZED", "Not authorized to manage this token's compliance")
    return token


@router.get("/{token_id}/compliance", response_model=ComplianceStatusResponse)
async def get_compliance_status(
    token_id: UUID, user_id: RequireIssuerOrAdmin, db: AsyncSession = Depends(get_db),
) -> ComplianceStatusResponse:
    """Get compliance modules and config for a token. Requires issuer/admin."""
    token = await _load_token(token_id, user_id, db)
    svc = Web3ComplianceService()
    try:
        modules = await svc.get_compliance_modules(token.compliance_address)  # type: ignore[arg-type]
    except Exception as exc:
        logger.error("Compliance fetch failed for token %s: %s", token_id, exc, exc_info=True)
        raise _http(502, "CHAIN_ERROR", "Failed to read compliance modules from chain") from exc

    return ComplianceStatusResponse(
        compliance_address=token.compliance_address,  # type: ignore[arg-type]
        token_address=token.contract_address,
        modules=modules,
    )


@router.post("/{token_id}/compliance/modules", response_model=ComplianceTxResponse)
async def add_compliance_module(
    token_id: UUID, request: AddModuleRequest,
    user_id: RequireIssuerOrAdmin, db: AsyncSession = Depends(get_db),
) -> ComplianceTxResponse:
    """Attach a compliance module. Requires issuer/admin."""
    token = await _load_token(token_id, user_id, db)
    svc = Web3ComplianceService()
    try:
        tx_hash = await svc.add_module(token.compliance_address, request.module_address)  # type: ignore[arg-type]
    except Exception as exc:
        logger.error("Add module failed for token %s: %s", token_id, exc, exc_info=True)
        raise _http(502, "MODULE_ADD_FAILED", f"Failed to add module: {exc!s}") from exc

    return ComplianceTxResponse(
        success=True, tx_hash=tx_hash,
        message=f"Module {request.module_address} attached successfully",
    )


@router.delete(
    "/{token_id}/compliance/modules/{module_address}",
    response_model=ComplianceTxResponse,
)
async def remove_compliance_module(
    token_id: UUID, module_address: str,
    user_id: RequireIssuerOrAdmin, db: AsyncSession = Depends(get_db),
) -> ComplianceTxResponse:
    """Remove a compliance module. Requires issuer/admin."""
    from web3 import Web3
    if not Web3.is_address(module_address):
        raise _http(400, "INVALID_ADDRESS", "Invalid module address")

    token = await _load_token(token_id, user_id, db)
    svc = Web3ComplianceService()
    try:
        tx_hash = await svc.remove_module(token.compliance_address, module_address)  # type: ignore[arg-type]
    except Exception as exc:
        logger.error("Remove module failed for token %s: %s", token_id, exc, exc_info=True)
        raise _http(502, "MODULE_REMOVE_FAILED", f"Failed to remove module: {exc!s}") from exc

    return ComplianceTxResponse(
        success=True, tx_hash=tx_hash,
        message=f"Module {module_address} removed successfully",
    )


@router.post("/{token_id}/compliance/country-allow", response_model=ComplianceTxResponse)
async def manage_country_allow(
    token_id: UUID, request: CountryAllowRequest,
    user_id: RequireIssuerOrAdmin, db: AsyncSession = Depends(get_db),
) -> ComplianceTxResponse:
    """Add or remove allowed countries on a CountryAllowModule. Requires issuer/admin."""
    token = await _load_token(token_id, user_id, db)
    svc = Web3ComplianceService()
    compliance_addr = token.compliance_address  # type: ignore[arg-type]
    tx_hashes: list[str] = []

    try:
        if request.add_countries:
            tx_hashes.append(await svc.batch_allow_countries(
                request.module_address, compliance_addr, request.add_countries,
            ))
        for code in request.remove_countries:
            tx_hashes.append(await svc.remove_allowed_country(
                request.module_address, compliance_addr, code,
            ))
    except Exception as exc:
        logger.error("Country update failed for token %s: %s", token_id, exc, exc_info=True)
        raise _http(502, "COUNTRY_UPDATE_FAILED", f"Failed to update countries: {exc!s}") from exc

    return ComplianceTxResponse(
        success=True, tx_hash=tx_hashes[-1] if tx_hashes else "",
        message=f"Updated countries: +{len(request.add_countries)} -{len(request.remove_countries)}",
    )


@router.post("/{token_id}/compliance/max-holders", response_model=ComplianceTxResponse)
async def set_max_holders(
    token_id: UUID, request: MaxHolderCountRequest,
    user_id: RequireIssuerOrAdmin, db: AsyncSession = Depends(get_db),
) -> ComplianceTxResponse:
    """Set max holder count on a MaxHolderCountModule. Requires issuer/admin."""
    token = await _load_token(token_id, user_id, db)
    svc = Web3ComplianceService()
    try:
        tx_hash = await svc.set_max_holder_count(
            request.module_address, token.compliance_address, request.max_count,  # type: ignore[arg-type]
        )
    except Exception as exc:
        logger.error("Set max holders failed for token %s: %s", token_id, exc, exc_info=True)
        raise _http(502, "MAX_HOLDER_FAILED", f"Failed to set max holder count: {exc!s}") from exc

    return ComplianceTxResponse(
        success=True, tx_hash=tx_hash, message=f"Max holder count set to {request.max_count}",
    )
