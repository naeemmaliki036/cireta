# Cireta Post-Fix Audit Report V2

**Date:** 2026-03-23
**Auditor:** Claude Opus 4.6 (automated)
**Scope:** Full codebase -- backend, frontend, smart contracts, security, infrastructure

---

## Automated Check Results

| Check | Result |
|-------|--------|
| `poetry run ruff check .` | PASS -- All checks passed |
| `cd apps/admin && npx tsc --noEmit` | PASS -- No errors |
| `cd apps/launchpad && npx tsc --noEmit` | PASS -- No errors |
| `cd contracts && npx hardhat test` | PASS -- 37/37 passing (907ms) |

---

## Summary

| Severity | Backend | Frontend | Contracts | Security | Total |
|----------|---------|----------|-----------|----------|-------|
| P0 (Critical) | 9 | 7 | 6 | 4 | **26** |
| P1 (High) | 6 | 12 | 6 | 5 | **29** |
| P2 (Medium) | 6 | 14 | 8 | 9 | **37** |
| **Total** | **21** | **33** | **20** | **18** | **92** |

---

## P0 -- CRITICAL ISSUES

### Backend

**B-P0-1: Missing `issue_kyc_claims` method -- runtime crash on KYC approval**
- `apps/api/services/kyc_service.py:278` calls `identity_svc.issue_kyc_claims(...)` which does not exist on `Web3IdentityService`. Every KYC approval with `onchain_id_address` set silently fails to issue compliance claims. Users cannot transfer ERC-3643 tokens.
- Fix: Implement `issue_kyc_claims()` on `Web3IdentityService`.

**B-P0-2: Race condition on concurrent contributions -- no DB locking**
- `apps/api/services/sale_contribute_service.py:67-182` reads `sale.total_raised`, adds amount, writes back without `SELECT FOR UPDATE`. Two concurrent contributions can overwrite each other, losing funds from the total. Hard cap check is also non-atomic.
- Fix: Use `select(...).with_for_update()` or atomic SQL `UPDATE ... SET total_raised = total_raised + :amount WHERE total_raised + :amount <= hard_cap`.

**B-P0-3: `recover_tokens` ignores `amount` parameter -- recovers ALL tokens**
- `apps/api/services/web3_token_service.py:216` -- the `amount` parameter is unused (`# noqa: ARG002`). Calls `recoveryAddress` which is full wallet recovery, not partial. Compliance action "recover N tokens" actually recovers ALL tokens.
- Fix: Use `forcedTransfer` for partial recovery, or document all-or-nothing behavior.

**B-P0-4: Refresh token never invalidated -- token replay attack**
- `apps/api/services/auth_service.py:131-137` -- `TODO: Store old token hash in Redis blacklist` is unimplemented. Old refresh tokens remain valid for 7 days. Combined with no-op `logout()`, stolen tokens cannot be revoked.
- Fix: Implement Redis-based token blacklisting.

**B-P0-5: JWT fallback secret `"dev-secret"` in production path**
- `packages/common/services/auth_service.py:54-57,76-79,90-92,106-108` -- every JWT operation uses `settings.jwt_secret_key or "dev-secret"`. If env var is missing, anyone can forge tokens.
- Fix: Raise hard error at startup if `jwt_secret_key` is falsy. Remove all `or "dev-secret"` fallbacks.

**B-P0-6: Token document upload has no ownership check**
- `apps/api/api/v1/endpoints/tokens.py:178-221` -- any authenticated user can attach documents to any token. No check that user is the token's issuer.
- Fix: Verify `token.issuer.user_id == current_user_id`.

**B-P0-7: Double-withdrawal -- no balance tracking**
- `apps/api/api/v1/endpoints/issuer_withdrawals.py:96-165` -- checks `amount > sale.total_raised` but never deducts withdrawn amounts. Issuer can withdraw repeatedly.
- Fix: Track `total_withdrawn` on sale model; check `amount <= total_raised - total_withdrawn`.

**B-P0-8: Dividend deposit lacks token ownership verification**
- `apps/api/api/v1/endpoints/admin_operations.py:76-96` -- any issuer can record dividends against any token.
- Fix: Verify `token.issuer_id == current_issuer.id`.

**B-P0-9: Platform settings stored in memory only**
- `apps/api/api/v1/endpoints/admin_issuers.py:182-209` -- `_platform_settings` dict is lost on restart, inconsistent across workers. Includes security-critical `blocked_countries` and `kyc_min_level`.
- Fix: Move to database or Redis.

### Frontend

**F-P0-1: Admin login stores JWT in localStorage (XSS vector)**
- `apps/admin/src/app/login/page.tsx:18-25` -- raw `fetch()` + `localStorage.setItem`. Any XSS can steal the admin token.
- Fix: Use in-memory `setAccessToken()` from `client.ts`.

**F-P0-2: Compliance freeze has no confirmation dialog**
- `apps/admin/src/app/issuer/investors/[id]/page.tsx:25,29,45` -- raw `fetch()` + `localStorage` for freeze action. One misclick triggers irreversible on-chain freeze.
- Fix: Add confirmation modal; use repository pattern.

**F-P0-3: Token recovery page uses localStorage + raw fetch**
- `apps/admin/src/app/issuer/compliance/recovery/page.tsx:14,22` -- highly sensitive compliance action with no confirmation step.
- Fix: Route through compliance repository; add mandatory confirmation.

**F-P0-4: Dividend deposit uses localStorage + raw fetch**
- `apps/admin/src/app/issuer/dividends/page.tsx:19,24,39` -- financial action bypasses typed API client.
- Fix: Create dividends repository.

**F-P0-5: Redemption updates use localStorage + raw fetch**
- `apps/admin/src/app/issuer/redemptions/page.tsx:25,30,43` -- compliance action without typed error handling.
- Fix: Create redemptions repository.

**F-P0-6: Double Authorization header in wallets repository**
- `apps/launchpad/src/lib/api/repositories/wallets.repository.ts:24,32,40,47` -- passes `token` param AND manual `Authorization` header. Could cause auth failures.
- Fix: Remove manual `headers: { Authorization }`.

**F-P0-7: Double Authorization header in auth repository**
- `apps/launchpad/src/lib/api/repositories/auth.repository.ts:81` -- same issue in `updateProfile`.
- Fix: Remove manual header.

### Smart Contracts

**C-P0-1: ReentrancyGuard mismatch in UUPS proxy contracts**
- `contracts/src/sale/Sale.sol:15`, `contracts/src/vesting/VestingVault.sol:19`, `contracts/src/token/RedemptionManager.sol:20` -- use non-upgradeable `ReentrancyGuard` with UUPS proxies. Constructor runs on implementation, not proxy.
- Fix: Use `ReentrancyGuardUpgradeable` + call `__ReentrancyGuard_init()`.

**C-P0-2: DividendDistributor uses current balance instead of snapshot**
- `contracts/src/token/DividendDistributor.sol:70-73` -- `token.balanceOf(msg.sender)` at claim time vs `totalSupplySnapshot` at deposit time. Attacker can buy tokens, claim oversized dividend, sell.
- Fix: Implement ERC20Snapshot for per-address balance snapshots.

**C-P0-3: DividendDistributor uses unsafe transfer (no SafeERC20)**
- `contracts/src/token/DividendDistributor.sol:51,83` -- raw `transfer`/`transferFrom` calls. Some ERC20 tokens don't return bool.
- Fix: Use `SafeERC20` with `safeTransfer`/`safeTransferFrom`.

**C-P0-4: Compliance module bind/unbind has no access control**
- All compliance modules (CountryAllowModule, MaxBalanceModule, LockModule, etc.) -- `bindCompliance()` callable by anyone. Attacker can bind as compliance contract and corrupt module state.
- Fix: Add `onlyOwner` modifier to `bindCompliance()`/`unbindCompliance()`.

**C-P0-5: CiretaToken._update double-calls compliance.transferred() on forced transfers**
- `contracts/src/token/CiretaToken.sol:389-392,292` -- `_update()` calls `compliance.transferred()`, and `forcedTransfer()` also calls it. Double-counts in stateful modules like `MaxHolderCountModule`, corrupting holder count.
- Fix: Remove `compliance.transferred()` from `forcedTransfer()`.

**C-P0-6: MaxHolderCountModule holder count never decrements**
- `contracts/src/compliance/MaxHolderCountModule.sol:110-112` -- checks `balanceOf(from) == amount` but this is post-transfer, so it's the reduced balance. Should check `== 0`.
- Fix: Change to `IToken(token).balanceOf(from) == 0`.

### Security

**S-P0-1: `.env.backend` tracked in git with real encryption key**
- `.env.backend:3` contains `ENCRYPTION_KEY=yWxhJKJWvuveqmQuaPBcg2PJC32lFfYPPHDIq3EDBXY=` (valid Fernet key) and is in git history.
- Fix: `git rm --cached .env.backend`, rotate encryption key, re-encrypt all data, add to `.gitignore`.

**S-P0-2: `apps/launchpad/.env.production` tracked in git**
- Currently only public vars, but pattern will lead to secret leaks.
- Fix: Remove from git, add to `.gitignore`.

**S-P0-3: JWT fallback to hardcoded secret** (same as B-P0-5)

**S-P0-4: No server-side token invalidation** (same as B-P0-4)

---

## P1 -- HIGH ISSUES

### Backend

**B-P1-1: ABI loader crashes with opaque error if artifact missing**
- `apps/api/services/web3_token_service.py:31-35` -- bare `open()` with no existence check.
- Fix: Check `.exists()` first, raise helpful error.

**B-P1-2: Blocking synchronous Web3 calls inside async methods**
- `apps/api/services/web3_base_service.py:64-121`, `web3_token_service.py:85-101` -- `w3.eth.wait_for_transaction_receipt` blocks entire event loop.
- Fix: Use `asyncio.to_thread()` or async web3 provider.

**B-P1-3: float() precision loss in financial calculations**
- `sale_contribute_service.py:296`, `compliance_action_service.py:54,113`, `issuer_withdrawals.py:150` -- `int(float(amount) * 10**N)` loses precision.
- Fix: Use `int(Decimal(amount) * Decimal(10**N))`.

**B-P1-4: max_contribution check is per-transaction, not per-user cumulative**
- `sale_contribute_service.py:134-152` -- user can split contributions to exceed cap.
- Fix: Query `SUM(amount)` of existing contributions.

**B-P1-5: deploy_erc3643_token fallback address logic wrong**
- `web3_token_service.py:117-123` -- falls back to `receipt.contractAddress` which is None for function calls.
- Fix: Decode return data from the transaction call.

**B-P1-6: On-chain failures silently swallowed across all services**
- Multiple files -- DB state updated as if operation succeeded when on-chain call fails. DB/chain state divergence is compliance failure.
- Fix: Record failure status in audit log; flag for admin review.

### Frontend

**F-P1-1: React hooks called after early return (WILL CRASH)**
- `apps/launchpad/src/app/portfolio/redeem/[token]/page.tsx:19`, `claim/[token]/page.tsx:19` -- `useState` after conditional return violates Rules of Hooks.
- Fix: Move all hooks before any conditional returns.

**F-P1-2: 3-second API timeout too aggressive**
- `apps/admin/src/lib/api/client.ts:50`, `apps/launchpad/src/lib/api/client.ts:50` -- will abort deploy/compliance operations.
- Fix: Increase to 15-30s or make configurable.

**F-P1-3: Raw fetch with relative URL (wrong origin)**
- `apps/launchpad/src/app/portfolio/dividends/page.tsx:23`, `transactions/page.tsx:31`, `settings/notifications/page.tsx:40` -- relative paths hit Next.js server, not FastAPI backend.
- Fix: Use `apiFetch` from client module.

**F-P1-4: Hardcoded mock data in production admin page**
- `apps/admin/src/app/platform/users/page.tsx:18-22` -- `MOCK_USERS` array with fake emails.
- Fix: Wire to real API or flag as "coming soon".

**F-P1-5: OTC allocation uses raw fetch**
- `apps/admin/src/app/issuer/sales/[id]/otc/page.tsx:38` -- financial operation bypasses typed client.
- Fix: Create OTC repository function.

**F-P1-6: Platform settings uses raw fetch + localStorage**
- `apps/admin/src/app/platform/settings/page.tsx:14,17`
- Fix: Use repository pattern.

**F-P1-7: Report downloads use raw fetch + localStorage**
- `apps/admin/src/app/issuer/reports/page.tsx:13,18`
- Fix: Use repository pattern.

**F-P1-8: alert() used for compliance action feedback**
- `apps/admin/src/app/issuer/investors/[id]/page.tsx:50`
- Fix: Use toast notification.

**F-P1-9: Health readiness probe leaks DB error details**
- `apps/api/api/v1/endpoints/health.py:44` -- `str(e)` can leak host/port/driver info.
- Fix: Return generic "database unavailable" message.

**F-P1-10: Notification preferences update field names don't match model**
- `apps/api/api/v1/endpoints/notifications.py:131-148` -- schema fields (e.g. `email_investments`) don't match model fields (e.g. `email_investment_updates`). Preferences never actually update.
- Fix: Align schema and model field names.

**F-P1-11: Recovery logs endpoint returns ALL logs to any issuer**
- `apps/api/api/v1/endpoints/admin_compliance.py:283-319` -- uses `CurrentUserId` instead of `RequireIssuerOrAdmin`, no token_id filter by default.
- Fix: Add role check + filter to issuer's tokens.

**F-P1-12: OTC allocation attributes contribution to issuer instead of investor**
- `apps/api/api/v1/endpoints/sales.py:272-291` -- `contrib.user_id = user_id` uses issuer's ID.
- Fix: Add `investor_user_id` field or look up investor by wallet.

### Smart Contracts

**C-P1-1: CiretaTokenFactory.deployToken() has no access control**
- `contracts/src/platform/CiretaTokenFactory.sol:101` -- anyone can deploy tokens.
- Fix: Add `onlyOwner` or issuer registry check.

**C-P1-2: VestingVault missing `__UUPSUpgradeable_init()` call**
- `contracts/src/vesting/VestingVault.sol:62` -- same in Sale.sol, RedemptionManager.sol.
- Fix: Add init call.

**C-P1-3: Sale.sol `finalizeSale()` not protected by nonReentrant**
- `contracts/src/sale/Sale.sol:238-260` -- makes external token transfers without reentrancy guard.
- Fix: Add `nonReentrant`.

**C-P1-4: DividendDistributor claim() unbounded loop -- gas DoS**
- `contracts/src/token/DividendDistributor.sol:68-80` -- loops over all epochs. Will exceed gas limit after enough epochs.
- Fix: Track last-claimed epoch per holder.

**C-P1-5: RedemptionManager.fulfil() does not burn tokens**
- `contracts/src/token/RedemptionManager.sol:84-90` -- NatSpec says "tokens are burned" but no burn call.
- Fix: Add `IToken(token).burn(address(this), req.amount)`.

**C-P1-6: Sale contribution front-running risk**
- `contracts/src/sale/Sale.sol:176-204` -- no commit-reveal or slippage protection.
- Fix: Consider per-block limits or commit-reveal for large contributions.

### Security

**S-P1-1: PII fields not encrypted: `kyc_external_id`, `password_reset_token`**
- `apps/api/models/user.py:45,56` -- uses `String(255)` instead of `EncryptedString()`.
- Fix: Change to `EncryptedString()` + migration.

**S-P1-2: `onchain_id` stored unencrypted**
- `apps/api/models/user.py:52`, `models/recovery_log.py:29` -- links real users to on-chain identities.
- Fix: Evaluate threat model; consider `EncryptedString()`.

**S-P1-3: Logout is a no-op**
- `apps/api/services/auth_service.py:162-175` -- method body is `pass`.
- Fix: Implement short-lived token blacklist.

**S-P1-4: Audit log IP addresses stored in plaintext (GDPR)**
- `apps/api/models/audit_log.py:65` -- `String(45)` without encryption.
- Fix: Use `EncryptedString()` or hash.

**S-P1-5: No Dockerfile.api exists**
- Cannot build or deploy API container. Cannot verify container security posture.
- Fix: Create `Dockerfile.api` with multi-stage build, non-root user.

---

## P2 -- MEDIUM ISSUES

### Backend

**B-P2-1: Withdrawal on-chain failure silently returns success** -- `issuer_withdrawals.py:156-158`
**B-P2-2: Contribute notification failure silently swallowed** -- `sales.py:195`
**B-P2-3: PoR endpoint catches broad Exception** -- `tokens.py:163-175`
**B-P2-4: Token documents list endpoint is public (no auth)** -- `tokens.py:224-243`
**B-P2-5: Portfolio transactions offset parameter ignored** -- `portfolio.py:216`
**B-P2-6: Admin investors endpoint may expose encrypted wallet data** -- `admin_investors.py:71`

### Frontend

**F-P2-1: `as any` type casts** -- `issuer/investors/page.tsx:30`, `Footer.tsx:72`
**F-P2-2: 15+ silently swallowed catch blocks** -- `catch { /* TODO: toast */ }` across both apps
**F-P2-3: Dead document links (`href="#"`)** -- `project/[slug]/page.tsx:188`
**F-P2-4: Hardcoded marketing stats** -- `launchpad/page.tsx:16-19`
**F-P2-5: Hardcoded date** -- `account/page.tsx:109`
**F-P2-6: Hardcoded zero values in admin dashboard** -- `issuer/overview/page.tsx:43-44`
**F-P2-7: Issuers page sets `tokens: 0, totalRaised: 0` for all** -- `platform/issuers/page.tsx:23`
**F-P2-8: Inconsistent auth token access** -- some pages use `getAccessToken()`, others `localStorage`
**F-P2-9: Unsafe type cast** -- `invest/[slug]/page.tsx:84-85`
**F-P2-10: Dark theme on light background** -- `portfolio/dividends/page.tsx:35`, transactions, settings pages
**F-P2-11: OTC page dark theme inconsistency** -- `issuer/sales/[id]/otc/page.tsx`
**F-P2-12: Recovery page dark theme inconsistency** -- `issuer/compliance/recovery/page.tsx`
**F-P2-13: Non-null assertion without null check** -- `verify/corporate/page.tsx:133`
**F-P2-14: IP spoofing via X-Forwarded-For** -- `kyc.py:108-112`, `admin_issuers.py:39-44`, `admin_compliance.py:29-34`

### Smart Contracts

**C-P2-1: `_compute_identity_address` uses SHA-256 instead of Keccak-256** -- `web3_identity_service.py:74-83`
**C-P2-2: callModuleFunction allows arbitrary external calls** -- `ModularCompliance.sol:112-120`
**C-P2-3: OTC/on-platform contribution collision** -- `Sale.sol:222` flips `isOtc` flag, can lock refunds
**C-P2-4: Missing feeManager zero-address check** -- `Sale.sol:106`
**C-P2-5: setName/setSymbol emit events but don't change state** -- `CiretaToken.sol:135-143`
**C-P2-6: ChainlinkPoRChecker fail-open design** -- `ChainlinkPoRChecker.sol:160-163`
**C-P2-7: DividendDistributor deposit() has no access control** -- `DividendDistributor.sol:46`
**C-P2-8: Duplicate contracts with different names** -- MaxOwnershipModule/MaxBalanceModule, ConditionalTransferModule/TransferRestrictModule, TimeTransfersLimitModule/TimeLockedTransferModule

### Security

**S-P2-1: CORS `allow_methods=["*"]` and `allow_headers=["*"]`** -- `main.py:55-56`
**S-P2-2: Double base64 encoding in EncryptedString** -- `encrypted_types.py:46-47`
**S-P2-3: Password complexity not enforced beyond length** -- `schemas/auth.py:8`
**S-P2-4: EncryptedString silently falls back to plaintext** -- `encrypted_types.py:42-44`
**S-P2-5: EncryptedString silently returns raw value on decryption failure** -- `encrypted_types.py:62-64`
**S-P2-6: Rate limiter is in-memory only** -- `rate_limit.py`
**S-P2-7: `.env` root file contains weak placeholder secret** -- `.env:14`
**S-P2-8: SaleService diamond inheritance without super().__init__** -- `sale_service.py:16-25`
**S-P2-9: web3_service singleton created at module import time** -- `web3_service.py:15`

---

## TODO/FIXME/HACK Comments (Incomplete Code)

| File | Comment |
|------|---------|
| `apps/admin/src/app/platform/issuers/page.tsx:72` | `/* TODO: toast */` |
| `apps/admin/src/app/issuer/compliance/page.tsx:66` | `/* TODO: toast */` |
| `apps/admin/src/app/issuer/tokens/[id]/page.tsx:51` | `/* TODO: toast */` |
| `apps/launchpad/src/app/portfolio/redeem/[token]/page.tsx:43` | `/* TODO: toast */` |
| `apps/launchpad/src/app/portfolio/claim/[token]/page.tsx:43` | `/* TODO: toast */` |
| `apps/api/api/v1/endpoints/portfolio.py:143` | `TODO: Web3 integration` |
| `apps/api/api/v1/endpoints/portfolio.py:216` | `pagination TODO` |
| `apps/api/services/auth_service.py:135` | `TODO: Store old token hash in Redis blacklist` |
| `apps/api/services/auth_service.py:170` | `TODO: Implement Redis-based token blacklist` |
| `apps/api/services/auth_service.py:173` | `TODO: Store token hash in Redis blacklist` |

---

## What Passed Inspection

### Backend
- HMAC-SHA256 webhook validation (timing-safe `compare_digest`)
- Brute force protection on login
- Email enumeration prevention (forgot_password always returns 200)
- Refresh token cookie flags (httpOnly, secure, strict sameSite)
- Pagination bounds validation (ge=1, le=100)
- No SQL injection (all SQLAlchemy ORM, parameterized)
- UUID path parameter validation
- Admin role enforcement on CRUD operations
- Pydantic input validation on all request bodies
- Password hashing with bcrypt
- Wallet address checksumming
- Token symbol uniqueness enforcement
- Transaction hash uniqueness check

### Frontend
- Repository pattern used in most API calls
- TypeScript strict mode enabled
- CSS variables for colors (mostly)
- Atomic design structure

### Smart Contracts
- 37/37 tests passing
- UUPS upgradeability pattern used
- ERC-3643 compliance framework in place
- Proper use of modifiers (whenNotPaused, onlyOwner, onlyAgent)
- Events emitted for state changes

### Security
- `.gitignore` covers `.env`, `.env.local`, `node_modules`, etc.
- Config validation blocks empty secrets in production/staging
- OWASP security headers middleware present
- Rate limiting middleware present (though in-memory only)

---

## Smart Contract Test Coverage Gap

**Contracts with NO tests:**
IssuerRegistry, PlatformFeeManager, CiretaSaleFactory, IdentityRegistry, IdentityRegistryStorage, TrustedIssuersRegistry, ClaimTopicsRegistry, MaxBalanceModule, MaxHolderCountModule, LockModule, TransferRestrictModule, WhitelistModule, TimeLockedTransferModule, MaxOwnershipModule, ConditionalTransferModule, TimeTransfersLimitModule

**Estimated line coverage:** <25%

---

## Top 10 Priorities (Fix Order)

1. **S-P0-1:** Remove `.env.backend` from git, rotate encryption key
2. **B-P0-5 / S-P0-3:** Remove all `or "dev-secret"` JWT fallbacks
3. **B-P0-4 / S-P0-4:** Implement Redis token blacklist
4. **B-P0-2:** Add DB-level locking on concurrent contributions
5. **C-P0-2:** Fix DividendDistributor snapshot vulnerability
6. **C-P0-4:** Add access control to compliance module bind/unbind
7. **B-P0-7:** Implement withdrawal balance tracking
8. **F-P1-1:** Fix React hooks-after-return crash in redeem/claim pages
9. **B-P0-1:** Implement `issue_kyc_claims()` method
10. **F-P0-1:** Remove localStorage JWT storage in admin

---

*Generated by Claude Opus 4.6 -- 2026-03-23*
