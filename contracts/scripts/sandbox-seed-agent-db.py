#!/usr/bin/env python3
"""Seed sandbox DB with the AGENT sale that scripts/sandbox-deploy-agent-sale.ts
just deployed on Base Sepolia.

Reads the manifest produced by the deploy script (most recent
contracts/deployments/agent-sale.*.json) and inserts:

  - users: investor (only if their wallet isn't already linked to a user)
  - wallets: investor's wallet (only if not already linked)
  - issuers: AGENT Issuer (linked to a fresh issuer-user)
  - tokens: AGENT (linked to issuer)
  - token_sales: AGENT sale (linked to issuer + token)
  - sale_phases: Seed phase
  - contributions: 3 rows, one per buy chunk
  - vesting_schedules: investor's claim window (cliff_end = vesting_end = finalize+300s)

Idempotent: re-running on the same manifest is a no-op (lookup by contract_address
or wallet_address before inserting).

Usage:
  DATABASE_URL='postgresql://...switchyard.proxy.rlwy.net.../railway' \
    python contracts/scripts/sandbox-seed-agent-db.py [path/to/manifest.json]
"""

import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras


# ── Helpers ────────────────────────────────────────────────────────────────


def latest_manifest() -> Path:
    deploy_dir = Path(__file__).parent.parent / "deployments"
    candidates = sorted(deploy_dir.glob("agent-sale.*.json"), reverse=True)
    if not candidates:
        sys.exit(f"No agent-sale.*.json manifest found in {deploy_dir}")
    return candidates[0]


def fetchone(conn, sql: str, params: tuple = ()) -> dict | None:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        return dict(row) if row else None


def execute(conn, sql: str, params: tuple = ()) -> None:
    with conn.cursor() as cur:
        cur.execute(sql, params)


def insert_with_timestamps(conn, table: str, columns: list[str], values: list, returning: str = "id") -> str:
    """Helper for inserts that need created_at + updated_at populated.

    BaseModel uses insert_default=datetime.now (Python-side), which doesn't
    apply when we go through raw psycopg2. Easiest fix: append the timestamp
    columns ourselves.
    """
    cols = columns + ["created_at", "updated_at"]
    placeholders = ", ".join(["%s"] * len(columns)) + ", NOW(), NOW()"
    sql = f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) RETURNING {returning}"
    with conn.cursor() as cur:
        cur.execute(sql, values)
        row = cur.fetchone()
        return row[0] if row else None


def slugify(s: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in s).strip("-")


# ── Main ──────────────────────────────────────────────────────────────────


def main():
    manifest_path = Path(sys.argv[1]) if len(sys.argv) > 1 else latest_manifest()
    if not manifest_path.exists():
        sys.exit(f"Manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text())
    print(f"  Manifest: {manifest_path.name}")
    print(f"  Token:    {manifest['token']['address']}")
    print(f"  Sale:     {manifest['sale']['address']}\n")

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("DATABASE_URL not set. export it from .env before running.")
    # psycopg2 uses 'postgresql://', drop the asyncpg driver suffix if present
    if db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    conn = psycopg2.connect(db_url)
    conn.autocommit = False  # one transaction for atomicity

    try:
        token = manifest["token"]
        sale_m = manifest["sale"]
        phase = manifest["phases"][0]
        issuer_m = manifest["issuer"]
        investor_m = manifest["investor"]

        # ── 1. Find or create the investor user ──
        investor_wallet = investor_m["wallet"]
        existing_inv_user = fetchone(
            conn,
            "SELECT u.id, u.email FROM users u "
            "JOIN wallets w ON w.user_id = u.id "
            "WHERE LOWER(w.address) = LOWER(%s) "
            "LIMIT 1",
            (investor_wallet,),
        )
        if existing_inv_user:
            investor_user_id = existing_inv_user["id"]
            print(f"  ✓ Investor wallet {investor_wallet[:10]}… already linked to user {existing_inv_user['email']}")
        else:
            investor_user_id = uuid.uuid4()
            execute(
                conn,
                """
                INSERT INTO users (
                    id, email, password_hash, role, kyc_status, kyc_level,
                    kyc_verified_at, country_code, investor_type,
                    nationality, country_of_residence, phone_number, date_of_birth,
                    verified_full_name, verified_nationality, verified_country_of_residence,
                    verified_phone_number, verified_date_of_birth, kyc_synced_at,
                    onboarding_completed, email_verified, email_verified_at,
                    is_accredited, failed_login_attempts,
                    created_at, updated_at
                ) VALUES (
                    %s, %s, %s, 'investor', 'approved', 2,
                    %s, 'GB', 'individual',
                    'GB', 'GB', '+447900900900', %s,
                    'Test Investor', 'GBR', 'GBR',
                    '+447900900900', %s, %s,
                    TRUE, TRUE, %s,
                    FALSE, 0,
                    NOW(), NOW()
                )
                """,
                (
                    str(investor_user_id),
                    f"investor-{investor_wallet[2:10].lower()}@cireta-test.local",
                    "$2b$12$placeholder.no.login.expected",  # bcrypt-ish placeholder
                    datetime.now(timezone.utc),
                    "1990-04-12",
                    "1990-04-12",
                    datetime.now(timezone.utc),
                    datetime.now(timezone.utc),
                ),
            )
            execute(
                conn,
                """
                INSERT INTO wallets (id, user_id, address, address_checksum, chain_id, is_primary, registered_on_chain, linked_at,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, TRUE, TRUE, %s,
                    NOW(), NOW()
                )
                """,
                (
                    str(uuid.uuid4()),
                    str(investor_user_id),
                    investor_wallet.lower(),
                    investor_wallet,
                    84532,
                    datetime.now(timezone.utc),
                ),
            )
            print(f"  + Created investor user + wallet ({investor_wallet[:10]}…)")

        # ── 2. Find or create issuer user + issuer ──
        issuer_wallet = issuer_m["wallet"]
        existing_issuer = fetchone(
            conn,
            "SELECT id, user_id FROM issuers WHERE LOWER(wallet_address) = LOWER(%s) LIMIT 1",
            (issuer_wallet,),
        )
        if existing_issuer:
            issuer_id = existing_issuer["id"]
            issuer_user_id = existing_issuer["user_id"]
            print(f"  ✓ Issuer {issuer_wallet[:10]}… already in DB (id={issuer_id})")
        else:
            issuer_user_id = uuid.uuid4()
            execute(
                conn,
                """
                INSERT INTO users (
                    id, email, password_hash, role, kyc_status, kyc_level,
                    country_code, investor_type, onboarding_completed,
                    email_verified, is_accredited, failed_login_attempts,
                    created_at, updated_at
                ) VALUES (
                    %s, %s, %s, 'issuer', 'approved', 2,
                    'GB', 'corporate', TRUE,
                    TRUE, TRUE, 0,
                    NOW(), NOW()
                )
                """,
                (
                    str(issuer_user_id),
                    f"issuer-{issuer_wallet[2:10].lower()}@cireta-test.local",
                    "$2b$12$placeholder.no.login.expected",
                ),
            )
            issuer_id = uuid.uuid4()
            execute(
                conn,
                """
                INSERT INTO issuers (
                    id, user_id, name, slug, wallet_address, fee_bps, status,
                    legal_entity_name, jurisdiction, issuer_type,
                    wallet_status, identity_status,
                    created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, 'active',
                    %s, %s, 'corporate',
                    'approved', 'verified',
                    NOW(), NOW()
                )
                """,
                (
                    str(issuer_id),
                    str(issuer_user_id),
                    issuer_m["name"],
                    slugify(issuer_m["name"]),
                    issuer_wallet,
                    manifest["feeBps"],
                    issuer_m["name"],
                    issuer_m["jurisdiction"],
                ),
            )
            print(f"  + Created issuer user + issuer row ({issuer_wallet[:10]}…)")

        # ── 3. Find or create token ──
        existing_token = fetchone(
            conn,
            "SELECT id FROM tokens WHERE LOWER(contract_address) = LOWER(%s) LIMIT 1",
            (token["address"],),
        )
        if existing_token:
            token_id = existing_token["id"]
            print(f"  ✓ Token {token['address'][:10]}… already in DB (id={token_id})")
        else:
            token_id = uuid.uuid4()
            execute(
                conn,
                """
                INSERT INTO tokens (
                    id, issuer_id, name, symbol, asset_type,
                    contract_address, chain_id, total_supply, decimals,
                    description, image_url, slug,
                    mintable, is_paused,
                    created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s, 'commodity',
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    FALSE, FALSE,
                    NOW(), NOW()
                )
                """,
                (
                    str(token_id),
                    str(issuer_id),
                    token["name"],
                    token["symbol"],
                    token["address"],
                    84532,
                    Decimal(token["totalSupply"]),
                    token["decimals"],
                    "AGENT — sandbox E2E test token. 1,000 fixed supply, single Seed phase, "
                    "5-minute post-finalization vault lockup.",
                    None,
                    slugify(token["name"]),
                ),
            )
            print(f"  + Created token row ({token['address'][:10]}…)")

        # ── 4. Find or create token_sale ──
        existing_sale = fetchone(
            conn,
            "SELECT id FROM token_sales WHERE LOWER(contract_address) = LOWER(%s) LIMIT 1",
            (sale_m["address"],),
        )
        if existing_sale:
            sale_id = existing_sale["id"]
            print(f"  ✓ Sale {sale_m['address'][:10]}… already in DB (id={sale_id})")
        else:
            sale_id = uuid.uuid4()
            sale_start_dt = datetime.fromtimestamp(sale_m["startTime"], tz=timezone.utc)
            sale_end_dt = datetime.fromtimestamp(sale_m["endTime"], tz=timezone.utc)
            slug = f"agent-token-sale-{datetime.now().strftime('%Y%m%d-%H%M')}"
            execute(
                conn,
                """
                INSERT INTO token_sales (
                    id, token_id, issuer_id, title, slug,
                    description, full_description, banner_image_url,
                    is_coming_soon, is_visible, otc_enabled,
                    cliff_duration_seconds, vesting_duration_seconds,
                    payment_token, soft_cap, hard_cap, total_token_supply,
                    status, fee_cap_usdc, contract_address, finalized_at,
                    platform_fee_bps, sale_mode, sale_structure,
                    vault_address, fraction_token_address,
                    sale_start_time, sale_end_time, is_open_ended,
                    approved_at, activated_at,
                    is_redeemable,
                    total_raised, total_raised_on_platform, platform_fee_collected, total_withdrawn,
                    finalization_pending,
                    created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    FALSE, TRUE, FALSE,
                    %s, %s,
                    %s, %s, %s, %s,
                    'finalized_success', %s, %s, %s,
                    %s, 'vested', 'phase_allocated',
                    %s, %s,
                    %s, %s, FALSE,
                    %s, %s,
                    FALSE,
                    %s, %s, %s, 0,
                    FALSE,
                    NOW(), NOW()
                )
                """,
                (
                    str(sale_id),
                    str(token_id),
                    str(issuer_id),
                    "AGENT Token Sale",
                    slug,
                    "Sandbox E2E test sale for AGENT — single Seed phase, vested mode with 5-minute lockup.",
                    "AGENT is the fixed-supply test token used to validate the platform's deploy → buy → claim "
                    "lifecycle on Base Sepolia. The sale ran a single Seed phase (1 USDC per token, min 10 / "
                    "topup 5 / no per-investor cap) and locked all minted fractions for 5 minutes after "
                    "finalization before allowing claim from the vault.",
                    None,
                    sale_m["cliffSeconds"],
                    sale_m["vestingSeconds"],
                    "USDC",
                    Decimal(sale_m["softCap"]),
                    Decimal(sale_m["hardCap"]),
                    Decimal(sale_m["totalTokenSupply"]),
                    Decimal("50000"),
                    sale_m["address"],
                    sale_end_dt,
                    manifest["feeBps"],
                    sale_m["vault"],
                    sale_m["fraction"],
                    sale_start_dt,
                    sale_end_dt,
                    sale_start_dt,
                    sale_start_dt,
                    Decimal("350000000"),         # total_raised (raw 18-decimal scale unused in spec)
                    Decimal("350"),               # total_raised_on_platform (USDC, 6-decimal display)
                    Decimal("7"),                 # platform_fee_collected (200bps of 350 = 7 USDC)
                ),
            )
            print(f"  + Created token_sale row ({sale_m['address'][:10]}…)")

        # ── 5. Find or create sale_phase ──
        existing_phase = fetchone(
            conn,
            "SELECT id FROM sale_phases WHERE sale_id = %s AND phase_number = %s LIMIT 1",
            (str(sale_id), 0),
        )
        if existing_phase:
            phase_id = existing_phase["id"]
            print(f"  ✓ Phase 0 already in DB")
        else:
            phase_id = uuid.uuid4()
            phase_start_dt = datetime.fromtimestamp(phase["startTime"], tz=timezone.utc)
            phase_end_dt = datetime.fromtimestamp(phase["endTime"], tz=timezone.utc)
            execute(
                conn,
                """
                INSERT INTO sale_phases (
                    id, sale_id, phase_number, name,
                    price_per_token, allocation,
                    min_contribution, max_contribution, top_up_min,
                    min_tokens, max_tokens, top_up_min_tokens,
                    allocation_mode,
                    start_time, end_time, whitelist_only, deployed_on_chain,
                    on_chain_phase_id,
                    created_at, updated_at
                ) VALUES (
                    %s, %s, 0, %s,
                    %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    'fixed',
                    %s, %s, FALSE, TRUE,
                    0,
                    NOW(), NOW()
                )
                """,
                (
                    str(phase_id),
                    str(sale_id),
                    phase["name"],
                    Decimal(phase["pricePerToken"]),
                    Decimal(phase["allocation"]),
                    Decimal("0"),     # legacy: USDC-denominated min — keep zero, use min_tokens
                    Decimal("0"),
                    Decimal("0"),
                    Decimal(phase["minTokens"]),
                    Decimal(phase["maxTokens"]),
                    Decimal(phase["topUpMinTokens"]),
                    phase_start_dt,
                    phase_end_dt,
                ),
            )
            print(f"  + Created sale_phase 0 ({phase['name']})")

        # ── 6. Insert contributions (one per buy chunk) ──
        # 3 buys: 100 + 200 + 50 = 350 tokens, 1 USDC each
        chunk_qtys = [Decimal("100"), Decimal("200"), Decimal("50")]
        usdc_decimals = 6
        token_decimals_factor = Decimal(10) ** Decimal(token["decimals"])
        usdc_factor = Decimal(10) ** Decimal(usdc_decimals)
        for tx_hash, qty in zip(investor_m["buyTxHashes"], chunk_qtys):
            existing_contrib = fetchone(
                conn,
                "SELECT id FROM contributions WHERE tx_hash = %s LIMIT 1",
                (tx_hash,),
            )
            if existing_contrib:
                continue
            usdc_amount = qty * usdc_factor  # 1 USDC per token
            tokens_raw = qty * token_decimals_factor
            execute(
                conn,
                """
                INSERT INTO contributions (
                    id, user_id, sale_id, phase_id,
                    amount, payment_amount, otc_amount, tokens_allocated,
                    tx_hash, status, claimed_at, claim_tx_hash,
                    is_otc, wallet_address, phase_index,
                    created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, %s, 0, %s,
                    %s, 'claimed', %s, NULL,
                    FALSE, %s, 0,
                    NOW(), NOW()
                )
                """,
                (
                    str(uuid.uuid4()),
                    str(investor_user_id),
                    str(sale_id),
                    str(phase_id),
                    usdc_amount,
                    usdc_amount,
                    tokens_raw,
                    tx_hash,
                    datetime.now(timezone.utc),
                    investor_wallet,
                ),
            )
        print(f"  + Inserted {len(investor_m['buyTxHashes'])} contribution rows")

        # ── 7. Vesting schedule ──
        existing_vs = fetchone(
            conn,
            "SELECT id FROM vesting_schedules WHERE token_id = %s AND user_id = %s LIMIT 1",
            (str(token_id), str(investor_user_id)),
        )
        if existing_vs:
            print(f"  ✓ Vesting schedule already exists for this investor + token")
        else:
            sale_end_dt = datetime.fromtimestamp(sale_m["endTime"], tz=timezone.utc)
            cliff_end = sale_end_dt + timedelta(seconds=sale_m["cliffSeconds"])
            execute(
                conn,
                """
                INSERT INTO vesting_schedules (
                    id, token_id, user_id, total_amount, claimed_amount,
                    cliff_end, vesting_end, last_claim_at,
                    is_revocable, is_revoked,
                    created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    FALSE, FALSE,
                    NOW(), NOW()
                )
                """,
                (
                    str(uuid.uuid4()),
                    str(token_id),
                    str(investor_user_id),
                    Decimal("350") * token_decimals_factor,
                    Decimal("350") * token_decimals_factor,
                    cliff_end,
                    cliff_end,
                    datetime.now(timezone.utc),
                ),
            )
            print(f"  + Inserted vesting_schedule (claimed in full)")

        conn.commit()
        print("\n  ✓ All rows committed.")
        print(f"\n  Sale should be visible at:")
        print(f"    https://keetasb.appsmesh.com/project/{slug}")
        print(f"    https://keetasb-admin.appsmesh.com/platform/sales\n")
    except Exception as e:
        conn.rollback()
        print(f"\n  ✗ Rolled back. Error: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
