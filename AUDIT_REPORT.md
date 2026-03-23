# Cireta Audit Report — 2026-03-23

## Executive Summary
- **Overall status: PARTIAL** — Substantial scaffolding is in place but significant gaps remain before production
- **Critical issues: 6**
- **Major issues: 12**
- **Minor issues: 9**
- **Missing features: 7**

The project has a solid architectural foundation: well-structured monorepo, proper encrypted field types, real Sumsub integration, 37 passing smart contract tests, and comprehensive Pydantic schemas. However, critical on-chain operations are stubbed, admin endpoints lack role enforcement, one endpoint has a crash-level bug, and several frontend buttons are decorative (no real API call). The product is approximately **65-70% complete** — usable for a demo but NOT production-ready.

---

## 1. Backend API

### Route: GET /api/v1/health
- Exists: ✅
- Service wired: ✅ (direct DB/Redis ping)
- Auth applied: N/A (public)
- Schema validated: ✅
- Rate limited: ❌ (no rate limiter on health)
- Issue: None — works correctly

### Route: POST /api/v1/auth/register
- Exists: ✅
- Service wired: ✅ (`CiretaAuthService.register`)
- Auth applied: N/A (public)
- Schema validated: ✅ (`RegisterRequest` — email, password min 8)
- Rate limited: ✅ (rate_limit_register setting exists)
- Issue: None

### Route: POST /api/v1/auth/login
- Exists: ✅
- Service wired: ✅ (`CiretaAuthService.login`)
- Auth applied: N/A (public)
- Schema validated: ✅ (`LoginRequest`)
- Rate limited: ✅ (rate_limit_login setting)
- Issue: None

### Route: POST /api/v1/auth/refresh
- Exists: ✅
- Service wired: ✅ (`CiretaAuthService.refresh_tokens`)
- Auth applied: N/A (uses refresh token)
- Schema validated: ✅ (`RefreshTokenRequest`)
- Rate limited: ❌
- Issue: None significant

### Route: GET /api/v1/auth/me
- Exists: ✅
- Service wired: ✅ (direct DB query)
- Auth applied: ✅ (CurrentUserId)
- Schema validated: ✅ (`UserResponse`)
- Issue: None

### Route: PATCH /api/v1/auth/me
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅
- Schema validated: ✅ (`UpdateProfileRequest`)
- Issue: None

### Route: POST /api/v1/auth/forgot-password
- Exists: ✅
- Service wired: ✅ (`CiretaAuthService.forgot_password`)
- Auth applied: N/A (public)
- Schema validated: ✅
- Issue: None

### Route: POST /api/v1/auth/reset-password
- Exists: ✅
- Service wired: ✅ (`CiretaAuthService.reset_password`)
- Auth applied: N/A (token-based)
- Schema validated: ✅
- Issue: None

### Route: GET /api/v1/auth/verify-email
- Exists: ✅
- Service wired: ✅ (`CiretaAuthService.verify_email`)
- Auth applied: N/A (token in query param)
- Schema validated: ✅
- Issue: None

### Route: POST /api/v1/kyc/initiate
- Exists: ✅
- Service wired: ✅ (`KYCService.initiate`) — real Sumsub API integration
- Auth applied: ✅
- Schema validated: ✅
- Issue: Dev mode returns mock tokens (correct behavior for dev)

### Route: GET /api/v1/kyc/status
- Exists: ✅
- Service wired: ✅ (`KYCService.get_status`)
- Auth applied: ✅
- Schema validated: ✅
- Issue: None

### Route: POST /api/v1/kyc/webhook
- Exists: ✅
- Service wired: ✅ (`KYCService.handle_webhook`)
- Auth applied: HMAC validation ✅
- Schema validated: ✅
- Issue: None — properly updates user KYC status, triggers ONCHAINID queue

### Route: POST /api/v1/kyc/corporate/initiate
- Exists: ✅
- Service wired: ✅ (`KYCService.initiate_corporate`)
- Auth applied: ✅
- Schema validated: ✅
- Issue: None

### Route: GET /api/v1/kyc/corporate/status
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅
- Issue: None

### Route: POST /api/v1/kyc/corporate/webhook
- Exists: ✅
- Service wired: ✅
- Auth applied: HMAC ✅
- Issue: None

### Route: GET /api/v1/wallets
- Exists: ✅
- Service wired: ✅ (`WalletService.list_wallets`)
- Auth applied: ✅
- Issue: None

### Route: POST /api/v1/wallets/link
- Exists: ✅
- Service wired: ✅ (`WalletService.link_wallet`) — real SIWE signature verification
- Auth applied: ✅
- Schema validated: ✅
- Issue: None

### Route: DELETE /api/v1/wallets/{id}
- Exists: ✅
- Service wired: ✅ (`WalletService.unlink_wallet`)
- Auth applied: ✅
- Issue: None

### Route: PATCH /api/v1/wallets/{id}/primary
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅
- Issue: None

### Route: GET /api/v1/wallets/nonce
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅
- Issue: None

### Route: GET /api/v1/tokens
- Exists: ✅
- Service wired: ✅ (`TokenService.list_tokens`)
- Auth applied: Optional (public list)
- Schema validated: ✅ (`TokenListResponse`)
- Issue: None

### Route: POST /api/v1/tokens
- Exists: ✅
- Service wired: ✅ (`TokenService.create_token`)
- Auth applied: ✅ (issuer check in service)
- Schema validated: ✅ (`TokenCreateRequest`)
- Issue: None

### Route: GET /api/v1/tokens/{id}
- Exists: ✅
- Service wired: ✅
- Issue: None

### Route: POST /api/v1/tokens/{id}/deploy
- Exists: ✅
- Service wired: ✅ (`TokenService.deploy_contract`)
- Auth applied: ✅
- **🔴 CRITICAL ISSUE: `deploy_contract()` sets a placeholder address `0x000...000` — does NOT call Web3Service. Comment says `# TODO: Call Web3Service to deploy ERC-3643 contract`. This is a STUB.**

### Route: GET /api/v1/sales
- Exists: ✅
- Service wired: ✅ (`SaleService.list_sales`)
- Auth applied: Optional
- Schema validated: ✅ (`SaleListResponse`)
- Issue: None

### Route: POST /api/v1/sales
- Exists: ✅
- Service wired: ✅ (`SaleService.create_sale`)
- Auth applied: ✅
- Schema validated: ✅ (`SaleCreateRequest`)
- Issue: None

### Route: GET /api/v1/sales/{id}
- Exists: ✅
- Service wired: ✅
- Issue: None

### Route: POST /api/v1/sales/{id}/contribute
- Exists: ✅
- Service wired: ✅ (`SaleContributeService.contribute`)
- Auth applied: ✅
- Schema validated: ✅ (`ContributeRequest`)
- Rate limited: ✅ (rate_limit_contribute setting)
- **🟡 MAJOR ISSUE: Whitelist check references `wallet_address` variable that is NOT passed into the `contribute()` method signature. This will cause a `NameError` at runtime when `whitelist_only=True`.**

### Route: POST /api/v1/sales/{id}/finalize
- Exists: ✅
- Service wired: ✅ (`SaleContributeService.finalize_sale`)
- Auth applied: ✅ (issuer check)
- Issue: None significant (no on-chain finalization)

### Route: POST /api/v1/sales/{id}/claim
- Exists: ✅
- Service wired: ✅ (`SaleContributeService.claim_tokens`)
- Auth applied: ✅
- **🟡 MAJOR ISSUE: Marks contributions as CLAIMED in DB but does NOT trigger on-chain token transfer. Users "claim" but receive nothing on-chain.**

### Route: POST /api/v1/sales/{id}/refund
- Exists: ✅
- Service wired: ✅ (`SaleContributeService.claim_refund`)
- Auth applied: ✅
- **🟡 MAJOR ISSUE: Marks as REFUNDED in DB but does NOT trigger on-chain USDC refund.**

### Route: POST /api/v1/sales/{id}/otc-allocate
- Exists: ✅
- Service wired: ✅ (`SaleService.otc_allocate`)
- Auth applied: ✅
- Schema validated: ✅ (`OTCAllocateRequest`)
- Issue: None significant

### Route: GET /api/v1/portfolio/holdings
- Exists: ✅
- Service wired: ✅ (`PortfolioService.get_holdings`)
- Auth applied: ✅
- Issue: None

### Route: GET /api/v1/portfolio/transactions
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅
- Issue: None

### Route: GET /api/v1/portfolio/vesting
- Exists: ✅
- Service wired: ✅ (`VestingService.get_schedules`)
- Auth applied: ✅
- Issue: None

### Route: POST /api/v1/portfolio/redeem
- Exists: ✅
- Service wired: ✅ (`RedemptionService.create_request`)
- Auth applied: ✅
- Issue: None (DB only, fulfillment is manual)

### Route: GET /api/v1/notifications
- Exists: ✅
- Service wired: ✅ (direct DB query)
- Auth applied: ✅
- Schema validated: ✅
- Issue: None

### Route: GET /api/v1/notifications/unread-count
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅
- Issue: None

### Route: PATCH /api/v1/notifications/{id}/read
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅
- Issue: None

### Route: PATCH /api/v1/notifications/read-all
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅
- Issue: None

### Route: GET /api/v1/notifications/preferences
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅
- Issue: Returns default `NotificationPreferences()` instead of DB values (minor — always returns defaults)

### Route: PATCH /api/v1/notifications/preferences
- Exists: ✅
- **🔴 CRITICAL BUG: Missing `db` dependency injection (parameter not in function signature). References undefined `db` and `preferences` variables. This endpoint WILL CRASH with `NameError` on every call.**

### Route: GET /api/v1/admin/issuers
- Exists: ✅
- Service wired: ✅ (`IssuerService.list_issuers`)
- Auth applied: ✅ (CurrentUserId) but **🔴 NO ROLE CHECK — any authenticated user can list all issuers**
- Issue: Missing admin/platform_admin role enforcement

### Route: POST /api/v1/admin/issuers
- Exists: ✅
- Service wired: ✅ (`IssuerService.onboard_issuer`)
- Auth applied: ✅ but **🔴 NO ROLE CHECK — any authenticated user can onboard issuers**
- Issue: Comment says "Platform admin check" but it's just `CurrentUserId`

### Route: PATCH /api/v1/admin/issuers/{id}/fee
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅ but **🔴 NO ROLE CHECK**
- Issue: Same as above

### Route: POST /api/v1/admin/issuers/{id}/revoke
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅ but **🔴 NO ROLE CHECK**

### Route: POST /api/v1/admin/issuers/{id}/activate
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅ but **🔴 NO ROLE CHECK**

### Route: GET /api/v1/admin/platform/stats
- Exists: ✅
- Service wired: ✅ (inline DB aggregation)
- Auth applied: ❌ **Only `Depends(get_db)` — NO auth at all!**
- Issue: Platform stats endpoint is completely public

### Route: GET /api/v1/admin/compliance/logs
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅ but **🔴 NO ROLE CHECK**

### Route: POST /api/v1/admin/compliance/freeze
- Exists: ✅
- Service wired: ✅ (`ComplianceBaseService.freeze_address`)
- Auth applied: ✅ (role check in service layer ✅)
- **🟡 MAJOR: Writes audit log but does NOT call Web3Service for on-chain freeze. Comment: `# TODO: Call Web3Service to freeze on-chain`**

### Route: POST /api/v1/admin/compliance/unfreeze
- Exists: ✅
- Same issues as freeze

### Route: POST /api/v1/admin/compliance/forced-transfer
- Exists: ✅
- Service wired: ✅ (`ComplianceActionService.forced_transfer`)
- **🟡 MAJOR: DB only, no on-chain execution. `# TODO: Call Web3Service for forced transfer`**

### Route: POST /api/v1/admin/compliance/recover
- Exists: ✅
- Same TODO issue as forced transfer

### Route: POST /api/v1/admin/compliance/pause
- Exists: ✅
- Service wired: ✅ — updates `token.is_paused` in DB
- **🟡 MAJOR: Does NOT call `Web3TokenService.pause_token()` even though that method exists and works**

### Route: POST /api/v1/admin/compliance/unpause
- Exists: ✅
- Same issue as pause

### Route: GET /api/v1/admin/investors
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅ but no role check

### Route: GET /api/v1/admin/investors/{id}
- Exists: ✅
- Service wired: ✅
- Issue: Same role issue

### Route: PATCH /api/v1/admin/redemptions/{id}
- Exists: ✅
- Service wired: ✅ (direct DB)
- Auth applied: ✅ (CurrentUserId)
- Issue: No issuer ownership check — any auth'd user could update redemptions

### Route: GET /api/v1/admin/redemptions
- Exists: ✅
- Service wired: ✅
- Issue: Same — no role check

### Route: POST /api/v1/admin/dividends/deposit
- Exists: ✅
- Service wired: ✅ (direct DB)
- Auth applied: ✅ (issuer check ✅)
- Issue: No on-chain interaction

### Route: GET /api/v1/admin/dividends
- Exists: ✅
- Service wired: ✅
- Auth applied: ✅ but no role check

### Route: GET /api/v1/issuer/withdrawals
- Exists: ✅
- Service wired: ✅ (returns finalized sale data)
- Auth applied: ✅ (issuer check)
- **🟡 MAJOR: No actual withdrawal execution — just lists available amounts. No POST endpoint to actually withdraw funds.**

### ⚠️ MISSING BACKEND ENDPOINT: PATCH /api/v1/admin/platform/settings
- The admin frontend `PlatformSettingsPage` calls `PATCH /api/v1/admin/platform/settings` but this endpoint DOES NOT EXIST in any router file. **The save button is dead.**

---

## 2. Launchpad Frontend

### Page: / (Home/Landing)
- Exists: ✅
- Real UI: ✅ (hero section, feature cards, CTA)
- API calls: ✅ (fetches active sales)
- Brand match: ✅ (darkAqua, rounded-3xl, Gilroy references in config)
- Issue: None

### Page: /explore
- Exists: ✅
- Real UI: ✅ (sale grid with filters)
- API calls: ✅ (fetches sales list)
- Brand match: ✅
- Issue: Minor — "Coming soon" or placeholder text possible (flagged by grep)

### Page: /project/[slug]
- Exists: ✅
- Real UI: ✅
- API calls: ✅ (fetches single sale by slug)
- Issue: None

### Page: /invest/[slug]
- Exists: ✅
- Real UI: ✅ (InvestFlow component)
- API calls: ✅ (fetches sale, submits contribution)
- Issue: Real InvestFlow component with multi-step wizard (wallet connect → amount → confirm → tx)

### Page: /register
- Exists: ✅
- Real UI: ✅
- API calls: ✅ (calls POST /auth/register)
- Issue: Minor placeholder text possible

### Page: /login
- Exists: ✅
- Real UI: ✅
- API calls: ✅ (calls POST /auth/login)
- Issue: Minor placeholder text possible

### Page: /verify (KYC)
- Exists: ✅
- Real UI: ✅ (SumsubVerification component)
- API calls: ✅ (calls POST /kyc/initiate, embeds Sumsub SDK)
- Issue: None — properly integrated

### Page: /verify/corporate
- Exists: ✅
- Real UI: ✅
- API calls: ✅ (calls POST /kyc/corporate/initiate)
- Issue: Minor placeholder text possible

### Page: /portfolio
- Exists: ✅
- Real UI: ✅ (holdings summary, nested routes)
- API calls: ✅ (calls GET /portfolio/holdings)
- Issue: None

### Page: /portfolio/holdings
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: None

### Page: /portfolio/transactions
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: None

### Page: /portfolio/vesting
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: None

### Page: /portfolio/claim/[token]
- Exists: ✅
- Real UI: ✅
- API calls: ✅ (calls POST /sales/{id}/claim)
- Issue: Minor placeholder text flagged

### Page: /portfolio/redeem/[token]
- Exists: ✅
- Real UI: ✅
- API calls: ✅ (calls POST /portfolio/redeem)
- Issue: Minor placeholder text flagged

### Page: /portfolio/dividends
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: None

### Page: /forgot-password
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: Minor placeholder flagged

### Page: /reset-password
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: Minor placeholder flagged

### Page: /account
- Exists: ✅
- Real UI: ✅
- Issue: Minor placeholder flagged

### Page: /settings
- Exists: ✅
- Real UI: ✅ (nested settings layout)
- Issue: None

### Page: /settings/profile
- Exists: ✅
- Real UI: ✅
- API calls: ✅ (PATCH /auth/me)
- Issue: Minor placeholder text

### Page: /settings/wallets
- Exists: ✅
- Real UI: ✅
- API calls: ✅ (GET/POST/DELETE /wallets)
- Issue: None

### Page: /settings/verification
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: None

### Page: /settings/notifications
- Exists: ✅
- Real UI: ✅ (toggle grid for email/in-app per category)
- API calls: ✅ (PATCH /notifications/preferences)
- **🔴 CRITICAL: The backend PATCH endpoint is broken (crash bug). Saves will silently fail or return 500.**

---

## 3. Admin Frontend

### Page: /login
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: None

### Page: /issuer/overview (Dashboard)
- Exists: ✅
- Real UI: ✅ (StatCards, active sales list, quick actions)
- API calls: ✅ (fetches sales via repository)
- Brand match: ✅
- Issue: "Total Investors" and "Fees Earned" hardcoded to 0

### Page: /issuer/tokens
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: None

### Page: /issuer/tokens/new
- Exists: ✅
- Real UI: ✅ (create token form with all fields)
- API calls: ✅ (POST /tokens)
- **🔴 CRITICAL: `handleDeploy` is a FAKE — just does `setTimeout(resolve, 3000)` and nothing else. The "Deploy Token" button is decorative.**

### Page: /issuer/tokens/[id]
- Exists: ✅
- Real UI: ✅
- Issue: Minor placeholder text

### Page: /issuer/sales
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: Minor placeholder text

### Page: /issuer/sales/[id]
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: None

### Page: /issuer/sales/[id]/otc
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: None

### Page: /issuer/investors
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: Minor placeholder

### Page: /issuer/investors/[id]
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: None

### Page: /issuer/compliance
- Exists: ✅
- Real UI: ✅ (freeze/unfreeze, forced transfer forms)
- API calls: ✅ (calls admin compliance endpoints)
- Issue: Backend compliance actions are DB-only (no on-chain)

### Page: /issuer/compliance/recovery
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: Minor placeholder

### Page: /issuer/dividends
- Exists: ✅
- Real UI: ✅ (deposit form, distribution list)
- API calls: ✅
- Issue: None

### Page: /issuer/redemptions
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: None

### Page: /issuer/reports
- Exists: ✅
- Real UI: ✅
- Issue: No backend analytics endpoint for issuer-specific reports (uses placeholder data)

### Page: /issuer/withdrawals
- Exists: ✅
- Real UI: ✅ (shows available amounts)
- API calls: ✅ (GET /issuer/withdrawals)
- **🟡 MAJOR: No "Withdraw" action button or POST endpoint. Issuer can see available funds but cannot withdraw them.**

### Page: /platform/analytics
- Exists: ✅
- Real UI: ✅ (Recharts: TVL, Fee Revenue, KYC Funnel, Token Distribution)
- API calls: ⚠️ Uses hardcoded stat values in StatCards (24.5M TVL, 5247 users)
- **🟡 MAJOR: Analytics data is all hardcoded/mock. Not wired to GET /admin/platform/stats endpoint.**

### Page: /platform/compliance
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: Minor placeholder

### Page: /platform/issuers
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: Minor placeholder

### Page: /platform/users
- Exists: ✅
- Real UI: ✅
- API calls: ✅
- Issue: None

### Page: /platform/settings
- Exists: ✅
- Real UI: ✅ (fee BPS, blocked countries, KYC min level inputs)
- API calls: ✅ (calls PATCH /admin/platform/settings)
- **🔴 CRITICAL: Backend endpoint does NOT EXIST. The save button calls a non-existent route — will always 404.**

---

## 4. Smart Contracts

### Compilation
- **✅ All contracts compile successfully** (Hardhat + Solidity)

### Test Suite
- **✅ 37 passing, 0 failing** (1 second run time)
- Covers: CiretaToken, CiretaTokenFactory, CountryAllowModule, ModularCompliance, Sale, VestingVault, ChainlinkPoRChecker, DividendDistributor, RedemptionManager

### Deploy Scripts
- `scripts/deploy.ts`: ✅ Comprehensive — deploys all registries, factory, compliance modules, configures claim topics
- `scripts/deployIdentity.ts`: ✅ ONCHAINID deployment

### Factory Pattern
- ✅ `CiretaTokenFactory` implements proper factory pattern with UUPS proxy
- ✅ Deploys token + identity registry + compliance per-token

### Compliance Module System
- ✅ `ModularCompliance` with pluggable modules
- ✅ `CountryAllowModule` implemented
- ✅ `MaxHolderCountModule` implemented

### Key Contracts Present
- CiretaToken (ERC-3643)
- CiretaTokenFactory
- IdentityRegistry + Storage
- ModularCompliance
- CountryAllowModule
- MaxHolderCountModule
- Sale (UUPS upgradeable)
- VestingVault (UUPS upgradeable)
- DividendDistributor
- RedemptionManager
- ChainlinkPoRChecker
- PlatformFeeManager
- IssuerRegistry
- TrustedIssuersRegistry
- ClaimTopicsRegistry
- Various interfaces and libraries

---

## 5. Database

### Models
All spec-required models exist:
- ✅ User (with KYC fields, roles, account locking)
- ✅ Issuer (with whitelisting, fee BPS, jurisdiction)
- ✅ Token (ERC-3643 fields, slug, description, image)
- ✅ TokenSale (soft/hard cap, phases, payment token)
- ✅ SalePhase (whitelist support, contribution limits)
- ✅ Contribution (status lifecycle: pending→confirmed→claimed/refunded)
- ✅ Wallet (encrypted address, SIWE nonce, Safe support)
- ✅ KYCApplication (encrypted result payload)
- ✅ VestingSchedule
- ✅ RedemptionRequest (with delivery fields)
- ✅ DividendDistribution
- ✅ AuditLog (append-only ✅)
- ✅ Notification
- ✅ NotificationPreferences
- ✅ TokenDocument

### Migrations
- ✅ 4 migration files present (001 initial, 002 cireta schema, 003 spec gaps, slug/description)
- ✅ Properly chained revisions

### Encrypted Fields
- ✅ `EncryptedString` and `EncryptedJSON` custom SQLAlchemy types using Fernet
- ✅ Applied to: `user.sumsub_applicant_id`, `wallet.address`, `issuer.legal_entity_name`, `kyc_application.sumsub_review_id`, `kyc_application.result_payload`
- ✅ Production validation: encryption_key required in prod/staging

### Audit Logs
- ✅ Append-only pattern enforced (no UPDATE/DELETE in code)
- ✅ All compliance actions write audit entries
- ✅ KYC webhooks write audit entries

---

## 6. Integration Gaps

### Frontend → API: ✅ MOSTLY CONNECTED
- Both launchpad and admin have proper API client layers (`lib/api/client.ts`, `lib/api/repositories/`)
- Auth tokens stored and passed correctly
- API base URL configurable via `NEXT_PUBLIC_API_URL`
- **Gap: Platform analytics page uses hardcoded data instead of calling `/admin/platform/stats`**

### API → Database: ✅ FULLY CONNECTED
- All services use AsyncSession properly
- Proper relationship loading with selectinload
- Transaction management correct

### API → Blockchain: ⚠️ PARTIALLY CONNECTED
- `Web3BaseService`: ✅ Real Web3.py connection, can send transactions, call contracts
- `Web3TokenService.deploy_erc3643_token()`: ❌ Returns placeholder address — STUB
- `Web3TokenService.pause_token()/unpause_token()`: ✅ Real contract calls
- `Web3IdentityService.deploy_identity()`: ✅ Real factory call
- `Web3IdentityService.issue_kyc_claims()`: ✅ Real contract call
- **Compliance actions (freeze, unfreeze, forced_transfer, recover)**: ❌ ALL STUBBED — audit log only
- **Token deployment**: ❌ STUBBED
- **Claim/refund on-chain execution**: ❌ STUBBED

### KYC → Sumsub: ✅ FULLY CONNECTED
- Real Sumsub API integration with HMAC signing
- Webhook handler properly processes all event types
- Dev mode gracefully falls back to mock tokens
- Corporate KYB flow implemented

### Environment Variables: ✅ WELL DOCUMENTED
- `Settings` class in `packages/common/core/config.py` with 40+ settings
- Safe defaults in `defaults.py`
- Production validation for required secrets
- `.env` file support

---

## 7. End-to-End Scenarios

### Scenario 1: User Registration → Investment → Claim

| Step | Status | Issue |
|------|--------|-------|
| Register | ✅ Works | — |
| Verify email | ✅ Works | Email via Resend API |
| Complete KYC | ✅ Works | Sumsub SDK integration |
| Browse sales | ✅ Works | — |
| Invest in sale | ✅ Works (DB) | Contribution recorded, but no on-chain verification of tx_hash |
| Claim tokens | ⚠️ Partial | DB status updated to CLAIMED, but no on-chain token transfer |
| Request redemption | ✅ Works (DB) | Manual fulfillment process |

### Scenario 2: Issuer Creates Token → Sale → Finalize

| Step | Status | Issue |
|------|--------|-------|
| Create token | ✅ Works | Token created in DB |
| Deploy contract | ❌ FAKE | Sets placeholder address, no actual deployment |
| Create sale | ✅ Works | Sale with phases created |
| Monitor contributions | ✅ Works | — |
| Finalize sale | ✅ Works (DB) | Status updated, contributions confirmed |
| Withdraw funds | ❌ MISSING | No withdrawal execution endpoint |

### Scenario 3: Admin Manages Platform

| Step | Status | Issue |
|------|--------|-------|
| Onboard issuer | ⚠️ Works but insecure | No admin role check |
| Manage compliance | ⚠️ Partial | DB + audit only, no on-chain |
| Review analytics | ❌ MOCK | Hardcoded data |
| Platform settings | ❌ BROKEN | Backend endpoint missing |

### Scenario 4: Compliance Actions

| Step | Status | Issue |
|------|--------|-------|
| Freeze address | ⚠️ DB only | Audit log written, no on-chain freeze |
| Forced transfer | ⚠️ DB only | Audit log written, no on-chain transfer |
| Recovery | ⚠️ DB only | Audit log written, no on-chain recovery |
| Pause/Unpause | ⚠️ DB only | Token.is_paused updated but Web3TokenService.pause_token() NOT called even though it exists! |

---

## 8. Missing Features

1. **Admin Role Enforcement** — No `require_admin` or `require_issuer` dependency. All admin endpoints accept any authenticated user. The `UserRole` enum exists, the `ComplianceBaseService` checks roles in the service layer, but the **endpoint layer has zero role guards**.

2. **Platform Settings API** — `PATCH /api/v1/admin/platform/settings` does not exist. Frontend calls it but gets 404.

3. **Actual On-Chain Token Deployment** — `TokenService.deploy_contract()` is a stub. `Web3TokenService.deploy_erc3643_token()` returns placeholder. The contract factory exists and works in tests, but the API doesn't call it.

4. **On-Chain Compliance Execution** — Freeze, unfreeze, forced_transfer, recover, pause, unpause all have `# TODO` comments. The `Web3TokenService` has `pause_token()`/`unpause_token()` ready to go but they're not wired.

5. **On-Chain Claim/Refund** — Claiming tokens and claiming refunds only update DB status. No on-chain token transfer or USDC return.

6. **Withdrawal Execution** — Issuers can see available funds but there's no POST endpoint to actually withdraw.

7. **Redis Token Blacklist** — Logout/refresh writes `# TODO: Store token hash in Redis blacklist`. Current logout is effectively a no-op for the old access token.

---

## 9. Recommendations (Priority Order)

### P0 — Fix Before Any Demo

1. **Fix PATCH /notifications/preferences crash** — Add `db: AsyncSession = Depends(get_db)` to function signature, rename `preferences` to `prefs` to match parameter name. 5-minute fix.

2. **Add admin role enforcement** — Create a `RequireAdmin` and `RequireIssuer` dependency. Apply to all `/admin/*` endpoints. Without this, any user can manipulate the platform. ~2 hours.

3. **Create PATCH /admin/platform/settings endpoint** — Or remove the settings page from admin UI. 30 minutes.

4. **Fix handleDeploy in admin tokens/new** — Either wire it to `POST /tokens/{id}/deploy` API call, or disable the button with "Coming soon".

5. **Fix whitelist check bug in contribute** — Add `wallet_address` parameter to `SaleContributeService.contribute()`.

### P1 — Required for MVP

6. **Wire on-chain token deployment** — Connect `TokenService.deploy_contract()` to `CiretaTokenFactory` via `Web3TokenService`. The contract code exists and passes tests.

7. **Wire on-chain compliance actions** — Connect pause/unpause (methods exist!), freeze/unfreeze, forced_transfer, recover to `Web3TokenService`/`Web3IdentityService`.

8. **Wire on-chain claim/refund** — After sale finalization, claiming should trigger token transfer. After sale failure, refund should return USDC.

9. **Add withdrawal execution** — POST /issuer/withdrawals/{sale_id}/withdraw endpoint that triggers USDC transfer to issuer wallet.

10. **Wire platform analytics** — Connect admin analytics page to GET /admin/platform/stats (endpoint exists, frontend doesn't call it).

### P2 — Pre-Production

11. **Implement Redis token blacklist** — For proper JWT invalidation on logout/refresh.

12. **Add tx_hash verification** — When recording contributions, verify the tx_hash on-chain matches the claimed amount and token.

13. **Comprehensive error handling in frontend** — Several catch blocks just have `/* ignore */`.

14. **Rate limiting middleware** — Settings exist but the actual middleware application is not verified on all routes.

### P3 — Polish

15. **Remove hardcoded analytics values** — Platform analytics StatCards have mock numbers.
16. **Issuer-specific reports backend** — Reports page exists but lacks a data source.
17. **Notification preferences GET** — Returns defaults instead of actual DB values (the `_to_response` mapping is wrong).

---

## Test Coverage Summary

| Area | Unit Tests | Integration Tests |
|------|-----------|-------------------|
| Auth Service | ✅ | ✅ |
| Token Service | ✅ | ✅ |
| Sale Service | ✅ | ✅ |
| KYC Service | ✅ | ❌ |
| Compliance Service | ✅ | ❌ |
| Portfolio Service | ✅ | ❌ |
| Redemption Service | ✅ | ❌ |
| Vesting Service | ✅ | ❌ |
| Issuer Service | ✅ | ❌ |
| Health API | N/A | ✅ |
| Smart Contracts | ✅ (37 passing) | N/A |
| E2E | ❌ | ❌ |

---

## Final Verdict

Cireta has a **strong architectural foundation** — the monorepo structure is clean, the spec is well-thought-out, the smart contracts are solid (37/37 tests pass), encrypted field handling is proper, and the Sumsub KYC integration is real. The frontend has genuine UI (not placeholder dumps) with proper API client layers.

The **critical gap** is the on-chain execution layer: everything from token deployment to compliance actions to claim/refund is DB-only. The contract code exists, the Web3 service base exists, but they're not connected. This is the single biggest piece of work remaining.

The second critical gap is **access control**: admin endpoints have zero role enforcement at the API layer, which is a security vulnerability.

**Estimated effort to reach production-ready MVP: 2-3 weeks of focused engineering.**
