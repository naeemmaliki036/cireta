"""Reconcile every Wallet row against the on-chain identity registry.

Walks every wallet in the DB and compares ``Wallet.registered_on_chain``
to ``SimpleIdentityRegistry.isVerified(addr)``. Three outcomes per row:

- **In sync** (DB = chain) — no action.
- **DB says registered, chain says no** — DB cache is stale (this is the
  state we expect after the proxy was pointing at a broken impl). Group
  by user_id and enqueue an ``IdentitySyncJob action=PROVISION`` per
  user — the worker will batch-add them all via ``batchAddToWhitelist``.
- **DB says NOT registered, chain says yes** — chain is ahead of the DB
  cache (e.g. an emergency manual flow already added them). Just flip
  the DB flag, no on-chain write needed.

Usage:

    set -a && source .env && set +a
    poetry run python scripts/reconcile_identity_registry.py            # dry-run
    poetry run python scripts/reconcile_identity_registry.py --apply    # apply

Decisions:
- Dry-run by default. Pass ``--apply`` to actually flip flags + enqueue.
- Reads ``DATABASE_URL`` and registry address from env (same as the API).
- Groups DB-stale rows by user so each affected buyer gets exactly ONE
  ``provision`` job (not one per wallet) — the worker uses
  ``batchAddToWhitelist`` so multiple wallets cost one tx.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from collections import defaultdict

import dotenv
from sqlalchemy import select
from web3 import Web3

dotenv.load_dotenv(".env")

# Make ``apps`` importable when running this from the repo root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

REGISTRY_ABI = [
    {
        "inputs": [{"name": "userAddress", "type": "address"}],
        "name": "isVerified",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
]


async def main(apply: bool, only_user: str | None) -> int:
    from packages.common.core.config import settings  # noqa: PLC0415

    from apps.api.models.enums import IdentitySyncJobAction  # noqa: PLC0415
    from apps.api.models.user import User  # noqa: PLC0415
    from apps.api.models.wallet import Wallet  # noqa: PLC0415
    from apps.api.services.identity_sync_service import enqueue_identity_sync  # noqa: PLC0415
    from packages.common.db.session import AsyncSessionLocal  # noqa: PLC0415

    if not settings.identity_registry_address:
        print("ERROR: IDENTITY_REGISTRY_ADDRESS not set")
        return 1
    if not settings.web3_rpc_url:
        print("ERROR: WEB3_RPC_URL not set")
        return 1

    print(f"Registry  : {settings.identity_registry_address}")
    print(f"RPC       : {settings.web3_rpc_url}")
    print(f"Mode      : {'APPLY' if apply else 'DRY-RUN'}")
    if only_user:
        print(f"Filter    : user_id={only_user}")
    print()

    w3 = Web3(Web3.HTTPProvider(settings.web3_rpc_url))
    registry = w3.eth.contract(
        address=Web3.to_checksum_address(settings.identity_registry_address),
        abi=REGISTRY_ABI,
    )

    async with AsyncSessionLocal() as db:
        q = select(Wallet)
        if only_user:
            q = q.where(Wallet.user_id == only_user)
        wallet_rows = list((await db.execute(q)).scalars().all())
        print(f"Loaded {len(wallet_rows)} wallet row(s) from DB")

        in_sync = 0
        db_stale_register = []  # [(wallet_id, user_id, addr)]
        chain_ahead = []        # [(wallet, addr)]
        rpc_errors = 0

        for w in wallet_rows:
            try:
                checksum = Web3.to_checksum_address(w.address_checksum)
            except Exception:
                checksum = w.address_checksum
            try:
                on_chain = await asyncio.to_thread(
                    registry.functions.isVerified(checksum).call
                )
            except Exception as exc:
                rpc_errors += 1
                print(f"  RPC error for {checksum}: {exc}")
                continue

            db_flag = bool(w.registered_on_chain)
            if db_flag == on_chain:
                in_sync += 1
                continue
            if db_flag and not on_chain:
                db_stale_register.append((w.id, w.user_id, checksum))
            else:  # not db_flag and on_chain
                chain_ahead.append((w, checksum))

        print()
        print(f"In sync                    : {in_sync}")
        print(f"DB says yes, chain says no : {len(db_stale_register)} (need re-register)")
        print(f"DB says no, chain says yes : {len(chain_ahead)} (just flip DB cache)")
        print(f"RPC errors                 : {rpc_errors}")

        # Group DB-stale rows by user so each buyer gets ONE provision job
        # (worker uses batchAddToWhitelist).
        per_user: dict[str, list[str]] = defaultdict(list)
        for _wid, uid, addr in db_stale_register:
            per_user[str(uid)].append(addr)

        if per_user:
            print()
            print("Per-user re-register plan:")
            for uid, addrs in per_user.items():
                print(f"  user {uid}: {len(addrs)} wallet(s)")

        if chain_ahead:
            print()
            print("Wallets to flip DB→true:")
            for w, addr in chain_ahead:
                print(f"  user={w.user_id} {addr}")

        if not apply:
            print()
            print("DRY-RUN — no changes made. Re-run with --apply to act.")
            return 0

        # ---- Apply ----
        # 1. Flip cache for chain-ahead rows
        for w, _addr in chain_ahead:
            w.registered_on_chain = True
        if chain_ahead:
            await db.commit()
            print(f"\nFlipped {len(chain_ahead)} DB cache row(s) → registered_on_chain=true")

        # 2. Mark DB-stale rows as not-yet-registered, then enqueue provision per user
        if db_stale_register:
            for wid, _uid, _addr in db_stale_register:
                wq = await db.execute(select(Wallet).where(Wallet.id == wid))
                wrow = wq.scalar_one_or_none()
                if wrow:
                    wrow.registered_on_chain = False
            await db.commit()
            print(
                f"Cleared {len(db_stale_register)} stale DB cache row(s) "
                "→ registered_on_chain=false (worker will re-register)"
            )

        for uid, addrs in per_user.items():
            # Verify the user is still KYC-approved before enqueuing
            user_q = await db.execute(select(User).where(User.id == uid))
            user = user_q.scalar_one_or_none()
            if not user:
                print(f"  user {uid}: not found, skipping")
                continue
            if user.kyc_status != "approved":
                print(
                    f"  user {uid}: kyc_status={user.kyc_status}, "
                    f"skipping enqueue (only re-register approved users)"
                )
                continue
            try:
                job = await enqueue_identity_sync(
                    db,
                    user_id=user.id,
                    action=IdentitySyncJobAction.PROVISION,
                )
                print(
                    f"  user {uid}: enqueued provision job {job.id} "
                    f"({len(addrs)} wallet(s))"
                )
            except Exception as exc:
                print(f"  user {uid}: enqueue failed — {exc}")

    print()
    print("Reconcile complete.")
    return 0


def cli() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually apply changes (otherwise dry-run)")
    parser.add_argument("--user", help="Only reconcile a specific user_id")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(apply=args.apply, only_user=args.user)))


if __name__ == "__main__":
    cli()
