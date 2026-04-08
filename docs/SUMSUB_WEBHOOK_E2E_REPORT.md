# Sumsub Webhook E2E Test Report

## Overview

End-to-end test suite covering the complete Sumsub KYC webhook → on-chain wallet registration pipeline. Tests are in `e2e-tests/playwright/sumsub-webhook.flow.ts`.

**Result: 23/23 passed** (1.8m runtime)

## Test Coverage

| # | Test | What it covers |
|---|------|---------------|
| 1 | Sumsub credentials loaded | Verifies SUMSUB_APP_TOKEN + SUMSUB_SECRET_KEY from .env |
| 2 | Register investor 1 | Fresh user registration |
| 3 | Register investor 2 | Second user for rejection flow |
| 4 | Link 2 wallets to investor 1 | ECDSA-signed wallet linking |
| 5 | Link 1 wallet to investor 2 | Single wallet link |
| 6 | Admin token + user lookup | Admin auth, find user IDs via search |
| 7 | KYC is "none" before webhook | Baseline state verification |
| 8 | Wallets NOT on-chain before KYC | `registered_on_chain=false` for all wallets |
| 9 | Bad HMAC signature rejected (401) | HMAC-SHA256 validation — invalid sig blocked |
| 10 | Missing headers rejected (401) | No X-Payload-Digest / X-App-Token → 401 |
| 11 | Fire GREEN webhook for investor 1 | Simulated `applicantReviewed` with valid HMAC |
| 12 | KYC status = "approved", level = 2 | User approved after GREEN webhook |
| 13 | Wallet on-chain registration attempted | `registered_on_chain` flag checked (depends on chain node) |
| 14 | Admin sees approved KYC | Admin API confirms approval |
| 15 | Fire RED webhook for investor 2 | Rejection webhook with valid HMAC |
| 16 | KYC status = "rejected", level = 0 | User rejected after RED webhook |
| 17 | Rejected user wallets NOT registered | `registered_on_chain=false` — no on-chain action for rejected users |
| 18 | Admin sees rejected KYC | Admin API confirms rejection |
| 19 | Audit log has webhook entry | Compliance audit trail verified |
| 20 | Post-KYC wallet auto-links | New wallet added after approval → auto-registration attempted |
| 21 | Investor 1 has 3 wallets | 2 original + 1 post-KYC |
| 22 | Duplicate webhook doesn't crash | Idempotency — re-sending GREEN doesn't break state |
| 23 | Unknown user ID handled gracefully | Webhook with fake UUID doesn't crash server |

## Architecture Tested

```
Sumsub (simulated)
  ↓ POST /api/v1/kyc/webhook
  ↓ HMAC-SHA256 validated (X-Payload-Digest + X-App-Token)
  ↓
KYCService.handle_webhook()
  ├── applicantReviewed + GREEN → approve user
  │   ├── Set kyc_status=APPROVED, kyc_level=2
  │   ├── SimpleIdentityBridgeService.provision_identity()
  │   │   └── addToWhitelist() / batchAddToWhitelist() on SimpleIdentityRegistry
  │   ├── NotificationService.notify_kyc_approved() → email + in-app
  │   └── AuditLog entry: kyc_webhook_applicantReviewed
  │
  └── applicantReviewed + RED → reject user
      ├── Set kyc_status=REJECTED, kyc_level=0
      ├── NotificationService.notify_kyc_rejected()
      └── AuditLog entry: kyc_webhook_applicantReviewed
```

## HMAC Webhook Signing

Tests generate valid HMAC-SHA256 signatures using the same algorithm as Sumsub:

```typescript
const signature = crypto.createHmac("sha256", SUMSUB_SECRET_KEY)
  .update(payloadString)
  .digest("hex");
```

Sent via curl to ensure exact byte-level match between signed body and sent body (avoids JSON re-serialization issues).

## On-Chain Registration

The `SimpleIdentityBridgeService` is triggered on KYC approval:
- **Signer:** Single wallet from `IDENTITY_SIGNER_PRIVATE_KEY` env var
- **Contract:** `SimpleIdentityRegistry` at `IDENTITY_REGISTRY_ADDRESS`
- **Functions:** `addToWhitelist(address, countryCode)` / `batchAddToWhitelist(addresses[], countryCodes[])`
- **Note:** If no chain node is running, the webhook still succeeds (200) but on-chain registration fails gracefully — the `registered_on_chain` flag stays `false`

## Post-KYC Auto-Registration

When a KYC-approved user links a new wallet:
1. `WalletService.link_wallet()` creates the wallet record
2. `_auto_register_identity()` checks `kyc_status == "approved"`
3. If approved: `SimpleIdentityBridgeService.register_wallet()` adds the wallet to the on-chain whitelist
4. Sets `wallet.registered_on_chain = True`

## Manual Testing

A bash script is also available for manual webhook testing:

```bash
# Approve a user's KYC via simulated webhook
./scripts/test-sumsub-webhook.sh investor@cireta.com GREEN

# Reject
./scripts/test-sumsub-webhook.sh investor@cireta.com RED
```

## Prerequisites

- API running on `:3010` with dev mode enabled
- `.env` has `SUMSUB_APP_TOKEN` and `SUMSUB_SECRET_KEY`
- For on-chain registration: local Hardhat node or Base Sepolia RPC + funded signer wallet

## Running

```bash
pnpm exec playwright test e2e-tests/playwright/sumsub-webhook.flow.ts --project=api-flow
```
