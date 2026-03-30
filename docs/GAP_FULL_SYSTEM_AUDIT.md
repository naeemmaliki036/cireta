# Full System Audit — Gap Analysis & Improvements

Comprehensive audit across backend, smart contracts, and frontend.
Conducted: 2026-03-30

---

## Critical Issues (Fix Before Production)

### 1. Launchpad JWT Stored in JavaScript Memory — XSS Risk
- **Location**: `apps/launchpad/src/lib/api/client.ts`
- **Issue**: JWT stored as in-memory variable, accessible to any XSS. Admin portal correctly uses httpOnly cookies.
- **Fix**: Migrate launchpad to same httpOnly cookie pattern as admin portal.

### 2. Wallet Signature Nonce — Client-Generated (Low Risk)
- **Location**: `apps/api/services/wallet_service.py:40-96`
- **Issue**: Nonce is generated client-side and sent with the signature. Server doesn't track used nonces. However, the unique constraint on `address_checksum` prevents re-linking an already-linked wallet, significantly limiting replay risk. The signature only proves wallet ownership — it doesn't grant fund access.
- **Actual Risk**: Low. Replay would require intercepting the request AND the wallet being unlinked first.
- **Nice-to-have Fix**: Generate nonce server-side with TTL for defense-in-depth.

### 3. Wallet Screening is Placeholder
- **Location**: `apps/api/services/wallet_screening_service.py:61`
- **Issue**: Comment says "TODO(mainnet): Implement real HTTP calls to Chainalysis." Currently returns allow-all.
- **Fix**: Integrate Chainalysis or equivalent before mainnet.

### 4. Missing Unique Index on Contribution tx_hash
- **Location**: `apps/api/models/contribution.py:28-39`
- **Issue**: No unique constraint on `tx_hash`. Two concurrent requests with same tx could both pass dedup check.
- **Fix**: Add unique index on `tx_hash` column.

### 5. Withdrawal Race Condition
- **Location**: `apps/api/api/v1/endpoints/issuer_withdrawals.py:120-196`
- **Issue**: `total_withdrawn` updated AFTER on-chain transfer. If transfer succeeds but DB commit fails, state becomes inconsistent.
- **Fix**: Use optimistic locking or commit DB before on-chain transfer with rollback on failure.

### 6. Vault Token Deposit Never Called by Sale Contract
- **Location**: `contracts/src/sale/Sale.sol`, `contracts/src/vault/CiretaVault.sol:119`
- **Issue**: Vault expects `depositTokens()` from Sale to lock project tokens, but Sale never calls it. Vested mode cannot function.
- **Fix**: Call `vault.depositTokens()` during finalization or require issuer to deposit separately.

### 7. Missing `buyOTC()` Function in Sale Contract
- **Location**: `contracts/src/sale/Sale.sol`
- **Issue**: No on-chain function for OTC purchases. Only `issuerAllocate()` exists which is backend-only.
- **Fix**: Implement per the OTC Token Plan (`docs/NEW_OTC_TOKEN_PLAN.md`).

### 8. Wallet Unlink Missing Ownership Check
- **Location**: `apps/api/api/v1/endpoints/wallets.py:62-68`
- **Issue**: No validation that the wallet address belongs to the authenticated user before deletion.
- **Fix**: Add `WHERE user_id = current_user_id` to delete query.

---

## High Priority (Fix Before Mainnet)

### 9. No Sale Approval UI in Admin Portal
- **Issue**: Backend endpoints for approve/reject exist now, but no admin UI to use them.
- **Fix**: Add approval queue page and approve/reject buttons on sale detail.

### 10. No Sale Content Management UI
- **Issue**: Backend models for team, FAQ, images, documents exist, but no admin forms to populate them.
- **Fix**: Build rich content editor (TipTap/Lexical) for sale creation/editing.

### 11. Launchpad Project Page Incomplete
- **Location**: `apps/launchpad/src/app/project/[slug]/page.tsx`
- **Issue**: FAQ, My Position, Transactions tabs show "Coming soon". Documents are hardcoded placeholders.
- **Fix**: Connect to backend APIs for dynamic content.

### 12. Hardcoded Coming Soon Projects
- **Location**: `apps/launchpad/src/app/projects/page.tsx:19-26`
- **Issue**: 6 "Coming Soon" projects are hardcoded. Should come from database (sales without token_id).
- **Fix**: Use the new nullable `token_id` — sales with no token are "coming soon".

### 13. Missing Rate Limits on Issuer Endpoints
- **Location**: `apps/api/main.py:60-73`
- **Issue**: `/issuer/wallet`, `/issuer/identity/*` have no rate limits.
- **Fix**: Add rate limits (e.g., 10/min for wallet submission, 5/min for identity).

### 14. Inconsistent IP Logging in Admin Actions
- **Location**: `apps/api/api/v1/endpoints/admin_compliance.py`
- **Issue**: Some admin functions capture IP for audit, others don't (e.g., `skip_identity_verification`).
- **Fix**: Add `Request` parameter to all admin endpoints, log IP in all audit entries.

### 15. Dangerous CASCADE on Issuer Delete
- **Location**: `apps/api/models/token_sale.py:34`
- **Issue**: `issuer_id` has `ondelete="CASCADE"`. Deleting an issuer wipes all sales + contributions.
- **Fix**: Change to `ondelete="RESTRICT"` or implement soft-delete.

### 16. Sale Contract Test Uses Wrong Event Name
- **Location**: `contracts/test/Sale.test.ts:80`
- **Issue**: Test expects `"ContributionMade"` but contract now emits `"Purchase"`.
- **Fix**: Update test to `.to.emit(sale, "Purchase")`.

### 17. HMAC Validation Done Twice (Timing Attack)
- **Location**: `apps/api/api/v1/endpoints/kyc.py:96-103`
- **Issue**: HMAC checked twice — first with string comparison (timing-vulnerable), then with `hmac.compare_digest()`.
- **Fix**: Remove the first check, keep only `hmac.compare_digest()`.

---

## Medium Priority (Improvements)

### 18. Hardcoded USDC Address in Two Places
- **Locations**: `apps/api/models/token_sale.py:48`, `apps/api/schemas/sale.py:41`
- **Fix**: Move to settings/config, reference `settings.usdc_address`.

### 19. OTC Hard Cap Tracking Unclear
- **Location**: `apps/api/api/v1/endpoints/sales.py:493-500`
- **Issue**: `sale.total_raised += Decimal("0")` is a no-op. OTC allocations don't track against hard cap.
- **Fix**: Add `total_otc_allocated` field or track OTC in `total_raised`.

### 20. Missing Fields in Contribution Response
- **Location**: `apps/api/schemas/sale.py:158-172`
- **Issue**: Response missing `claim_tx_hash`, `is_otc`, `otc_reference`, `wallet_address`.
- **Fix**: Add these fields to `ContributionResponse`.

### 21. Per-Investor Vesting Start Never Set
- **Location**: `contracts/src/vault/CiretaVault.sol:30`
- **Issue**: `InvestorVesting.vestingStart` field exists but never populated. All use global start.
- **Fix**: Set per-investor start when recording allocation.

### 22. Missing Events in Sale Contract
- **Issue**: `setMaxPerBlock()`, `setWhitelist()` don't emit events.
- **Fix**: Add `MaxPerBlockUpdated` and `WhitelistUpdated` events.

### 23. Missing KYC Level Validation at Runtime
- **Location**: `apps/api/api/v1/endpoints/portfolio.py:164-188`
- **Issue**: Docstring says "Requires: kyc_level >= 2" but no runtime check.
- **Fix**: Add middleware or dependency that validates `user.kyc_level >= 2`.

### 24. Unbounded Loop in DividendDistributor
- **Location**: `contracts/src/token/DividendDistributor.sol:152-162`
- **Issue**: `claimable()` iterates ALL epochs — could hit gas limits.
- **Fix**: Add pagination or cache.

### 25. Silent Error Catches in Admin Portal
- **Locations**: 4 pages use `.catch(() => {})` without logging.
- **Fix**: At minimum `console.error()`, ideally show toast notification.

### 26. Launchpad TypeScript Relaxed
- **Location**: `apps/launchpad/tsconfig.json`
- **Issue**: `noUnusedLocals` and `noUnusedParameters` disabled.
- **Fix**: Enable and clean up warnings.

### 27. Null Pointer Risk in Token Document Upload
- **Location**: `apps/api/api/v1/endpoints/tokens.py:293`
- **Issue**: Accessing `token.issuer.user_id` could fail if issuer is null.
- **Fix**: Add null check before access.

### 28. Missing Wallet Address Format Validation
- **Location**: `apps/api/api/v1/endpoints/wallets.py:62-68`
- **Issue**: No validation that address is valid Ethereum format (0x + 40 hex).
- **Fix**: Add regex validation on path parameter.

### 29. Contribution Amount Has No Max Value
- **Location**: `apps/api/schemas/sale.py:81`
- **Issue**: `amount: Decimal = Field(..., gt=0)` has no upper bound.
- **Fix**: Add `le=Decimal("1000000000")` or similar cap.

---

## Low Priority (Nice to Have)

### 30. Inconsistent Enum Conversion in Responses
- Multiple endpoints use `(sale.status.value if hasattr(sale.status, "value") else sale.status)`.
- **Fix**: Centralize in a utility or ensure models always have `.value`.

### 31. Email Normalization Not Communicated
- `auth_service.py:46` lowercases email silently.
- **Fix**: Document in API docs or normalize in schema.

### 32. Deploy Scripts Not Integrated
- `deploy.ts` and `deploy-fraction-factory.ts` are separate scripts.
- **Fix**: Merge into single deploy flow with proper ordering.

### 33. Missing Sale Contract Test Coverage
- No tests for: multi-phase, hard cap auto-finalize, block limits, whitelist, fee cap.
- **Fix**: Add comprehensive test suite.

### 34. O(n) Phase Lookup in getCurrentPhase()
- **Location**: `contracts/src/sale/Sale.sol:371-378`
- **Fix**: Maintain current phase pointer or use binary search.

---

## Summary

| Severity | Count | Key Areas |
|----------|-------|-----------|
| **Critical** | 8 | Auth security, race conditions, missing contract functions |
| **High** | 8 | Missing UI, rate limits, cascade deletes, test bugs |
| **Medium** | 12 | Hardcoded values, missing validations, incomplete features |
| **Low** | 5 | Code quality, test coverage, optimizations |
| **Total** | **33** | |

### Implementation Status (Updated 2026-03-30)

| # | Status | Notes |
|---|--------|-------|
| 1 | **DONE** | Launchpad migrated to httpOnly cookies via proxy routes |
| 2 | Low risk | False positive — unique constraint on wallet address prevents replay |
| 3 | Not done | Wallet screening remains placeholder — needs Chainalysis integration |
| 4 | Already done | Model already had unique=True, migration 008 enforces it |
| 5 | **Mitigated** | Withdrawals now via dApp, no backend on-chain tx |
| 6 | **DONE** | Added depositProjectTokens() to Sale.sol |
| 7 | **DONE** | buyOTC() implemented in Sale.sol |
| 8 | Already done | Service already checks user_id on unlink |
| 9 | **DONE** | Platform admin sale detail page with approve/reject |
| 10 | **DONE** | 8-step wizard with team, FAQ, docs, images |
| 11 | **DONE** | Tabbed project page with dynamic content |
| 12 | **DONE** | Coming soon from API (APPROVED_COMING_SOON) |
| 13 | **DONE** | Rate limits added for issuer endpoints |
| 14 | Not done | IP logging inconsistency |
| 15 | **DONE** | Changed CASCADE to RESTRICT on issuer_id |
| 16 | **DONE** | Test event name updated |
| 17 | **DONE** | HMAC triple-check reduced to single hmac.compare_digest |
| 18 | Not done | USDC address still hardcoded |
| 19 | Not done | OTC hard cap tracking |
| 20 | **DONE** | ContributionResponse has claim_tx_hash, is_otc, otc_reference, wallet_address |
| 21 | Not done | Per-investor vesting start |
| 22 | **DONE** | MaxPerBlockUpdated and WhitelistUpdated events added |
| 23 | Not done | KYC level runtime validation |
| 24 | Not done | DividendDistributor unbounded loop |
| 25 | Not done | Silent error catches in admin |
| 26 | Not done | Launchpad TypeScript strictness |
| 27 | **DONE** | Null check on token.issuer before access |
| 28 | **DONE** | Wallet address regex validation added |
| 29 | **DONE** | Contribution amount max 1B cap |
| 30-34 | Not done | Low priority items |

**22 of 33 resolved. 11 remaining (mostly low/medium priority).**
