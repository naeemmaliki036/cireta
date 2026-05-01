#!/usr/bin/env python3
"""Generalized DB seeder for sandbox sales.

Reads a manifest produced by sandbox-multi-sale.ts (TIN-direct or SILVER-vested
shape) and inserts the rows the launchpad/admin UI needs. Handles both Direct
and Vested modes.

Usage:
  DATABASE_URL=postgresql://... python contracts/scripts/sandbox-seed-multi-db.py path/to/manifest.json

Or pass NO arg to seed BOTH the most-recent tin-direct.*.json and silver-vested.*.json.
"""

import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import psycopg2
import psycopg2.extras


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


def latest(prefix: str) -> Path | None:
    deploy = Path(__file__).parent.parent / "deployments"
    cands = sorted(deploy.glob(f"{prefix}.*.json"), reverse=True)
    return cands[0] if cands else None


def seed_one(conn, manifest_path: Path):
    manifest = json.loads(manifest_path.read_text())
    print(f"\n══ {manifest_path.name} ══")
    token = manifest["token"]
    sale_m = manifest["sale"]
    phase = manifest["phases"][0]
    issuer_m = manifest["issuer"]
    investor_m = manifest["investor"]
    is_vested = sale_m["mode"] == "Vested"
    vault_addr = sale_m.get("vault")
    fraction_addr = sale_m.get("fraction")

    # ── Investor user lookup ──
    inv_user = fetchone(
        conn,
        "SELECT u.id, u.email FROM users u JOIN wallets w ON w.user_id = u.id "
        "WHERE LOWER(w.address) = LOWER(%s) LIMIT 1",
        (investor_m["wallet"],),
    )
    if not inv_user:
        print(f"  ✗ Investor wallet {investor_m['wallet']} not linked to any user — re-run AGENT seed first")
        return False
    investor_user_id = inv_user["id"]
    print(f"  ✓ Investor → {inv_user['email']}")

    # ── Issuer lookup ──
    iss = fetchone(
        conn,
        "SELECT id FROM issuers WHERE LOWER(wallet_address) = LOWER(%s) LIMIT 1",
        (issuer_m["wallet"],),
    )
    if not iss:
        print(f"  ✗ Issuer {issuer_m['wallet']} not in DB — re-run AGENT seed first")
        return False
    issuer_id = iss["id"]
    print(f"  ✓ Issuer found (id={issuer_id})")

    # ── Token (idempotent) ──
    existing_token = fetchone(
        conn,
        "SELECT id FROM tokens WHERE LOWER(contract_address) = LOWER(%s) LIMIT 1",
        (token["address"],),
    )
    if existing_token:
        token_id = existing_token["id"]
        print(f"  ✓ Token {token['address'][:10]}… already in DB")
    else:
        token_id = uuid.uuid4()
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
                str(token_id), str(issuer_id), token["name"], token["symbol"],
                token["address"], 84532, Decimal(token["totalSupply"]), token["decimals"],
                f"{token['name']} — sandbox E2E test token. {token['symbol']} fixed supply, "
                f"single Seed phase. Mode: {sale_m['mode']}.",
                slugify(token["name"]),
            ),
        )
        print(f"  + Created token row")

    # ── Sale (idempotent) ──
    existing_sale = fetchone(
        conn,
        "SELECT id FROM token_sales WHERE LOWER(contract_address) = LOWER(%s) LIMIT 1",
        (sale_m["address"],),
    )
    if existing_sale:
        sale_id = existing_sale["id"]
        print(f"  ✓ Sale {sale_m['address'][:10]}… already in DB")
    else:
        sale_id = uuid.uuid4()
        sale_start_dt = datetime.fromtimestamp(sale_m["startTime"], tz=timezone.utc)
        sale_end_dt = datetime.fromtimestamp(sale_m["endTime"], tz=timezone.utc)
        slug = f"{slugify(token['symbol'])}-token-sale-{datetime.now().strftime('%Y%m%d-%H%M')}"
        # Total raised in whole-USDC: investor contributed `contributedUsdc / 10^6`
        total_raised_usdc = Decimal(investor_m["contributedUsdc"]) / Decimal(10 ** 6)
        platform_fee = total_raised_usdc * Decimal(manifest["feeBps"]) / Decimal(10000)
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
                %s, %s, 'phase_allocated',
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
                str(sale_id), str(token_id), str(issuer_id),
                f"{token['name']} Token Sale", slug,
                f"Sandbox E2E test sale — {sale_m['mode']} mode "
                + (f"with {sale_m['cliffSeconds']}s cliff and {sale_m['vestingSeconds']}s vesting." if is_vested else "with no vesting (immediate token receipt)."),
                f"{token['name']} is a sandbox-only test token used to validate the platform's "
                f"deploy → buy → "
                + ("claim" if is_vested else "instant receipt")
                + f" lifecycle on Base Sepolia. Mode: {sale_m['mode']}, "
                + (f"linear vesting over {sale_m['vestingSeconds']}s." if is_vested and sale_m["cliffSeconds"] != sale_m["vestingSeconds"]
                   else f"{sale_m['cliffSeconds']}s lock-up." if is_vested
                   else "Direct mode (no vesting)."),
                None,
                sale_m["cliffSeconds"], sale_m["vestingSeconds"],
                "USDC",
                Decimal(sale_m["softCap"]) / Decimal(10 ** 6),
                Decimal(sale_m["hardCap"]) / Decimal(10 ** 6),
                Decimal(sale_m["totalTokenSupply"]) / Decimal(10 ** token["decimals"]),
                Decimal("50000"),
                sale_m["address"], sale_end_dt,
                manifest["feeBps"],
                "vested" if is_vested else "direct",
                vault_addr, fraction_addr,
                sale_start_dt, sale_end_dt,
                sale_start_dt, sale_start_dt,
                total_raised_usdc, total_raised_usdc, platform_fee,
            ),
        )
        print(f"  + Created token_sale row (status=finalized_success, raised={total_raised_usdc})")

    # ── Phase (idempotent) ──
    existing_phase = fetchone(
        conn,
        "SELECT id FROM sale_phases WHERE sale_id = %s AND phase_number = 0 LIMIT 1",
        (str(sale_id),),
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
                0, 0, 0,
                %s, %s, %s,
                'fixed',
                %s, %s, FALSE, TRUE,
                0,
                NOW(), NOW()
            )
            """,
            (
                str(phase_id), str(sale_id), phase["name"],
                Decimal(phase["pricePerToken"]) / Decimal(10 ** 6),
                Decimal(phase["allocation"]) / Decimal(10 ** token["decimals"]),
                Decimal(phase["minTokens"]),
                Decimal(phase["maxTokens"]),
                Decimal(phase["topUpMinTokens"]),
                phase_start_dt, phase_end_dt,
            ),
        )
        print(f"  + Created sale_phase 0 ({phase['name']})")

    # ── Contributions (one per buy chunk) ──
    # All chunks default to status="claimed" for Direct (auto-released) and
    # for Vested when claim hashes are present (fully released by end of test).
    decimals = token["decimals"]
    price_whole = Decimal(phase["pricePerToken"]) / Decimal(10 ** 6)
    chunk_qtys: dict[str, Decimal] = {}
    for tx_h, qty in zip(investor_m["buyTxHashes"], _chunks_for(token["symbol"])):
        chunk_qtys[tx_h] = qty

    final_claim_tx = None
    if investor_m.get("claimTxHashes"):
        final_claim_tx = investor_m["claimTxHashes"][-1]

    contrib_status = "claimed"
    inserted_contribs = 0
    for tx_h, qty in chunk_qtys.items():
        existing = fetchone(conn, "SELECT id FROM contributions WHERE tx_hash = %s LIMIT 1", (tx_h,))
        if existing:
            continue
        usdc_amount = qty * price_whole
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
                %s, %s, %s, %s,
                FALSE, %s, 0,
                NOW(), NOW()
            )
            """,
            (
                str(uuid.uuid4()), str(investor_user_id), str(sale_id), str(phase_id),
                usdc_amount, usdc_amount, qty,
                tx_h, contrib_status, datetime.now(timezone.utc), final_claim_tx,
                investor_m["wallet"],
            ),
        )
        inserted_contribs += 1
    print(f"  + {inserted_contribs} contribution rows")

    # ── Vesting schedule (only for Vested mode) ──
    if is_vested:
        existing_vs = fetchone(
            conn,
            "SELECT id FROM vesting_schedules WHERE token_id = %s AND user_id = %s LIMIT 1",
            (str(token_id), str(investor_user_id)),
        )
        if existing_vs:
            print(f"  ✓ Vesting schedule already exists")
        else:
            sale_end_dt = datetime.fromtimestamp(sale_m["endTime"], tz=timezone.utc)
            cliff_end = sale_end_dt + timedelta(seconds=sale_m["cliffSeconds"])
            vesting_end = sale_end_dt + timedelta(seconds=sale_m["vestingSeconds"])
            tokens_held = Decimal(investor_m["tokensHeld"]) / Decimal(10 ** decimals)
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
                    str(uuid.uuid4()), str(token_id), str(investor_user_id),
                    tokens_held, tokens_held,    # claimed_amount = total (we ran the full claim flow)
                    cliff_end, vesting_end, datetime.now(timezone.utc),
                ),
            )
            print(f"  + Vesting schedule (cliff={sale_m['cliffSeconds']}s vesting={sale_m['vestingSeconds']}s, claimed in full)")

    return True


def _chunks_for(symbol: str) -> list[Decimal]:
    """Buy chunk sizes per sale — must match what sandbox-multi-sale.ts uses."""
    if symbol == "TIN":
        return [Decimal(50), Decimal(100), Decimal(25)]
    if symbol == "SILVER":
        return [Decimal(100), Decimal(50), Decimal(30)]
    if symbol == "AGENT":
        return [Decimal(100), Decimal(200), Decimal(50)]
    raise SystemExit(f"Unknown token symbol {symbol} — extend _chunks_for()")


def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("DATABASE_URL not set")
    if db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    args = sys.argv[1:]
    if not args:
        # Seed both: latest tin-direct.*.json + silver-vested.*.json
        paths = [p for p in (latest("tin-direct"), latest("silver-vested")) if p]
        if not paths:
            sys.exit("No tin-direct.*.json or silver-vested.*.json found")
    else:
        paths = [Path(a) for a in args]

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    try:
        ok_count = 0
        for p in paths:
            if seed_one(conn, p):
                ok_count += 1
        conn.commit()
        print(f"\n✓ Committed seed for {ok_count}/{len(paths)} manifests.")
    except Exception as e:
        conn.rollback()
        print(f"\n✗ Rolled back: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
