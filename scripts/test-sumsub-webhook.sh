#!/usr/bin/env bash
#
# Simulate a Sumsub KYC webhook locally.
#
# Usage:
#   ./scripts/test-sumsub-webhook.sh <user_email> [GREEN|RED]
#
# Example:
#   ./scripts/test-sumsub-webhook.sh investor@cireta.com GREEN
#
# Prerequisites:
#   - API running on :3010
#   - .env has SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY
#   - User must exist and have initiated KYC (or use dev-approve first)
#
# What it does:
#   1. Looks up the user by email via admin API
#   2. Builds a Sumsub webhook payload (applicantReviewed)
#   3. Signs it with HMAC-SHA256 using SUMSUB_SECRET_KEY
#   4. POSTs to /api/v1/kyc/webhook with proper headers
#   5. The backend will: approve/reject KYC, register wallets on-chain, send notifications

set -euo pipefail

API="http://localhost:3010/api/v1"
EMAIL="${1:?Usage: $0 <user_email> [GREEN|RED]}"
ANSWER="${2:-GREEN}"

# Load env
if [ -f .env ]; then
  export $(grep -E '^(SUMSUB_APP_TOKEN|SUMSUB_SECRET_KEY)=' .env | xargs)
fi

if [ -z "${SUMSUB_APP_TOKEN:-}" ] || [ -z "${SUMSUB_SECRET_KEY:-}" ]; then
  echo "ERROR: SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY must be set in .env"
  exit 1
fi

echo "=== Sumsub Webhook Test ==="
echo "Email:  $EMAIL"
echo "Answer: $ANSWER"
echo ""

# Step 1: Get admin token
echo "[1/4] Getting admin token..."
OTP_RES=$(curl -s "$API/auth/otp/request" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cireta.com","purpose":"login","audience":"admin"}')
DEV_OTP=$(echo "$OTP_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('dev_otp',''))" 2>/dev/null)

if [ -z "$DEV_OTP" ]; then
  echo "ERROR: Could not get admin OTP. Is the API running? Response: $OTP_RES"
  exit 1
fi

VERIFY_RES=$(curl -s "$API/auth/otp/verify" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@cireta.com\",\"code\":\"$DEV_OTP\",\"purpose\":\"login\"}")
ADMIN_TOKEN=$(echo "$VERIFY_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "ERROR: Could not get admin token. Response: $VERIFY_RES"
  exit 1
fi
echo "  Admin token acquired."

# Step 2: Find user by email
echo "[2/4] Looking up user: $EMAIL ..."
USER_RES=$(curl -s "$API/admin/investors/?search=$EMAIL" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
USER_ID=$(echo "$USER_RES" | python3 -c "
import sys, json
data = json.load(sys.stdin)
items = data.get('items', [])
for u in items:
    if u.get('email') == '$EMAIL':
        print(u['id'])
        break
" 2>/dev/null)

if [ -z "$USER_ID" ]; then
  echo "ERROR: User not found: $EMAIL"
  echo "  Response: $(echo "$USER_RES" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(f"Found {d.get(\"total\",0)} users")' 2>/dev/null)"
  exit 1
fi
echo "  User ID: $USER_ID"

# Step 3: Build webhook payload
APPLICANT_ID="test_$(date +%s)"
PAYLOAD=$(cat <<ENDJSON
{
  "applicantId": "$APPLICANT_ID",
  "inspectionId": "test_inspection_$(date +%s)",
  "correlationId": "test_corr_$(date +%s)",
  "externalUserId": "$USER_ID",
  "type": "applicantReviewed",
  "reviewStatus": "completed",
  "reviewResult": {
    "reviewAnswer": "$ANSWER",
    "moderationComment": "Test webhook from scripts/test-sumsub-webhook.sh",
    "clientComment": "",
    "rejectLabels": []
  },
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
}
ENDJSON
)

echo "[3/4] Payload built (applicantId: $APPLICANT_ID)"

# Step 4: Sign and send
echo "[4/4] Signing with HMAC-SHA256 and sending webhook..."

# Compute HMAC-SHA256 signature
SIGNATURE=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$SUMSUB_SECRET_KEY" | awk '{print $NF}')

RESPONSE=$(curl -s -w "\n%{http_code}" "$API/kyc/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Payload-Digest: $SIGNATURE" \
  -H "X-App-Token: $SUMSUB_APP_TOKEN" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo ""
echo "=== Result ==="
echo "HTTP Status: $HTTP_CODE"
echo "Response:    $BODY"

if [ "$HTTP_CODE" = "200" ]; then
  echo ""
  echo "Webhook processed. Check:"
  echo "  - User KYC status: curl -s $API/admin/investors/$USER_ID -H 'Authorization: Bearer ...' | jq .kyc_status"
  echo "  - Wallets registered: curl -s $API/admin/investors/$USER_ID -H 'Authorization: Bearer ...' | jq '.wallets[].registered_on_chain'"
  echo "  - Audit logs: curl -s $API/admin/audit-logs?target_id=$USER_ID -H 'Authorization: Bearer ...'"
  echo "  - Notifications: check email (or dev console) for KYC $([ "$ANSWER" = "GREEN" ] && echo "approval" || echo "rejection") notification"
else
  echo ""
  echo "ERROR: Webhook failed. Check API logs for details."
fi
