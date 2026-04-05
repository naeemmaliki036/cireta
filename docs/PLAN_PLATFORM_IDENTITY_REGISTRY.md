# Plan: Single Platform-Level Identity Registry

## Context
Currently each token gets its own identity registry when deployed via `CiretaTokenFactory.deployToken()`. This creates confusion for OTC token deployment (issuer has to pick/paste an identity registry address). The platform's `SimpleIdentityBridgeService` already expects a single `IDENTITY_REGISTRY_ADDRESS` env var for auto-whitelisting KYC-approved users, but it's not configured.

**Goal:** Use one platform-wide identity registry for all tokens and OTC tokens. KYC-verified users get whitelisted once and can participate across all sales/tokens. UI should clearly inform issuers how the platform KYC and identity system works.

---

## Changes

### 1. Deploy platform-level SimpleIdentityRegistry
- Deploy or designate a `SimpleIdentityRegistry` proxy as the platform default
- Set env vars: `IDENTITY_REGISTRY_ADDRESS` in `.env`, `NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS` in admin + launchpad `.env.local`

### 2. Update Token Creation UI + Messaging
- No identity registry field shown — handled automatically
- Add info banner: "Your token will use the Cireta platform identity registry. Only KYC-verified investors can hold and transfer tokens."

### 3. Update OTC Token Deploy UI + Messaging
- Remove the identity registry dropdown/manual input entirely
- Auto-use platform registry. User only enters: Token Name + Symbol
- Add info text: "OTC tokens use the Cireta platform identity registry. Only KYC-verified wallets can receive OTC tokens."

### 4. Update Sale Deployment + Messaging
- Auto-fill identity registry from platform env var
- Add info note: "The sale contract uses the platform identity registry. Investors must complete KYC before purchasing."

### 5. Update Sale Setup Checklist + Messaging
- Fallback to platform registry for whitelist checks
- Update whitelist step: "Whitelist the sale contract and vault so they can hold tokens. The platform identity registry verifies all participants are KYC-approved."

### 6. Update Token Mint Page
- Fallback to platform registry for recipient whitelist check
- Update helper: "Recipient must be KYC-verified on the Cireta platform to receive tokens."

### 7. Update Issuer Overview
- Add KYC info: "All investors are verified through Cireta's KYC process. Once approved, they are automatically whitelisted on-chain and can participate in any sale."

### 8. Enable Auto-Whitelist on KYC Approval
- Set `IDENTITY_REGISTRY_ADDRESS` in `.env` — `SimpleIdentityBridgeService` already handles the rest

### 9. Update Main Deploy Script
- Record platform registry address in deployments

---

## Files to Modify

| File | Change |
|------|--------|
| `.env` | Set `IDENTITY_REGISTRY_ADDRESS` |
| `apps/admin/.env.local` | Add `NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS` |
| `apps/launchpad/.env.local` | Add `NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS` |
| `apps/admin/src/app/issuer/tokens/page.tsx` | Remove IR dropdown from OTC deploy, add info text |
| `apps/admin/src/app/issuer/tokens/new/page.tsx` | Add info banner about platform registry |
| `apps/admin/src/app/issuer/sales/[id]/page.tsx` | Fallback to platform registry, add info note |
| `apps/admin/src/components/molecules/SaleSetupChecklist.tsx` | Fallback + update whitelist step description |
| `apps/admin/src/app/issuer/tokens/[id]/mint/page.tsx` | Fallback + update helper text |
| `apps/admin/src/app/issuer/overview/page.tsx` | Add KYC info section |
| `contracts/src/platform/CiretaTokenFactory.sol` | Optional: accept platform IR param |
| `contracts/scripts/deploy.ts` | Add platform registry step |

---

## UI Messaging Summary

| Screen | Message |
|--------|---------|
| Token creation | "Your token uses the Cireta platform identity registry. Only KYC-verified investors can hold and transfer tokens." |
| OTC token deploy | "OTC tokens use the Cireta platform identity registry. Only KYC-verified wallets can receive OTC tokens." |
| Sale deploy | "The sale contract uses the platform identity registry. Investors must complete KYC before purchasing." |
| Sale whitelist step | "Whitelist the sale contract and vault so they can hold tokens. The platform identity registry verifies all participants are KYC-approved." |
| Token mint | "Recipient must be KYC-verified on the Cireta platform to receive tokens." |
| Issuer overview | "All investors are verified through Cireta's KYC process. Once approved, they are automatically whitelisted on-chain and can participate in any sale." |

---

## Verification
1. Deploy or designate platform registry on Base Sepolia, set env vars
2. Deploy OTC token — no address input needed, info text visible
3. Deploy security token — info banner visible, uses platform registry
4. Deploy sale — info note visible, uses platform registry
5. KYC-approve a user — wallets auto-whitelisted
6. User can receive tokens and OTC tokens without separate whitelisting
7. All issuer-facing screens show clear explanations of how KYC/identity works
