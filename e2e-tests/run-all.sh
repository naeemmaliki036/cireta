#!/bin/bash
set -uo pipefail
API="http://localhost:8000/api/v1"
PASS=0; FAIL=0; REPORT=""

tc() {
  local section="$1" id="$2" desc="$3" method="$4" url="$5" token="${6:-}" body="${7:-}" expected="${8:-200}"
  local args=(-s -L -o /tmp/e2e_body -w "%{http_code}" -X "$method" -H "Content-Type: application/json")
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$body" ]] && args+=(-d "$body")
  local status=$(curl "${args[@]}" "$url" 2>/dev/null || echo "000")
  local resp=$(cat /tmp/e2e_body 2>/dev/null | head -c 200)
  if [[ "$status" == "$expected" ]]; then
    printf "✅ %-7s %-55s [%s]\n" "$id" "$desc" "$status"
    PASS=$((PASS+1))
  else
    printf "❌ %-7s %-55s [exp %s → got %s]\n" "$id" "$desc" "$expected" "$status"
    printf "         %s\n" "${resp:0:120}"
    FAIL=$((FAIL+1))
  fi
  REPORT+="$([ "$status" = "$expected" ] && echo PASS || echo FAIL)|$id|$desc|exp=$expected|got=$status\n"
}

echo "============================================"
echo "CIRETA E2E — $(date '+%H:%M:%S %Z')"
echo "============================================"

# TOKENS
get_token() { curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null; }
ADMIN=$(get_token admin@cireta.io "Admin123!@#")
ISSUER=$(get_token issuer@goldcorp.io "Issuer123!@#")
ALICE=$(get_token alice@investor.io "Alice123!@#")
BOB=$(get_token bob@investor.io "Bob123!@#")
echo "Auth tokens: ✓"

echo -e "\n── HEALTH ──"
tc Health H1 "GET /health/ready" GET "$API/health/ready"
tc Health H2 "GET /health/worker" GET "$API/health/worker"
tc Health H3 "GET /health/live" GET "$API/health/live"

echo -e "\n── AUTH ──"
tc Auth A1 "Login valid" POST "$API/auth/login" "" '{"email":"admin@cireta.io","password":"Admin123!@#"}'
tc Auth A2 "Login wrong password" POST "$API/auth/login" "" '{"email":"admin@cireta.io","password":"wrong"}' "" "" "401"
tc Auth A3 "Login unknown email" POST "$API/auth/login" "" '{"email":"nope@x.io","password":"x"}' "" "" "401"
tc Auth A4 "Login empty body" POST "$API/auth/login" "" '{}' "" "" "422"
tc Auth A5 "Register duplicate" POST "$API/auth/register" "" '{"email":"admin@cireta.io","password":"Test123!"}' "" "" "409"
tc Auth A6 "Forgot password" POST "$API/auth/forgot-password" "" '{"email":"admin@cireta.io"}'
tc Auth A7 "Forgot unknown (no leak)" POST "$API/auth/forgot-password" "" '{"email":"x@x.io"}'
tc Auth A8 "GET /auth/me authed" GET "$API/auth/me" "$ADMIN"
tc Auth A9 "GET /auth/me no token" GET "$API/auth/me" "" "" "401"
tc Auth A10 "GET /auth/me bad token" GET "$API/auth/me" "garbage" "" "" "401"

echo -e "\n── TOKENS ──"
tc Token T1 "List tokens (empty)" GET "$API/tokens" "$ISSUER"
tc Token T2 "Create WGOLD" POST "$API/tokens" "$ISSUER" '{"name":"Wassa Gold Token","symbol":"WGOLD","decimals":18,"asset_type":"commodity","total_supply":1000000,"description":"Gold backed"}' "" "" "201"
TID=$(curl -s -L "$API/tokens" -H "Authorization: Bearer $ISSUER" | python3 -c "import sys,json; d=json.load(sys.stdin); i=d if isinstance(d,list) else d.get('items',[]); print(i[0]['id'] if i else '')" 2>/dev/null)
echo "   Token ID: ${TID:0:12}..."
tc Token T3 "Get token" GET "$API/tokens/$TID" "$ISSUER"
tc Token T4 "Create missing fields → 422" POST "$API/tokens" "$ISSUER" '{"symbol":"X"}' "" "" "422"
tc Token T5 "Get nonexistent → 404" GET "$API/tokens/00000000-0000-0000-0000-000000000000" "$ISSUER" "" "404"
tc Token T6 "Create as investor → 403" POST "$API/tokens" "$ALICE" '{"name":"X","symbol":"X","decimals":18,"asset_type":"commodity","total_supply":1}' "" "" "403"
tc Token T7 "Deploy token" POST "$API/tokens/$TID/deploy" "$ISSUER"
tc Token T8 "Proof of reserve" GET "$API/tokens/$TID/por" "$ISSUER"
tc Token T9 "List documents" GET "$API/tokens/$TID/documents" "$ISSUER"
tc Token T10 "Upload doc (no file) → 422" POST "$API/tokens/$TID/documents" "$ISSUER" '{}' "" "" "422"

echo -e "\n── SALES ──"
tc Sale S1 "List sales (empty)" GET "$API/sales" "$ISSUER"
tc Sale S2 "Create sale" POST "$API/sales" "$ISSUER" "{\"token_id\":\"$TID\",\"payment_token_address\":\"0x036CbD53842c5426634e7929541eC2318f3dCF7e\",\"soft_cap\":50,\"hard_cap\":500,\"sale_mode\":\"direct\",\"slug\":\"wgold-sale\",\"phases\":[{\"name\":\"Seed\",\"price\":\"0.5\",\"allocation\":500,\"min_contribution\":5,\"max_contribution\":100}]}" "" "" "201"
SID=$(curl -s -L "$API/sales" -H "Authorization: Bearer $ISSUER" | python3 -c "import sys,json; d=json.load(sys.stdin); i=d if isinstance(d,list) else d.get('items',[]); print(i[0]['id'] if i else '')" 2>/dev/null)
echo "   Sale ID: ${SID:0:12}..."
tc Sale S3 "Get sale" GET "$API/sales/$SID" "$ISSUER"
tc Sale S4 "Get by slug" GET "$API/sales/by-slug/wgold-sale" "$ISSUER"
tc Sale S5 "Get nonexistent → 404" GET "$API/sales/00000000-0000-0000-0000-000000000000" "$ISSUER" "" "404"
tc Sale S6 "Create as investor → 403" POST "$API/sales" "$ALICE" "{\"token_id\":\"$TID\",\"soft_cap\":50,\"hard_cap\":500,\"sale_mode\":\"direct\",\"slug\":\"bad\",\"phases\":[]}" "" "" "403"
tc Sale S7 "On-chain status" GET "$API/sales/$SID/on-chain" "$ISSUER"
tc Sale S8 "Deploy sale" POST "$API/sales/$SID/deploy" "$ISSUER"
tc Sale S9 "Contribute no auth → 401" POST "$API/sales/$SID/contribute" "" '{"amount":10}' "" "" "401"
tc Sale S10 "Contribute bob (no KYC) → 403" POST "$API/sales/$SID/contribute" "$BOB" '{"amount":10,"wallet_address":"0xBE84C7a8f44F673173d51C0A212C9C66267066A0"}' "" "" "403"
tc Sale S11 "Finalize (not active) → 400" POST "$API/sales/$SID/finalize" "$ISSUER" "" "" "" "400"
tc Sale S12 "OTC allocate" POST "$API/sales/$SID/otc" "$ISSUER" '{"wallet_address":"0x1234567890abcdef1234567890abcdef12345678","amount":10}'
tc Sale S13 "Claim (no contribution) → 400" POST "$API/sales/$SID/claim" "$ALICE" "" "" "" "400"
tc Sale S14 "Refund (sale active) → 400" POST "$API/sales/$SID/refund" "$ALICE" "" "" "" "400"

echo -e "\n── KYC ──"
tc KYC K1 "Alice status (approved)" GET "$API/kyc/status" "$ALICE"
tc KYC K2 "Bob status" GET "$API/kyc/status" "$BOB"
tc KYC K3 "Initiate (bob)" POST "$API/kyc/initiate" "$BOB"
tc KYC K4 "No auth → 401" GET "$API/kyc/status" "" "" "401"
tc KYC K5 "Corporate status" GET "$API/kyc/corporate/status" "$ALICE"

echo -e "\n── WALLETS ──"
tc Wallet W1 "List (empty)" GET "$API/wallets" "$ALICE"
# Wallet link needs signature+message — skip for now, test the validation
tc Wallet W2 "Link missing signature → 422" POST "$API/wallets" "$ALICE" '{"address":"0xBE84C7a8f44F673173d51C0A212C9C66267066A0"}' "" "" "422"
tc Wallet W3 "No auth → 401" GET "$API/wallets" "" "" "401"

echo -e "\n── PORTFOLIO ──"
tc Portfolio P1 "Holdings" GET "$API/portfolio/holdings" "$ALICE"
tc Portfolio P2 "Summary" GET "$API/portfolio/summary" "$ALICE"
tc Portfolio P3 "Vesting" GET "$API/portfolio/vesting" "$ALICE"
tc Portfolio P4 "Transactions" GET "$API/portfolio/transactions" "$ALICE"
tc Portfolio P5 "Dividends" GET "$API/portfolio/dividends" "$ALICE"
tc Portfolio P6 "Redemptions" GET "$API/portfolio/redemptions" "$ALICE"
tc Portfolio P7 "No auth → 401" GET "$API/portfolio/holdings" "" "" "401"

echo -e "\n── ADMIN: COMPLIANCE ──"
tc Compliance CO1 "Audit logs" GET "$API/admin/compliance/audit-logs" "$ADMIN"
tc Compliance CO2 "Frozen addresses" GET "$API/admin/compliance/frozen" "$ADMIN"
tc Compliance CO3 "Recovery logs" GET "$API/admin/compliance/recovery-logs" "$ADMIN"
tc Compliance CO4 "Freeze missing data → 422" POST "$API/admin/compliance/freeze" "$ADMIN" '{}' "" "" "422"
tc Compliance CO5 "Freeze as investor → 403" POST "$API/admin/compliance/freeze" "$ALICE" '{"address":"0x1","token_id":"00000000-0000-0000-0000-000000000000"}' "" "" "403"
tc Compliance CO6 "Audit logs as investor → 403" GET "$API/admin/compliance/audit-logs" "$ALICE" "" "403"

echo -e "\n── ADMIN: INVESTORS ──"
tc Investors I1 "List investors" GET "$API/admin/investors" "$ADMIN"
tc Investors I2 "As investor → 403" GET "$API/admin/investors" "$ALICE" "" "403"

echo -e "\n── ADMIN: ISSUERS ──"
tc Issuers IS1 "List issuers" GET "$API/admin/issuers" "$ADMIN"
tc Issuers IS2 "As investor → 403" GET "$API/admin/issuers" "$ALICE" "" "403"

echo -e "\n── ADMIN: OPERATIONS ──"
tc AdminOps AO1 "List redemptions" GET "$API/admin/redemptions" "$ADMIN"
tc AdminOps AO2 "List webhooks" GET "$API/admin/webhooks" "$ADMIN"
tc AdminOps AO3 "List dividends" GET "$API/admin/dividends" "$ADMIN"
tc AdminOps AO4 "Platform settings" GET "$API/admin/platform/settings" "$ADMIN"

echo -e "\n── NOTIFICATIONS ──"
tc Notif N1 "List" GET "$API/notifications" "$ALICE"
tc Notif N2 "Unread count" GET "$API/notifications/unread-count" "$ALICE"
tc Notif N3 "Preferences" GET "$API/notifications/preferences" "$ALICE"
tc Notif N4 "Read all" PATCH "$API/notifications/read-all" "$ALICE"
tc Notif N5 "No auth → 401" GET "$API/notifications" "" "" "401"

echo -e "\n── ISSUER: WITHDRAWALS ──"
tc Withdraw IW1 "List withdrawals" GET "$API/issuer/withdrawals" "$ISSUER"
tc Withdraw IW2 "As investor → 403" GET "$API/issuer/withdrawals" "$ALICE" "" "403"

echo -e "\n── MFA ──"
tc MFA M1 "Setup" POST "$API/auth/mfa/setup" "$ADMIN"
tc MFA M2 "Verify no code → 422" POST "$API/auth/mfa/verify" "$ADMIN" '{}' "" "" "422"

echo -e "\n── RBAC MATRIX ──"
tc RBAC R1 "Investor → freeze → 403" POST "$API/admin/compliance/freeze" "$ALICE" '{"address":"0x1","token_id":"00000000-0000-0000-0000-000000000000"}' "" "" "403"
tc RBAC R2 "Investor → audit logs → 403" GET "$API/admin/compliance/audit-logs" "$ALICE" "" "403"
tc RBAC R3 "Investor → investors → 403" GET "$API/admin/investors" "$ALICE" "" "403"
tc RBAC R4 "Investor → issuers → 403" GET "$API/admin/issuers" "$ALICE" "" "403"
tc RBAC R5 "Investor → platform settings → 403" GET "$API/admin/platform/settings" "$ALICE" "" "403"
tc RBAC R6 "Investor → create token → 403" POST "$API/tokens" "$ALICE" '{"name":"X","symbol":"X","decimals":18,"asset_type":"commodity","total_supply":1}' "" "" "403"
tc RBAC R7 "Investor → create sale → 403" POST "$API/sales" "$ALICE" "{\"token_id\":\"$TID\",\"soft_cap\":50,\"hard_cap\":500,\"sale_mode\":\"direct\",\"slug\":\"x\",\"phases\":[]}" "" "" "403"
tc RBAC R8 "Issuer → platform settings → 403" GET "$API/admin/platform/settings" "$ISSUER" "" "403"
tc RBAC R9 "Issuer → issuers list → 403" GET "$API/admin/issuers" "$ISSUER" "" "403"

echo -e "\n============================================"
echo "PASS: $PASS | FAIL: $FAIL | TOTAL: $((PASS+FAIL))"
[[ $((PASS+FAIL)) -gt 0 ]] && echo "Rate: $(echo "scale=1; $PASS * 100 / ($PASS + $FAIL)" | bc)%"
echo "============================================"
echo -e "$REPORT" > e2e-tests/results.txt
