#!/usr/bin/env bash
# Cireta E2E Test Suite
set -uo pipefail
BASE="http://localhost:8000/api/v1"
PASS=0; FAIL=0

tc() {
  local id="$1" desc="$2" expected="$3"; shift 3
  local status body
  status=$(curl -sL -o /tmp/cireta-body -w '%{http_code}' "$@" 2>/dev/null)
  body=$(cat /tmp/cireta-body 2>/dev/null || echo "")
  if [ "$status" = "$expected" ]; then
    PASS=$((PASS+1))
    printf "✅ %-8s %-55s [%s]\n" "$id" "$desc" "$status"
  else
    FAIL=$((FAIL+1))
    printf "❌ %-8s %-55s [exp %s → got %s]\n" "$id" "$desc" "$expected" "$status"
    printf "         %s\n" "$(echo "$body" | head -c 150)"
  fi
  echo "$body" > /tmp/cireta-last
}

login() {
  local email="$1" pass="$2"
  local resp token
  for i in 1 2 3 4 5; do
    resp=$(curl -s "$BASE/auth/login" -H "Content-Type: application/json" \
      -d "{\"email\":\"$email\",\"password\":\"$pass\"}" 2>/dev/null)
    token=$(echo "$resp" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('access_token',''))" 2>/dev/null || true)
    [ -n "$token" ] && echo "$token" && return 0
    sleep $((i*3))
  done
  echo ""
}

echo "============================================"
echo "CIRETA E2E — $(date '+%H:%M:%S %z')"
echo "============================================"

ADMIN_TOKEN=$(login "admin@cireta.io" "Admin123!@#")
ISSUER_TOKEN=$(login "issuer@goldcorp.io" "Issuer123!@#")
ALICE_TOKEN=$(login "alice@investor.io" "Alice123!@#")
BOB_TOKEN=$(login "bob@investor.io" "Bob123!@#")

[ -z "$ADMIN_TOKEN" ] && echo "FATAL: No admin token" && exit 1
[ -z "$ISSUER_TOKEN" ] && echo "FATAL: No issuer token" && exit 1
echo "Auth tokens: ✓"
echo ""

# ── HEALTH ──
echo "── HEALTH ──"
tc H1 "GET /health/ready" 200 "$BASE/health/ready"
tc H2 "GET /health/worker" 200 "$BASE/health/worker"
tc H3 "GET /health/live"  200 "$BASE/health/live"
echo ""

# ── AUTH ──
echo "── AUTH ──"
tc A1 "Login valid"          200 -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@cireta.io","password":"Admin123!@#"}'
sleep 1
tc A2 "Login wrong password" 401 -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@cireta.io","password":"wrong"}'
sleep 1
tc A3 "Login unknown email"  401 -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"nobody@x.io","password":"x"}'
sleep 1
tc A4 "Login empty body"     422 -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{}'
tc A5 "Register duplicate"   409 -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d '{"email":"admin@cireta.io","password":"Admin123!@#"}'
sleep 1
tc A6 "Forgot password"      200 -X POST "$BASE/auth/forgot-password" -H "Content-Type: application/json" -d '{"email":"admin@cireta.io"}'
tc A7 "Forgot unknown"       200 -X POST "$BASE/auth/forgot-password" -H "Content-Type: application/json" -d '{"email":"nobody@x.io"}'
tc A8 "GET /auth/me authed"  200 "$BASE/auth/me" -H "Authorization: Bearer $ADMIN_TOKEN"
tc A9 "GET /auth/me no auth" 401 "$BASE/auth/me"
tc A10 "GET /auth/me bad tok" 401 "$BASE/auth/me" -H "Authorization: Bearer invalid"
echo ""

# ── TOKENS ──
echo "── TOKENS ──"
tc T1 "List tokens" 200 "$BASE/tokens/" -H "Authorization: Bearer $ISSUER_TOKEN"
tc T2 "Create token" 201 \
  -X POST "$BASE/tokens/" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Gold Token","symbol":"TGLD","asset_type":"commodity","total_supply":500000,"decimals":18}'
TOKEN_ID=$(python3 -c "import json; print(json.load(open('/tmp/cireta-last'))['id'])" 2>/dev/null || echo "00000000-0000-0000-0000-000000000001")
TOKEN_SLUG=$(python3 -c "import json; print(json.load(open('/tmp/cireta-last')).get('slug','test-gold-token'))" 2>/dev/null || echo "test-gold-token")
tc T3 "Get token"             200 "$BASE/tokens/$TOKEN_ID" -H "Authorization: Bearer $ISSUER_TOKEN"
tc T4 "Create missing → 422"  422 -X POST "$BASE/tokens/" -H "Authorization: Bearer $ISSUER_TOKEN" -H "Content-Type: application/json" -d '{"symbol":"X"}'
tc T5 "Get nonexistent → 404" 404 "$BASE/tokens/00000000-0000-0000-0000-000000000001" -H "Authorization: Bearer $ISSUER_TOKEN"
tc T6 "Create as investor → 403" 403 \
  -X POST "$BASE/tokens/" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Fail","symbol":"FAIL","asset_type":"commodity","total_supply":100,"decimals":18}'
tc T7 "Deploy token" 200 \
  -X POST "$BASE/tokens/$TOKEN_ID/deploy" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json"
tc T8 "Proof of reserve" 200 "$BASE/tokens/$TOKEN_ID/por"
tc T9 "List documents"   200 "$BASE/tokens/$TOKEN_ID/documents" -H "Authorization: Bearer $ISSUER_TOKEN"
tc T10 "Upload doc no name → 422" 422 \
  -X POST "$BASE/tokens/$TOKEN_ID/documents" \
  -H "Authorization: Bearer $ISSUER_TOKEN"
echo ""

# ── SALES ──
echo "── SALES ──"
tc S1 "List sales" 200 "$BASE/sales/" -H "Authorization: Bearer $ISSUER_TOKEN"
tc S2 "Create sale" 201 \
  -X POST "$BASE/sales/" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"token_id\":\"$TOKEN_ID\",\"payment_token\":\"0x036CbD53842c5426634e7929541eC2318f3dCF7e\",\"soft_cap\":\"50000\",\"hard_cap\":\"100000\",\"phases\":[{\"name\":\"Seed\",\"allocation\":500000,\"price_per_token\":\"1.50\",\"start_time\":\"2026-04-01T00:00:00Z\",\"end_time\":\"2026-04-30T00:00:00Z\"}]}"
SALE_ID=$(python3 -c "import json; print(json.load(open('/tmp/cireta-last'))['id'])" 2>/dev/null || echo "00000000-0000-0000-0000-000000000001")
tc S3 "Get sale"              200 "$BASE/sales/$SALE_ID" -H "Authorization: Bearer $ISSUER_TOKEN"
tc S4 "Get by slug"           200 "$BASE/sales/by-slug/$TOKEN_SLUG" -H "Authorization: Bearer $ISSUER_TOKEN"
tc S5 "Get nonexistent → 404" 404 "$BASE/sales/00000000-0000-0000-0000-000000000001"
tc S6 "Create as investor → 403" 403 \
  -X POST "$BASE/sales/" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"token_id\":\"$TOKEN_ID\",\"payment_token\":\"0x036CbD53842c5426634e7929541eC2318f3dCF7e\",\"soft_cap\":\"1000\",\"hard_cap\":\"2000\",\"phases\":[{\"name\":\"A\",\"allocation\":100,\"price_per_token\":\"1\",\"start_time\":\"2026-04-01T00:00:00Z\",\"end_time\":\"2026-04-30T00:00:00Z\"}]}"
tc S8  "Deploy sale"            200 \
  -X POST "$BASE/sales/$SALE_ID/deploy" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sale_id\":\"$SALE_ID\",\"identity_registry\":\"0xFEe7c667db9b54767A8772dcBC81a9d177C0954E\",\"fee_basis_points\":250}"
tc S7  "On-chain status"        200 "$BASE/sales/$SALE_ID/on-chain" -H "Authorization: Bearer $ISSUER_TOKEN"
tc S9  "Contribute no auth → 401" 401 \
  -X POST "$BASE/sales/$SALE_ID/contribute" \
  -H "Content-Type: application/json" \
  -d '{"amount":"100","tx_hash":"0x0000000000000000000000000000000000000000000000000000000000000002"}'
tc S10 "Contribute no KYC → 403" 403 \
  -X POST "$BASE/sales/$SALE_ID/contribute" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":"100","tx_hash":"0x0000000000000000000000000000000000000000000000000000000000000003"}'
tc S11 "Finalize not active → 400" 400 \
  -X POST "$BASE/sales/$SALE_ID/finalize" \
  -H "Authorization: Bearer $ISSUER_TOKEN"
tc S12 "OTC allocate" 200 \
  -X POST "$BASE/sales/$SALE_ID/otc" \
  -H "Authorization: Bearer $ISSUER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"investor_wallet":"0xBE84C7a8f44F673173d51C0A212C9C66267066A0","token_amount":100,"payment_reference":"wire-001"}'
tc S13 "Claim no contrib → 404" 404 \
  -X POST "$BASE/sales/$SALE_ID/claim" \
  -H "Authorization: Bearer $ALICE_TOKEN"
tc S14 "Refund not finalized → 400" 400 \
  -X POST "$BASE/sales/$SALE_ID/refund" \
  -H "Authorization: Bearer $ALICE_TOKEN"
echo ""

# ── KYC ──
echo "── KYC ──"
tc K1 "Alice status"    200 "$BASE/kyc/status" -H "Authorization: Bearer $ALICE_TOKEN"
tc K2 "Bob status"      200 "$BASE/kyc/status" -H "Authorization: Bearer $BOB_TOKEN"
tc K3 "Initiate (bob)"  200 -X POST "$BASE/kyc/initiate" -H "Authorization: Bearer $BOB_TOKEN" -H "Content-Type: application/json" -d '{}'
tc K4 "No auth → 401"   401 "$BASE/kyc/status"
tc K5 "Corporate status" 200 "$BASE/kyc/corporate/status" -H "Authorization: Bearer $ISSUER_TOKEN"
echo ""

# ── WALLETS ──
echo "── WALLETS ──"
tc W1 "List"               200 "$BASE/wallets" -H "Authorization: Bearer $ALICE_TOKEN"
tc W2 "Link no sig → 422"  422 \
  -X POST "$BASE/wallets" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"address":"0xBE84C7a8f44F673173d51C0A212C9C66267066A0"}'
tc W3 "No auth → 401"      401 "$BASE/wallets"
echo ""

# ── PORTFOLIO ──
echo "── PORTFOLIO ──"
tc P1 "Holdings"      200 "$BASE/portfolio/holdings"     -H "Authorization: Bearer $ALICE_TOKEN"
tc P2 "Summary"       200 "$BASE/portfolio/summary"      -H "Authorization: Bearer $ALICE_TOKEN"
tc P3 "Vesting"       200 "$BASE/portfolio/vesting"      -H "Authorization: Bearer $ALICE_TOKEN"
tc P4 "Transactions"  200 "$BASE/portfolio/transactions" -H "Authorization: Bearer $ALICE_TOKEN"
tc P5 "Dividends"     200 "$BASE/portfolio/dividends"    -H "Authorization: Bearer $ALICE_TOKEN"
tc P6 "Redemptions"   200 "$BASE/portfolio/redemptions"  -H "Authorization: Bearer $ALICE_TOKEN"
tc P7 "No auth → 401" 401 "$BASE/portfolio/holdings"
echo ""

# ── ADMIN: COMPLIANCE ──
echo "── ADMIN: COMPLIANCE ──"
tc CO1 "Audit logs"          200 "$BASE/admin/compliance/audit-logs"   -H "Authorization: Bearer $ADMIN_TOKEN"
tc CO2 "Frozen addresses"    200 "$BASE/admin/compliance/frozen"       -H "Authorization: Bearer $ADMIN_TOKEN"
tc CO3 "Recovery logs"       200 "$BASE/admin/compliance/recovery-logs" -H "Authorization: Bearer $ADMIN_TOKEN"
tc CO4 "Freeze no data → 422" 422 \
  -X POST "$BASE/admin/compliance/freeze" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{}'
tc CO5 "Freeze as investor → 403" 403 \
  -X POST "$BASE/admin/compliance/freeze" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"0x1","token_id":"00000000-0000-0000-0000-000000000001","reason":"test"}'
tc CO6 "Audit as investor → 403" 403 "$BASE/admin/compliance/audit-logs" -H "Authorization: Bearer $ALICE_TOKEN"
echo ""

# ── ADMIN: INVESTORS ──
echo "── ADMIN: INVESTORS ──"
tc I1 "List investors"    200 "$BASE/admin/investors/" -H "Authorization: Bearer $ADMIN_TOKEN"
tc I2 "As investor → 403" 403 "$BASE/admin/investors/" -H "Authorization: Bearer $ALICE_TOKEN"
echo ""

# ── ADMIN: ISSUERS ──
echo "── ADMIN: ISSUERS ──"
tc IS1 "List issuers"      200 "$BASE/admin/issuers/" -H "Authorization: Bearer $ADMIN_TOKEN"
tc IS2 "As investor → 403" 403 "$BASE/admin/issuers/" -H "Authorization: Bearer $ALICE_TOKEN"
echo ""

# ── ADMIN: OPERATIONS ──
echo "── ADMIN: OPERATIONS ──"
tc AO1 "List redemptions"   200 "$BASE/admin/redemptions"        -H "Authorization: Bearer $ADMIN_TOKEN"
tc AO2 "List webhooks"      200 "$BASE/admin/webhooks"           -H "Authorization: Bearer $ADMIN_TOKEN"
tc AO3 "List dividends"     200 "$BASE/admin/dividends"          -H "Authorization: Bearer $ADMIN_TOKEN"
tc AO4 "Platform settings"  200 "$BASE/admin/platform/settings" -H "Authorization: Bearer $ADMIN_TOKEN"
tc AO5 "Platform stats"     200 "$BASE/admin/platform/stats"    -H "Authorization: Bearer $ADMIN_TOKEN"
echo ""

# ── NOTIFICATIONS ──
echo "── NOTIFICATIONS ──"
tc N1 "List"         200 "$BASE/notifications"              -H "Authorization: Bearer $ALICE_TOKEN"
tc N2 "Unread count" 200 "$BASE/notifications/unread-count" -H "Authorization: Bearer $ALICE_TOKEN"
tc N3 "Preferences"  200 "$BASE/notifications/preferences"  -H "Authorization: Bearer $ALICE_TOKEN"
tc N4 "Read all"     200 -X PATCH "$BASE/notifications/read-all" -H "Authorization: Bearer $ALICE_TOKEN"
tc N5 "No auth → 401" 401 "$BASE/notifications"
echo ""

# ── ISSUER WITHDRAWALS ──
echo "── ISSUER WITHDRAWALS ──"
tc IW1 "List withdrawals"  200 "$BASE/issuer/withdrawals/" -H "Authorization: Bearer $ISSUER_TOKEN"
tc IW2 "As investor → 403" 403 "$BASE/issuer/withdrawals/" -H "Authorization: Bearer $ALICE_TOKEN"
echo ""

# ── MFA ──
echo "── MFA ──"
tc M1 "Setup"          200 -X POST "$BASE/auth/mfa/setup" -H "Authorization: Bearer $ALICE_TOKEN"
tc M2 "Verify no code" 422 \
  -X POST "$BASE/auth/mfa/verify" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" -d '{}'
echo ""

# ── RBAC MATRIX ──
echo "── RBAC MATRIX ──"
tc R1 "Investor → freeze → 403" 403 \
  -X POST "$BASE/admin/compliance/freeze" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"0x1","token_id":"00000000-0000-0000-0000-000000000001","reason":"x"}'
tc R2 "Investor → audit → 403"    403 "$BASE/admin/compliance/audit-logs" -H "Authorization: Bearer $ALICE_TOKEN"
tc R3 "Investor → investors → 403" 403 "$BASE/admin/investors/" -H "Authorization: Bearer $ALICE_TOKEN"
tc R4 "Investor → issuers → 403"   403 "$BASE/admin/issuers/"   -H "Authorization: Bearer $ALICE_TOKEN"
tc R5 "Investor → settings → 403"  403 "$BASE/admin/platform/settings" -H "Authorization: Bearer $ALICE_TOKEN"
tc R6 "Investor → create token → 403" 403 \
  -X POST "$BASE/tokens/" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"X","symbol":"XFAIL","asset_type":"commodity","total_supply":1,"decimals":18}'
tc R7 "Investor → create sale → 403" 403 \
  -X POST "$BASE/sales/" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"token_id\":\"$TOKEN_ID\",\"payment_token\":\"0x036CbD53842c5426634e7929541eC2318f3dCF7e\",\"soft_cap\":\"1\",\"hard_cap\":\"2\",\"phases\":[{\"name\":\"A\",\"allocation\":1,\"price_per_token\":\"1\",\"start_time\":\"2026-04-01T00:00:00Z\",\"end_time\":\"2026-04-30T00:00:00Z\"}]}"
tc R8 "Issuer → settings → 403"  403 "$BASE/admin/platform/settings" -H "Authorization: Bearer $ISSUER_TOKEN"
tc R9 "Issuer → issuers → 403"   403 "$BASE/admin/issuers/"          -H "Authorization: Bearer $ISSUER_TOKEN"
echo ""

echo "============================================"
echo "PASS: $PASS | FAIL: $FAIL | TOTAL: $((PASS+FAIL))"
[[ $((PASS+FAIL)) -gt 0 ]] && echo "Rate: $(echo "scale=1; $PASS * 100 / ($PASS + $FAIL)" | bc)%"
echo "============================================"
