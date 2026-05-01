#!/usr/bin/env python3
"""DB seeder for the three-claim-sales manifest.

Reads a manifest produced by sandbox-three-claim-sales.ts and inserts the
rows needed for portfolio-claim UI testing:
  - tokens
  - token_sales (status=finalized_success, sale_mode=vested)
  - sale_phases
  - contributions (one row per buy tx hash, status=confirmed (vested holdings — user has not yet claimed via vault))
  - vesting_schedules (claimed_amount=0 — user has NOT claimed yet)

Idempotent on contract_address — safe to re-run.

Usage:
  DATABASE_URL=postgresql://... python3 contracts/scripts/sandbox-seed-three-claim-sales.py \\
      contracts/deployments/three-claim-sales.<timestamp>.json
"""

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import psycopg2
import psycopg2.extras


# ── tiny helpers ──────────────────────────────────────────────────────────────

def slugify(s: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in s).strip("-")


def fetchone(conn, sql, params=()):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        return dict(row) if row else None


def execute(conn, sql, params=()):
    with conn.cursor() as cur:
        cur.execute(sql, params)


# ── per-sale seed ─────────────────────────────────────────────────────────────

def seed_sale(conn, sale_entry: dict, investor_user_id: str, issuer_id: str):
    token_m = sale_entry["token"]
    sale_m  = sale_entry["sale"]
    phase_m = sale_entry["phases"][0]
    inv_m   = sale_entry["investor"]
    decimals = token_m["decimals"]

    cliff_sec  = sale_entry["cliffSeconds"]
    vest_sec   = sale_entry["vestingSeconds"]

    # ── Idempotency on symbol — append suffix if symbol already exists ─────
    symbol = token_m["symbol"]
    existing_sym = fetchone(
        conn,
        "SELECT id FROM tokens WHERE symbol = %s LIMIT 1",
        (symbol,),
    )
    if existing_sym:
        # Check if it's the SAME address
        same = fetchone(
            conn,
            "SELECT id FROM tokens WHERE symbol = %s AND LOWER(contract_address) = LOWER(%s) LIMIT 1",
            (symbol, token_m["address"]),
        )
        if not same:
            suffix = "a"
            while fetchone(conn, "SELECT id FROM tokens WHERE symbol = %s LIMIT 1", (symbol + suffix,)):
                suffix = chr(ord(suffix) + 1)
            print(f"  ⚠ Symbol {token_m['symbol']} already taken → using {symbol + suffix}")
            symbol = symbol + suffix

    # ── Token (idempotent by contract_address) ─────────────────────────────
    existing_token = fetchone(
        conn,
        "SELECT id FROM tokens WHERE LOWER(contract_address) = LOWER(%s) LIMIT 1",
        (token_m["address"],),
    )
    if existing_token:
        token_id = existing_token["id"]
        print(f"  ✓ Token {symbol} ({token_m['address'][:10]}…) already in DB")
    else:
        token_id = str(uuid.uuid4())
        execute(
            conn,
            """
            INSERT INTO tokens (
                id, issuer_id, name, symbol, asset_type,
                contract_address, chain_id, total_supply, decimals,
                description, slug,
                mintable, is_paused,
                created_at, updated_at
            ) VALUES (
                %s, %s, %s, %s, 'commodity',
                %s, %s, %s, %s,
                %s, %s,
                FALSE, FALSE,
                NOW(), NOW()
            )
            """,
            (
                token_id, str(issuer_id), token_m["name"], symbol,
                token_m["address"], 84532,
                Decimal(token_m["totalSupply"]),
                decimals,
                f"{token_m['name']} — sandbox claim-flow test token (Base Sepolia). "
                f"Cliff: {cliff_sec}s, vesting: {vest_sec}s.",
                slugify(token_m["name"]),
            ),
        )
        print(f"  + Created token row: {symbol}")

    # ── Sale (idempotent by contract_address) ──────────────────────────────
    existing_sale = fetchone(
        conn,
        "SELECT id FROM token_sales WHERE LOWER(contract_address) = LOWER(%s) LIMIT 1",
        (sale_m["address"],),
    )
    if existing_sale:
        sale_id = existing_sale["id"]
        print(f"  ✓ Sale {sale_m['address'][:10]}… already in DB")
    else:
        sale_id = str(uuid.uuid4())
        sale_start_dt = datetime.fromtimestamp(sale_m["startTime"], tz=timezone.utc)
        sale_end_dt   = datetime.fromtimestamp(sale_m["endTime"],   tz=timezone.utc)
        finalized_dt  = datetime.fromtimestamp(sale_entry["finalizedAtUnix"], tz=timezone.utc)
        slug = f"{slugify(symbol)}-token-sale-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}"

        total_raised_usdc = Decimal(inv_m["contributedUsdc"])  # already human-readable
        platform_fee = total_raised_usdc * Decimal(sale_entry["feeBps"]) / Decimal(10000)

        hard_cap_usdc = Decimal(sale_m["hardCap"]) / Decimal(10 ** 6)

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
                sale_id, str(token_id), str(issuer_id),
                f"{token_m['name']} Token Sale", slug,
                # description
                f"Sandbox claim-flow test sale — vested mode, "
                f"cliff={cliff_sec}s, vesting={vest_sec}s. "
                f"Finalized on-chain at {finalized_dt.isoformat()}.",
                # full_description
                f"{token_m['name']} is a sandbox-only test token for validating the "
                f"portfolio claim flow on Base Sepolia. "
                f"cliff_duration={cliff_sec}s, vesting_duration={vest_sec}s.",
                None,  # banner_image_url
                cliff_sec, vest_sec,
                "USDC",
                Decimal("1"),           # soft_cap (1 USDC)
                hard_cap_usdc,
                Decimal(token_m["totalSupply"]) / Decimal(10 ** decimals),
                Decimal("50000"),       # fee_cap_usdc
                sale_m["address"],
                finalized_dt,
                sale_entry["feeBps"],
                sale_m.get("vault"),
                sale_m.get("fraction"),
                sale_start_dt, sale_end_dt,
                sale_start_dt, sale_start_dt,   # approved_at, activated_at
                total_raised_usdc, total_raised_usdc, platform_fee,
            ),
        )
        print(f"  + Created token_sale row (status=finalized_success, raised={total_raised_usdc} USDC)")

    # ── Phase (idempotent) ─────────────────────────────────────────────────
    existing_phase = fetchone(
        conn,
        "SELECT id FROM sale_phases WHERE sale_id = %s AND phase_number = 0 LIMIT 1",
        (str(sale_id),),
    )
    if existing_phase:
        phase_id = existing_phase["id"]
        print(f"  ✓ Phase 0 already in DB")
    else:
        phase_id = str(uuid.uuid4())
        phase_start_dt = datetime.fromtimestamp(phase_m["startTime"], tz=timezone.utc)
        phase_end_dt   = datetime.fromtimestamp(phase_m["endTime"],   tz=timezone.utc)
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
                0, 0, 0,
                %s, %s, %s,
                'fixed',
                %s, %s, FALSE, TRUE,
                0,
                NOW(), NOW()
            )
            """,
            (
                phase_id, str(sale_id), phase_m["name"],
                Decimal(phase_m["pricePerToken"]) / Decimal(10 ** 6),
                Decimal(phase_m["allocation"]) / Decimal(10 ** decimals),
                Decimal("10"),   # minTokens
                Decimal("0"),    # maxTokens = 0 = unlimited
                Decimal("5"),    # topUpMinTokens
                phase_start_dt, phase_end_dt,
            ),
        )
        print(f"  + Created sale_phase 0 ({phase_m['name']})")

    # ── Contributions (confirmed (vested holdings — user has not yet claimed via vault) — user has NOT claimed yet) ───────────
    price_per_token = Decimal(phase_m["pricePerToken"]) / Decimal(10 ** 6)
    tokens_held = Decimal(inv_m["tokensHeld"])  # human-readable already

    inserted_contribs = 0
    for tx_hash in inv_m["buyTxHashes"]:
        existing = fetchone(
            conn,
            "SELECT id FROM contributions WHERE tx_hash = %s LIMIT 1",
            (tx_hash,),
        )
        if existing:
            continue
        # All tokens bought in one tx: entire supply
        usdc_amount = tokens_held * price_per_token
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
                %s, 'confirmed', NULL, NULL,
                FALSE, %s, 0,
                NOW(), NOW()
            )
            """,
            (
                str(uuid.uuid4()), str(investor_user_id), str(sale_id), str(phase_id),
                usdc_amount, usdc_amount, tokens_held,
                tx_hash,
                inv_m["wallet"],
            ),
        )
        inserted_contribs += 1
    print(f"  + {inserted_contribs} contribution row(s) (status=confirmed (vested holdings — user has not yet claimed via vault))")

    # ── Vesting schedule (unclaimed — for UI to show claim button) ─────────
    existing_vs = fetchone(
        conn,
        "SELECT id FROM vesting_schedules WHERE token_id = %s AND user_id = %s LIMIT 1",
        (str(token_id), str(investor_user_id)),
    )
    if existing_vs:
        print(f"  ✓ Vesting schedule already exists")
    else:
        finalized_dt = datetime.fromtimestamp(sale_entry["finalizedAtUnix"], tz=timezone.utc)
        # cliff_end = finalized_at + cliffSeconds
        cliff_end = finalized_dt + timedelta(seconds=cliff_sec)
        # vesting_end: if vestingSeconds=0 (cliff-only), vesting_end = cliff_end
        if vest_sec == 0:
            vesting_end = cliff_end
        else:
            vesting_end = finalized_dt + timedelta(seconds=vest_sec)

        execute(
            conn,
            """
            INSERT INTO vesting_schedules (
                id, token_id, user_id, total_amount, claimed_amount,
                cliff_end, vesting_end, last_claim_at,
                is_revocable, is_revoked,
                created_at, updated_at
            ) VALUES (
                %s, %s, %s, %s, 0,
                %s, %s, NULL,
                FALSE, FALSE,
                NOW(), NOW()
            )
            """,
            (
                str(uuid.uuid4()), str(token_id), str(investor_user_id),
                tokens_held,
                cliff_end, vesting_end,
            ),
        )
        print(
            f"  + Vesting schedule: total={tokens_held}, claimed=0, "
            f"cliff_end={cliff_end.isoformat()}, vesting_end={vesting_end.isoformat()}"
        )

    return token_id, sale_id


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Seed DB for three-claim-sales manifest")
    parser.add_argument("manifest", help="Path to three-claim-sales.<timestamp>.json")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("DATABASE_URL not set")
    if db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        sys.exit(f"Manifest not found: {manifest_path}")

    manifest = json.loads(manifest_path.read_text())
    print(f"\n══ {manifest_path.name} ══")
    print(f"  Network: {manifest['network']}  Chain: {manifest['chainId']}")
    print(f"  Deployed: {manifest['deployedAt']}\n")

    conn = psycopg2.connect(db_url)
    conn.autocommit = False

    try:
        # ── Investor lookup ──────────────────────────────────────────────
        # All 3 sales share the same investor wallet
        investor_wallet = manifest["sales"][0]["investor"]["wallet"]
        inv_user = fetchone(
            conn,
            "SELECT u.id, u.email FROM users u JOIN wallets w ON w.user_id = u.id "
            "WHERE LOWER(w.address) = LOWER(%s) LIMIT 1",
            (investor_wallet,),
        )
        if not inv_user:
            sys.exit(
                f"Investor wallet {investor_wallet} not linked to any user. "
                "Re-run AGENT seed first."
            )
        investor_user_id = inv_user["id"]
        print(f"  ✓ Investor → {inv_user['email']} (id={investor_user_id})")

        # ── Issuer lookup ─────────────────────────────────────────────────
        issuer_wallet = manifest["sales"][0]["issuer"]["wallet"]
        iss = fetchone(
            conn,
            "SELECT id FROM issuers WHERE LOWER(wallet_address) = LOWER(%s) LIMIT 1",
            (issuer_wallet,),
        )
        if not iss:
            sys.exit(
                f"Issuer {issuer_wallet} not in DB. Re-run AGENT seed first."
            )
        issuer_id = iss["id"]
        print(f"  ✓ Issuer found (id={issuer_id})\n")

        # ── Seed each sale ────────────────────────────────────────────────
        token_ids = []
        sale_ids  = []
        for entry in manifest["sales"]:
            print(f"─ {entry['tokenSymbol']} ({entry['tokenName']}) ─")
            tok_id, sal_id = seed_sale(conn, entry, investor_user_id, issuer_id)
            token_ids.append(tok_id)
            sale_ids.append(sal_id)
            print()

        conn.commit()

        # ── Verify ────────────────────────────────────────────────────────
        print("── Post-seed verification ──────────────────────────────────────")
        for i, entry in enumerate(manifest["sales"]):
            sym = entry["tokenSymbol"]
            tok = fetchone(conn, "SELECT id, symbol, contract_address FROM tokens WHERE id = %s", (str(token_ids[i]),))
            sal = fetchone(conn, "SELECT id, status, vault_address, cliff_duration_seconds, vesting_duration_seconds FROM token_sales WHERE id = %s", (str(sale_ids[i]),))
            vs  = fetchone(conn, "SELECT id, total_amount, claimed_amount, cliff_end, vesting_end FROM vesting_schedules WHERE token_id = %s AND user_id = %s", (str(token_ids[i]), str(investor_user_id)))
            print(f"  {sym}:")
            print(f"    token        {tok['contract_address'] if tok else 'MISSING'}")
            print(f"    sale status  {sal['status'] if sal else 'MISSING'}")
            print(f"    vault        {sal['vault_address'] if sal else 'MISSING'}")
            print(f"    cliff/vest   {sal['cliff_duration_seconds']}s / {sal['vesting_duration_seconds']}s" if sal else "    MISSING")
            if vs:
                print(f"    vs total     {vs['total_amount']}  claimed={vs['claimed_amount']}")
                print(f"    cliff_end    {vs['cliff_end']}")
                print(f"    vesting_end  {vs['vesting_end']}")
            else:
                print(f"    vesting_schedule MISSING")

        print(f"\n✓ Committed. Seeded {len(manifest['sales'])} sales.\n")

    except Exception as e:
        conn.rollback()
        print(f"\n✗ Rolled back: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
