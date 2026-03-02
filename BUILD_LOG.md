
---

## Sprint 5 — Spec Compliance Closure (2026-03-02)

### Auth Fast-Path Fix
- `AuthContext.tsx`: Fast-path `localStorage.getItem("token")` → `/me` before trying refresh cookie
- `account/page.tsx`: Moved all hooks before conditional returns (React hooks rules)
- `auth.repository.ts`: `refresh_token` made optional (now httpOnly cookie-based)

### Admin Fixes
- `next.config.ts`: Disabled `typedRoutes` (experimental, causing false TS errors on dynamic hrefs)
- `StatCard.tsx`: `react-countup` now dynamic import with `ssr: false` (prevents hydration crash)

### New Pages
- `apps/launchpad/src/app/forgot-password/page.tsx` — Email submission + success state
- `apps/launchpad/src/app/reset-password/page.tsx` — Token from query param, password reset form

### File Size Splits (all files now ≤300 LOC)
| File | Before | After | Extracted To |
|------|--------|-------|-------------|
| `admin/tokens/new/page.tsx` | 342 | 94 | `admin/src/lib/tokenFormSteps.tsx` |
| `admin/analytics/page.tsx` | 317 | 50 | `admin/src/lib/analyticsCharts.tsx` |
| `launchpad/page.tsx` | 309 | 126 | `organisms/HeroSection.tsx` + `organisms/ComplianceFeatures.tsx` |
| `admin_compliance.py` | 406 | 283 | `admin_operations.py` (redemptions + dividends) |
| `kyc_service.py` | 320 | 297 | `core/sumsub_crypto.py` (HMAC sig validation) |

### Ruff Fixes
- `portfolio.py`: ARG001 noqa on `/dividends` placeholder endpoint
- `workers/tasks.py`: ARG001 noqa on all arq `ctx: dict` params
- `router.py`, `kyc_service.py`: Import block ordering fixed

### New Backend File
- `apps/api/core/sumsub_crypto.py` — `validate_sumsub_signature()` extracted from KYCService

### Final Audit (2026-03-02)
- Ruff: ✅ clean (33 ARG002 in tests acceptable)
- Pytest: ✅ 108/108
- TS Launchpad: ✅
- TS Admin: ✅
- Vitest: ✅ 11/11
- Hardhat: ✅ 14/14
- MOCK_ references: ✅ 0
- Files >300 LOC: ✅ 0

---

## Phase 3 — Infrastructure & Testing (2026-03-02)

### 1. The Graph Subgraph
- Created `subgraph/` directory at project root
- `package.json` with graph-cli 0.71.0, graph-ts 0.32.0
- `schema.graphql` with entities: Transfer, FreezeEvent, SaleContribution, DividendClaim
- `subgraph.yaml` with dataSources for CiretaToken, Sale, DividendDistributor on Base network
- `src/mappings.ts` with handleTransfer, handleFreeze, handleContributed, handleClaimed
- ABIs: CiretaToken.json, Sale.json, DividendDistributor.json

### 2. Turborepo + pnpm
- `pnpm-workspace.yaml` — packages: apps/*, contracts, subgraph
- `turbo.json` — pipeline for build/test/lint/typecheck/dev/clean
- Root `package.json` — added turbo ^2.0.0, updated scripts, packageManager: pnpm@9.15.0

### 3. ONCHAINID Wiring
- `packages/common/core/config.py` — added identity_factory_address, identity_registry_address
- `.env.example` — added IDENTITY_FACTORY_ADDRESS, IDENTITY_REGISTRY_ADDRESS
- `apps/api/services/web3_identity_service.py` — added deploy_identity() method using createIdentityWithSalt
- `apps/api/workers/tasks.py` — task_deploy_onchainid now calls web3_service.deploy_identity()
- `contracts/scripts/deployIdentity.ts` — Hardhat script with --network and --wallet flags

### 4. Chainlink PoR Compliance Module
- `contracts/src/compliance/ChainlinkPoRChecker.sol` — IModule impl with AggregatorV3Interface
  - setFeed(), removeFeed(), moduleCheck() with staleness + zero checks
  - MAX_STALENESS = 24 hours
- `contracts/src/mocks/MockAggregatorV3.sol` — configurable answer + updatedAt
- `contracts/test/ChainlinkPoRChecker.test.ts` — 4 tests:
  - valid feed allows transfer
  - stale data reverts
  - zero answer reverts
  - only owner can setFeed

### 5. DividendDistributor Tests
- `contracts/src/mocks/MockERC20.sol` — simple ERC20 mock with mint/burn
- `contracts/test/DividendDistributor.test.ts` — 8 tests:
  - depositEpoch emits event
  - correct claim amount
  - no double-claim
  - pro-rata 2 holders
  - epoch totalAmount tracking
  - multi-epoch claim
  - revert no balance
  - revert zero deposit

### Audit Results
- Hardhat: ✅ 27/27 passing (14 existing + 5 ChainlinkPoRChecker + 8 DividendDistributor)
- Python imports: ✅ clean
- No compilation errors
