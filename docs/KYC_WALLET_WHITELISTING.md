# KYC & Wallet Whitelisting — Complete Flow

## Overview

```
User verifies → Sumsub reviews → Webhook fires → KYC approved → Wallets whitelisted on-chain
```

---

## 1. Configure Sumsub Webhook

In your **Sumsub dashboard** (dashboard.sumsub.com):

1. Go to **Developers** → **Webhooks**
2. Set webhook URL: `https://api-keeta.up.railway.app/api/v1/kyc/webhook`
3. Events to subscribe: `applicantReviewed`
4. Copy the **Secret Key** — used for HMAC validation

Set these env vars on the **API Railway service**:
```
SUMSUB_APP_TOKEN=<your Sumsub app token>
SUMSUB_SECRET_KEY=<the webhook secret key>
```

### HMAC Validation

- Sumsub sends `X-Payload-Digest` (HMAC-SHA256) and `X-App-Token` headers
- Backend validates using `hmac.compare_digest()` (constant-time) before processing
- Returns 401 if invalid
- Implementation: `apps/api/core/sumsub_crypto.py`

---

## 2. Deploy SimpleIdentityRegistry Contract

Since the platform uses **simple mode** (default), only one contract is needed:

```bash
cd contracts && npx hardhat run scripts/deploy.ts --network baseSepolia
```

This deploys `SimpleIdentityRegistry` — a whitelist contract that tracks which wallets are verified.

After deployment, set on Railway API:
```
IDENTITY_MODE=simple
IDENTITY_REGISTRY_ADDRESS=<deployed contract address>
IDENTITY_SIGNER_PRIVATE_KEY=<platform deployer/signer private key>
```

### Identity Modes

| Mode | Use Case | Complexity | On-Chain Contracts |
|------|----------|-----------|-------------------|
| **simple** | MVP, whitelist-only | Low | SimpleIdentityRegistry (1 contract) |
| **erc3643** | Full ERC-3643 compliance, claim-based | High | OnchainIDFactory, ONCHAINID (per user), IdentityRegistry, ClaimIssuer |

---

## 3. Environment Variables Checklist

### Always Required
```
DATABASE_URL=
REDIS_URL=
JWT_SECRET_KEY=
ENCRYPTION_KEY=
WEB3_RPC_URL=
CHAIN_ID=84532
```

### For KYC (Sumsub)
```
SUMSUB_APP_TOKEN=<from Sumsub dashboard>
SUMSUB_SECRET_KEY=<from Sumsub dashboard>
```

### For Simple Mode (whitelist)
```
IDENTITY_MODE=simple
IDENTITY_REGISTRY_ADDRESS=<deployed SimpleIdentityRegistry>
IDENTITY_SIGNER_PRIVATE_KEY=<platform signer key>
```

### For ERC-3643 Mode (advanced)
```
IDENTITY_MODE=erc3643
IDENTITY_FACTORY_ADDRESS=<deployed OnchainIDFactory>
IDENTITY_REGISTRY_ADDRESS=<deployed IdentityRegistry>
IDENTITY_SIGNER_PRIVATE_KEY=<platform signer key>
IDENTITY_INIT_CODE_HASH=<keccak256 of init code>
```

---

## 4. Complete User Journey (Simple Mode)

### Frontend Flow

1. User clicks "Verify" → frontend calls `POST /api/v1/kyc/initiate`
2. Backend creates Sumsub applicant + gets access token
3. Sumsub WebSDK loads in browser with the token
4. User completes ID verification + selfie + liveness check

### Backend Flow (on webhook)

5. Sumsub reviews and sends webhook to `POST /api/v1/kyc/webhook`
6. Backend validates HMAC signature
7. Parses payload, looks up user by `applicantId`
8. If `reviewAnswer == "GREEN"`:
   - `user.kyc_status = APPROVED`
   - `user.kyc_level = 2` (personal) or `4` (corporate)
   - `user.kyc_verified_at = now()`
   - Calls `SimpleIdentityBridgeService.provision_identity()`
9. For each linked wallet:
   - Calls `SimpleIdentityRegistry.addToWhitelist(wallet, countryCode)` on-chain
   - Sets `wallet.registered_on_chain = True` in DB
10. Sends KYC approved email notification
11. Writes audit log

### Auto-registration for new wallets

When a KYC-approved user links a new wallet later, `wallet_service._auto_register_identity()` automatically registers it on-chain — no manual intervention needed.

### Webhook Payload Example
```json
{
  "applicantId": "5fcb7e19a5e0ad4f2d34f6eb",
  "externalUserId": "user-uuid",
  "type": "applicantReviewed",
  "reviewStatus": "completed",
  "reviewResult": {
    "reviewAnswer": "GREEN"
  }
}
```

---

## 5. Testing the Flow

### Full E2E Test

1. Register/login as investor on launchpad
2. Link a wallet (Settings → Wallets → sign ownership message)
3. Start KYC (Onboarding → Verification step)
4. Complete Sumsub verification (use test documents in sandbox)
5. Wait for webhook (usually minutes in sandbox)
6. Verify: user `kyc_status = approved` in DB
7. Verify on-chain: `SimpleIdentityRegistry.isWhitelisted(walletAddress)` returns `true`
8. User can now invest in token sales

### Manual Webhook Test

To test the webhook → whitelist flow without waiting for Sumsub:

```bash
# Generate HMAC
BODY='{"applicantId":"<sumsub_id>","type":"applicantReviewed","reviewStatus":"completed","reviewResult":{"reviewAnswer":"GREEN"}}'
HMAC=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "<SUMSUB_SECRET_KEY>" | awk '{print $2}')

# Send webhook
curl -X POST https://api-keeta.up.railway.app/api/v1/kyc/webhook \
  -H "Content-Type: application/json" \
  -H "X-Payload-Digest: $HMAC" \
  -H "X-App-Token: <SUMSUB_APP_TOKEN>" \
  -d "$BODY"
```

---

## 6. Key Files

| File | Purpose |
|------|---------|
| `apps/api/api/v1/endpoints/kyc.py` | Webhook & initiate endpoints |
| `apps/api/core/sumsub_crypto.py` | HMAC validation |
| `apps/api/services/kyc_service.py` | KYC state machine, webhook handler |
| `apps/api/services/simple_identity_bridge_service.py` | Whitelist-based identity (simple mode) |
| `apps/api/services/web3_identity_service.py` | ONCHAINID + claims (erc3643 mode) |
| `apps/api/services/wallet_service.py` | Auto-register new wallets after KYC |
| `contracts/src/identity/SimpleIdentityRegistry.sol` | On-chain whitelist contract |
| `packages/common/core/config.py` | Config (IDENTITY_MODE, addresses) |

---

## 7. Database Tables

| Table | Key Fields |
|-------|-----------|
| `users` | `kyc_status`, `kyc_level`, `kyc_provider`, `kyc_external_id`, `kyc_verified_at`, `onchain_id` |
| `kyc_applications` | `status`, `sumsub_review_id`, `result_payload` (encrypted), `reviewed_at` |
| `wallets` | `registered_on_chain` (boolean), `address_checksum`, `link_signature` |
| `webhook_events` | `provider` (sumsub), `payload`, `status`, `processed_at` |
| `audit_logs` | `action`, `payload`, `ip_address` (encrypted) |
| `wallet_audit_logs` | `action` (linked/unlinked), `address`, `link_signature`, timestamps |

---

## 8. Troubleshooting

| Issue | Check |
|-------|-------|
| Webhook returns 401 | Verify `SUMSUB_SECRET_KEY` matches Sumsub dashboard |
| KYC stuck on pending | Check Sumsub dashboard for review status; verify webhook URL is reachable |
| Wallet not whitelisted | Check `IDENTITY_REGISTRY_ADDRESS` is set; check `IDENTITY_SIGNER_PRIVATE_KEY` has ETH for gas |
| On-chain tx fails | Verify signer has Base Sepolia ETH; check RPC URL is correct |
| User can't invest after KYC | Verify `wallet.registered_on_chain = True` in DB; check contract whitelist |
