"""Admin wallet-management endpoints.

GET  /admin/wallets                     — paginated list with user info + stats
POST /admin/wallets/{wallet_id}/refresh-status  — sync registered_on_chain from chain
POST /admin/wallets/{wallet_id}/mark-registered — record outcome of admin-signed tx
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.models.user import User
from apps.api.models.wallet import Wallet
from packages.common.core.auth_deps import RequireAdmin
from packages.common.db.session import get_db

log = logging.getLogger(__name__)

router = APIRouter(prefix="/wallets", tags=["admin-wallets"])

# ── Schemas ───────────────────────────────────────────────────────────


class AdminWalletItem(BaseModel):
    id: UUID
    address_checksum: str
    chain_id: int
    is_primary: bool
    is_safe: bool
    registered_on_chain: bool
    label: str | None
    linked_at: datetime
    last_screened_at: datetime | None
    risk_score: float | None
    # user info
    user_id: UUID
    user_email: str
    user_display_name: str | None
    user_country_code: str | None
    user_kyc_status: str


class AdminWalletListResponse(BaseModel):
    items: list[AdminWalletItem]
    total: int
    page: int
    size: int
    stats: dict  # {total_wallets, registered_on_chain, pending}


class MarkRegisteredRequest(BaseModel):
    tx_hash: str


class RefreshStatusResponse(BaseModel):
    address: str
    registered_on_chain: bool
    synced_at: datetime


# ── Helpers ───────────────────────────────────────────────────────────

_ISVERIFIED_ABI = [
    {
        "inputs": [{"name": "_userAddress", "type": "address"}],
        "name": "isVerified",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    }
]


async def _check_onchain_verified(address_checksum: str) -> bool:
    """Call isVerified(address) on the SimpleIdentityRegistry."""
    from web3 import Web3

    from apps.api.core.web3_provider import get_web3_provider
    from packages.common.core.config import settings

    ir_address = getattr(settings, "identity_registry_address", "")
    if not ir_address:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "IR_NOT_CONFIGURED",
                "message": "IDENTITY_REGISTRY_ADDRESS not configured",
            },
        )

    try:
        w3 = get_web3_provider()
        contract = w3.eth.contract(
            address=Web3.to_checksum_address(ir_address),
            abi=_ISVERIFIED_ABI,
        )
        result: bool = await asyncio.to_thread(
            contract.functions.isVerified(
                Web3.to_checksum_address(address_checksum)
            ).call
        )
        return result
    except Exception as exc:
        log.error("isVerified call failed for %s: %s", address_checksum, exc)
        raise HTTPException(
            status_code=502,
            detail={"code": "CHAIN_CALL_FAILED", "message": str(exc)},
        ) from exc


def _derive_user_country(u: User) -> str | None:
    """Mirror the user-detail page logic — verified beats self-reported,
    Individual uses country_of_residence, Corporate uses jurisdiction.
    Falls back to the bare country_code column if nothing else is set.
    Values may be alpha-2, alpha-3, or numeric; resolveCountry on the FE
    handles all three.
    """
    investor_type = getattr(u, "investor_type", None)
    is_corporate = (
        investor_type.value if hasattr(investor_type, "value") else str(investor_type or "")
    ).lower() == "corporate"
    if is_corporate:
        return (
            getattr(u, "verified_company_jurisdiction", None)
            or getattr(u, "company_jurisdiction", None)
            or getattr(u, "country_code", None)
        )
    return (
        getattr(u, "verified_country_of_residence", None)
        or getattr(u, "country_of_residence", None)
        or getattr(u, "country_code", None)
    )


def _wallet_to_item(w: Wallet, u: User) -> AdminWalletItem:
    kyc_status = (
        u.kyc_status.value if hasattr(u.kyc_status, "value") else str(u.kyc_status)
    )
    return AdminWalletItem(
        id=w.id,
        address_checksum=w.address_checksum,
        chain_id=w.chain_id,
        is_primary=w.is_primary,
        is_safe=w.is_safe,
        registered_on_chain=w.registered_on_chain,
        label=w.label,
        linked_at=w.linked_at,
        last_screened_at=w.last_screened_at,
        risk_score=w.risk_score,
        user_id=u.id,
        user_email=u.email,
        user_display_name=u.display_name,
        user_country_code=_derive_user_country(u),
        user_kyc_status=kyc_status,
    )


# ── Endpoints ─────────────────────────────────────────────────────────


@router.get("", response_model=AdminWalletListResponse)
async def list_admin_wallets(
    _admin_id: RequireAdmin,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    search: str | None = Query(None),
    status: str = Query("all", pattern="^(all|registered|pending)$"),
) -> AdminWalletListResponse:
    """Paginated wallet list with user info.

    - search: ILIKE match on address_checksum, user.email, user.country_code
    - status: all | registered (registered_on_chain=True) | pending (=False)
    """
    offset = (page - 1) * size

    q = select(Wallet, User).join(User, Wallet.user_id == User.id)

    if search:
        pattern = f"%{search}%"
        q = q.where(
            or_(
                Wallet.address_checksum.ilike(pattern),
                User.email.ilike(pattern),
                User.country_code.ilike(pattern),
                User.country_of_residence.ilike(pattern),
                User.verified_country_of_residence.ilike(pattern),
            )
        )

    if status == "registered":
        q = q.where(Wallet.registered_on_chain.is_(True))
    elif status == "pending":
        q = q.where(Wallet.registered_on_chain.is_(False))

    q = q.order_by(Wallet.linked_at.desc())

    # Aggregate stats — independent of pagination and search filters
    stats_row = (
        await db.execute(
            select(
                func.count(Wallet.id).label("total_wallets"),
                func.count(Wallet.id).filter(
                    Wallet.registered_on_chain.is_(True)
                ).label("registered_on_chain"),
                func.count(Wallet.id).filter(
                    Wallet.registered_on_chain.is_(False)
                ).label("pending"),
            )
        )
    ).one()

    total = (
        await db.execute(select(func.count()).select_from(q.subquery()))
    ).scalar_one()

    rows = (await db.execute(q.offset(offset).limit(size))).all()

    items = [_wallet_to_item(w, u) for w, u in rows]

    return AdminWalletListResponse(
        items=items,
        total=total,
        page=page,
        size=size,
        stats={
            "total_wallets": stats_row.total_wallets,
            "registered_on_chain": stats_row.registered_on_chain,
            "pending": stats_row.pending,
        },
    )


@router.post("/{wallet_id}/refresh-status", response_model=RefreshStatusResponse)
async def refresh_wallet_status(
    wallet_id: UUID,
    _admin_id: RequireAdmin,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> RefreshStatusResponse:
    """Read isVerified(address) from the IdentityRegistry and sync the DB row."""
    result = await db.execute(select(Wallet).where(Wallet.id == wallet_id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(
            status_code=404,
            detail={"code": "WALLET_NOT_FOUND", "message": "Wallet not found"},
        )

    on_chain = await _check_onchain_verified(wallet.address_checksum)
    wallet.registered_on_chain = on_chain
    wallet.updated_at = datetime.now(UTC)
    await db.commit()

    synced_at = datetime.now(UTC)
    log.info(
        "refresh-status: wallet=%s addr=%s on_chain=%s",
        wallet_id,
        wallet.address_checksum,
        on_chain,
    )
    return RefreshStatusResponse(
        address=wallet.address_checksum,
        registered_on_chain=on_chain,
        synced_at=synced_at,
    )


@router.post("/{wallet_id}/mark-registered", response_model=AdminWalletItem)
async def mark_wallet_registered(
    wallet_id: UUID,
    body: MarkRegisteredRequest,
    _admin_id: RequireAdmin,  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> AdminWalletItem:
    """Mark a wallet as registered after the admin has signed the addToWhitelist tx.

    Optionally verifies the tx receipt was successful and targeted the IR address.
    """
    result = await db.execute(
        select(Wallet, User)
        .join(User, Wallet.user_id == User.id)
        .where(Wallet.id == wallet_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"code": "WALLET_NOT_FOUND", "message": "Wallet not found"},
        )
    wallet, user = row

    # Best-effort tx verification (non-blocking on failure)
    await _verify_tx_receipt(body.tx_hash, wallet.address_checksum)

    wallet.registered_on_chain = True
    wallet.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(wallet)

    log.info(
        "mark-registered: wallet=%s addr=%s tx=%s",
        wallet_id,
        wallet.address_checksum,
        body.tx_hash,
    )
    return _wallet_to_item(wallet, user)


async def _verify_tx_receipt(tx_hash: str, address_checksum: str) -> None:
    """Verify tx was successful and targeted the IR address. Logs but never raises."""
    try:
        from web3 import Web3

        from apps.api.core.web3_provider import get_web3_provider
        from packages.common.core.config import settings

        ir_address = getattr(settings, "identity_registry_address", "")
        w3 = get_web3_provider()
        receipt = await asyncio.to_thread(
            w3.eth.get_transaction_receipt, tx_hash
        )
        if receipt is None:
            log.warning(
                "mark-registered: tx %s receipt not found for wallet %s",
                tx_hash,
                address_checksum,
            )
            return
        if receipt.get("status") != 1:
            log.warning(
                "mark-registered: tx %s reverted for wallet %s",
                tx_hash,
                address_checksum,
            )
        if ir_address and receipt.get("to"):
            to_addr = Web3.to_checksum_address(receipt["to"])
            ir_check = Web3.to_checksum_address(ir_address)
            if to_addr != ir_check:
                log.warning(
                    "mark-registered: tx %s target=%s expected IR=%s",
                    tx_hash,
                    to_addr,
                    ir_check,
                )
    except Exception as exc:
        log.warning("mark-registered: tx receipt check failed: %s", exc)
