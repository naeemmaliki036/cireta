# PRODUCTION READINESS AUDIT — Cireta RWA Launchpad

**Date:** 2026-03-24
**Auditor:** Zyda (Automated Agent Audit)
**Scope:** Full codebase at `~/projects/cireta` (commit `8c798b9`)

---

## 1. Executive Summary

**Cireta is NOT production-ready. It is a well-structured development prototype.** If deployed today on mainnet with real money, the following would happen: KYC would return mock tokens (Sumsub credentials are `placeholder`), wallet screening would approve ALL wallets including sanctioned ones (stub provider returns `risk_score: 0.0` always), no smart contracts are deployed on any chain (deployment file is empty JSON), the frontend factory/sale addresses would be `null`, the arq background worker (event listener, chain sync) requires Redis and a separate process that nothing starts automatically, and ONCHAINID deployment would silently skip because `DEPLOYER_PRIVATE_KEY` is empty. The codebase has solid architecture and real on-chain integration code paths — but every external integration is either stubbed, credential-less, or undeployed. **Production readiness score: 2/10.**

---

## 2. Mock/Stub Inventory

Every mock, stub, fake, placeholder, and non-functional path in production code (excluding test files):

### 2.1 — Explicit Stubs/Placeholders

| File | Line | What It Does |
|------|------|-------------|
| `apps/api/services/wallet_screening_service.py` | 22-37 | **CRITICAL.** `WalletScreeningProvider.screen()` is a STUB. Returns `{"risk_score": 0.0, "sanctioned": False}` for ALL addresses. Every wallet passes screening. No Chainalysis/Elliptic integration exists. |
| `apps/api/services/kyc_service.py` | 66-68 | `_is_dev_mode()` returns `True` when Sumsub token is `placeholder`, `test`, or empty. Current `.env.backend` has `SUMSUB_APP_TOKEN=placeholder`. |
| `apps/api/services/kyc_service.py` | 109-110 | KYC initiate returns **mock token** `dev-token-{user_id}` in dev mode. Sumsub SDK will not work with this. |
| `apps/api/services/kyc_service.py` | 347-348 | Corporate KYB also returns mock token in dev mode. |
| `apps/api/services/kyc_service.py` | 288-291 | `_issue_onchain_claims()` **skips entirely** in dev mode — logs and returns. No ONCHAINID deployed. |
| `apps/api/workers/tasks.py` | 61-63 | `task_deploy_onchainid` skips if `DEPLOYER_PRIVATE_KEY` not set — currently empty. |
| `apps/api/workers/tasks.py` | 65-66 | Same task skips if `IDENTITY_FACTORY_ADDRESS` not set — currently empty. |
| `apps/api/workers/tasks.py` | 84-85 | `task_register_wallet_on_chain` **skips entirely in development mode** — just logs. |
| `apps/api/workers/tasks.py` | 93-100 | Same task has `except AttributeError` fallback that just logs "Would register..." — `register_identity` not implemented. |
| `apps/api/workers/tasks.py` | 150-152 | `task_index_contribution` on exception: "Could not verify tx on-chain (dev mode?)" — **marks contribution as confirmed anyway**. |
| `apps/api/api/v1/endpoints/tokens.py` | 134-143 | Proof of Reserve endpoint returns **mock data** when no Chainlink feed configured: `verified_reserve = total_supply`, `reserve_ratio = 1.0`, `is_live = False`. |
| `.env.backend` | 10-11 | `SUMSUB_APP_TOKEN=placeholder`, `SUMSUB_SECRET_KEY=placeholder` — triggers dev mode everywhere. |
| `.env` | 23-28 | `DEPLOYER_PRIVATE_KEY=`, `IDENTITY_FACTORY_ADDRESS=`, `IDENTITY_REGISTRY_ADDRESS=` — all empty. |
| `apps/launchpad/.env.production` | 3 | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=placeholder` — WalletConnect will not work. |
| `contracts/deployments/base-sepolia.json` | 1 | Contains only `{"_comment": "Populated by: npx hardhat run scripts/deploy.ts --network baseSepolia"}` — **NO contracts deployed**. |

### 2.2 — Silent Error Swallowing

| File | Line | What It Does |
|------|------|-------------|
| `apps/api/core/web3_provider.py` | 135-136 | `except Exception: pass` — silently swallows RPC health check failure for primary provider. |
| `apps/api/core/web3_provider.py` | 143-144 | `except Exception: pass` — silently swallows fallback RPC health check failure. |
| `apps/api/services/event_listener_service.py` | 263-264 | `except Exception: pass` — silently swallows errors during event processing. |
| `apps/api/services/kyc_service.py` | 200-201, 459-460 | `except ValueError: pass` — silently ignores UUID parse failures. |

### 2.3 — Dev-Mode Bypasses

| File | Line | Bypass |
|------|------|--------|
| `apps/api/services/kyc_service.py` | 109 | If `_is_dev_mode(settings)` → mock KYC token, no Sumsub call. |
| `apps/api/services/kyc_service.py` | 288 | If `_is_dev_mode(settings)` → skip all on-chain identity deployment. |
| `apps/api/services/kyc_service.py` | 347 | If `_is_dev_mode(settings)` → mock corporate KYB token. |
| `apps/api/workers/tasks.py` | 84 | If `environment == "development"` → skip on-chain identity registry. |
| `apps/api/workers/tasks.py` | 150 | On chain verification exception → auto-confirm contribution anyway. |
| `apps/api/main.py` | 41-43 | Swagger/OpenAPI docs exposed in development mode. |

### 2.4 — Hardcoded Values

| File | Value | Issue |
|------|-------|-------|
| `.env` | `JWT_SECRET_KEY=dev-only-k8f3j2m9x7q1w4p6r0t5v8b3n2c7y1a9` | **Hardcoded JWT secret** in committed `.env` file. |
| `.env.backend` | `JWT_SECRET_KEY=local-dev-secret-key-cireta-2026-change-me-min32chars` | Same issue. |
| `packages/common/config/defaults.py` | `DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/cireta` | Default DB creds in code. |
| `apps/launchpad/src/lib/contracts/addresses.ts` | `BASE_SEPOLIA.usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"` | Hardcoded Sepolia USDC address (acceptable for testnet). |
| `apps/launchpad/src/lib/contracts/addresses.ts` | `BASE_MAINNET.usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"` | Hardcoded mainnet USDC (correct address, acceptable). |

---

## 3. Data Flow Reality

### Flow A: User Registration → KYC → ONCHAINID

| Step | Status | Detail |
|------|--------|--------|
| 1. Register endpoint | ✅ REAL | Creates user in PostgreSQL, hashes password with bcrypt, validates email. |
| 2. KYC initiation | ❌ FAKE | `_is_dev_mode()` returns True (credentials = `placeholder`). Returns mock token. No Sumsub API call. |
| 3. Sumsub webhook HMAC | ✅ REAL CODE, ❌ FAKE CREDENTIALS | `validate_sumsub_signature()` is properly implemented with HMAC-SHA256. But `sumsub_secret_key=placeholder` means validation against wrong key. |
| 4. ONCHAINID deployment | ❌ FAKE | `_issue_onchain_claims()` skips in dev mode. Even if production: `DEPLOYER_PRIVATE_KEY=empty`, `IDENTITY_FACTORY_ADDRESS=empty`. |
| 5. Claim signing | ❌ UNREACHABLE | `Web3IdentityService` has real signing code, but it's never reached due to step 4 failing. |
| 6. Identity registration | ❌ FAKE | `task_register_wallet_on_chain` explicitly skips in development mode with a log message. Has `except AttributeError` fallback suggesting `register_identity` may not be implemented. |

**Verdict: Registration is real. Everything after that is fake.**

### Flow B: Create Token → Deploy Sale → Contribute → Claim

| Step | Status | Detail |
|------|--------|--------|
| 1. Token creation (DB) | ✅ REAL | Backend creates token record in PostgreSQL. |
| 2. Token deployment (on-chain) | ⚠️ REAL CODE, ❌ NO CONTRACTS | `deploy_contract()` calls `Web3BaseService.execute_contract()` which makes real on-chain calls. But `TOKEN_FACTORY_ADDRESS=empty` — no factory deployed. |
| 3. Sale creation | ✅ REAL API | Backend has sale creation endpoints. No sale creation UI in admin panel — deploy-script only. |
| 4. USDC approval (frontend) | ✅ REAL | Frontend uses `useWriteContract()` with real ERC20 approve call via wagmi. |
| 5. Sale contribution (frontend) | ✅ REAL CODE, ❌ NULL ADDRESS | Frontend calls `Sale.contribute()` via `useWriteContract()`. But sale contract address comes from backend API — which would be null since no contracts deployed. |
| 6. Event listener | ❌ NOT RUNNING | Requires `arq` worker process started separately (`arq apps.api.workers.worker.WorkerSettings`). Nothing in Dockerfile or docker-compose starts it. |
| 7. Contribution → DB | ⚠️ CONDITIONAL | `task_index_contribution` checks on-chain receipt. On failure: auto-confirms anyway ("dev mode?"). |
| 8. Portfolio display | ✅ REAL | Reads from PostgreSQL via SQLAlchemy. No stubs. |
| 9. Token claim (frontend) | ✅ REAL CODE | `useWriteContract()` calls `Sale.claimTokens()`. Needs deployed contract. |

**Verdict: DB operations are real. On-chain operations have real code but no deployed contracts. Event listener is dead.**

### Flow C: Admin Operations

| Step | Status | Detail |
|------|--------|--------|
| 1. Admin login | ✅ REAL | Admin panel has login page → `/api/auth/login` → JWT auth. |
| 2. Create token/project | ⚠️ PARTIAL | Admin panel has token detail page but token creation appears to be API-only (no "create new token" UI found in admin). |
| 3. View investors | ✅ REAL | Admin endpoints query PostgreSQL. Real data. |
| 4. Freeze wallet | ⚠️ DB-ONLY | `ComplianceService.freeze_address()` writes to `audit_logs` table. Does NOT call on-chain `freezePartialTokens()` — it's a DB audit trail only. |
| 5. Approve redemption | ⚠️ DB-ONLY | `RedemptionService` manages DB records. No on-chain burn/transfer. |
| 6. Deposit dividends | ⚠️ HYBRID | Records in DB. Attempts to read on-chain epoch. Dividend deposit must be done on-chain first by issuer — backend just records it. |

**Verdict: Admin can log in and view data. Compliance actions are DB-only, not on-chain.**

### Flow D: Wallet Screening

| Step | Status | Detail |
|------|--------|--------|
| 1. Wallet linked → screening | ❌ STUB | `WalletScreeningProvider.screen()` always returns `risk_score=0.0, sanctioned=False`. |
| 2. Default provider | ❌ STUB | The base class IS the stub. No subclass with real provider exists. |
| 3. Real provider integration | ❌ NONE | No Chainalysis, Elliptic, or any real screening provider code exists anywhere. |
| 4. Re-screening task | ❌ STUB | `task_rescreen_wallets` calls the same stub provider. All wallets pass forever. |

**Verdict: Wallet screening is 100% fake. A sanctioned OFAC wallet would pass screening.**

### Flow E: Event Listener / Chain Sync

| Step | Status | Detail |
|------|--------|--------|
| 1. How is it started? | ❌ NOT STARTED | Requires: `arq apps.api.workers.worker.WorkerSettings`. Not in Dockerfile. Not in docker-compose. Not in start.py. Must be manually started as a separate process. |
| 2. Redis config | ⚠️ CONFIGURED | `REDIS_URL=redis://localhost:6379/0` in env. Redis must be running. |
| 3. Redis down? | ❌ BREAKS | arq worker will crash on startup if Redis is unavailable. No graceful degradation. |
| 4. Ever run against real chain? | ❌ NO EVIDENCE | No deployed contracts, no saved block numbers, no event processing logs. |

**Verdict: Event listener has never run in production. It's a separate process that nothing orchestrates.**

---

## 4. Infrastructure Gaps

### What's Missing

| Component | Status | Detail |
|-----------|--------|--------|
| **Dockerfile.api** | ⚠️ EXISTS | Builds but does NOT run migrations, does NOT start arq worker. Single process only. |
| **docker-compose.yml** | ⚠️ PARTIAL | Starts API + PostgreSQL + Redis. Does NOT start arq worker. References `Dockerfile` (not `Dockerfile.api`). Missing frontend services. |
| **Database migrations** | ⚠️ MANUAL | Alembic configured at `infra/alembic/`. 9 migration files exist. NOT run automatically on deploy — must be run manually. |
| **arq worker** | ❌ MISSING | No container/service/process definition for the background worker. |
| **Frontend deployment** | ⚠️ RAILWAY CONFIG | `railway.launchpad.json` and `railway.admin.json` exist. `Dockerfile.launchpad` and `Dockerfile.admin` exist. |
| **Deployment guide** | ❌ MISSING | No `DEPLOY.md` or deployment instructions found. |
| **Monitoring** | ❌ MISSING | No Sentry, Datadog, or alerting configured. |
| **SSL/TLS** | ❌ NOT CONFIGURED | No cert management in docker-compose or config. |

### Required Environment Variables (Production)

These MUST be set and are currently empty/placeholder:

```
JWT_SECRET_KEY          — currently hardcoded dev value
ENCRYPTION_KEY          — currently empty in .env
DEPLOYER_PRIVATE_KEY    — empty (blocks all on-chain operations)
IDENTITY_FACTORY_ADDRESS — empty (blocks ONCHAINID)
IDENTITY_REGISTRY_ADDRESS — empty (blocks identity registration)
TOKEN_FACTORY_ADDRESS   — empty (blocks token deployment)
SALE_FACTORY_ADDRESS    — empty (blocks sale creation)
SUMSUB_APP_TOKEN        — "placeholder" (blocks real KYC)
SUMSUB_SECRET_KEY       — "placeholder" (breaks webhook validation)
RESEND_API_KEY          — empty (blocks all transactional emails)
PINATA_API_KEY          — empty (blocks IPFS document storage)
PINATA_SECRET_KEY       — empty (same)
PLATFORM_FEE_RECEIVER   — set to 0xBE84... (needs verification)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID — "placeholder" in production env
NEXT_PUBLIC_SALE_FACTORY_ADDRESS — not set
NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS — not set
```

---

## 5. External Dependencies

| Service | Needed For | Configured? | Working? |
|---------|-----------|-------------|----------|
| **PostgreSQL** | All data storage | ✅ Dev creds in .env | ⚠️ Local only |
| **Redis** | arq worker, caching, rate limiting | ✅ `localhost:6379` | ⚠️ Local only, rate limiting is in-memory per-worker |
| **Sumsub** | KYC/KYB verification | ❌ `placeholder` | ❌ Dev mode returns mocks |
| **Base RPC (mainnet.base.org)** | All blockchain operations | ✅ Public RPC | ⚠️ Public RPC has rate limits, no fallback configured |
| **Resend** | Transactional emails | ❌ Empty API key | ❌ All emails fail silently |
| **Pinata** | IPFS document storage | ❌ Empty API keys | ❌ Document uploads fail |
| **WalletConnect** | Wallet connection UI | ❌ `placeholder` in prod | ❌ Wallet modal won't work |
| **Chainalysis/Elliptic** | Wallet screening | ❌ Not integrated | ❌ Stub returns 0.0 for all |
| **Chainlink** | Proof of Reserve | ❌ No feeds configured | ❌ Returns mock PoR data |

---

## 6. Showstoppers

These will 100% break if deployed today:

### S1: NO SMART CONTRACTS DEPLOYED
`contracts/deployments/base-sepolia.json` is empty. No contracts exist on any chain. Token deployment, sale creation, contributions, claims — all fail. **The entire investment flow is broken.**

### S2: WALLET SCREENING IS A STUB
`WalletScreeningProvider` always returns `risk_score=0.0, sanctioned=False`. A wallet belonging to a sanctioned entity or used for money laundering would pass screening. **This is a regulatory and legal liability.**

### S3: KYC IS MOCKED
Sumsub credentials are `placeholder`. `_is_dev_mode()` returns True. Users get fake KYC tokens. No actual identity verification occurs. **Unverified users could theoretically invest if KYC checks are bypassed.**

### S4: BACKGROUND WORKER NOT STARTED
The arq worker (event listener, chain sync, email sending, webhook processing, vesting release, balance reconciliation) is a separate process that nothing starts. **All async operations silently don't happen.**

### S5: EMAILS DON'T SEND
`RESEND_API_KEY` is empty. All transactional emails (verification, KYC status, investment confirmation) fail silently. Users get no email notifications.

### S6: DATABASE MIGRATIONS NOT AUTOMATED
Alembic migrations exist but are not run by the Dockerfile or docker-compose. Fresh deployment = empty database = 500 errors everywhere.

### S7: CONTRIBUTION AUTO-CONFIRMED ON FAILURE
`task_index_contribution` line 150-152: if on-chain verification fails, the contribution is **marked as confirmed anyway**. In production, this means a failed/reverted transaction would still be recorded as a successful investment.

### S8: JWT SECRET COMMITTED TO GIT
`.env` and `.env.backend` both contain JWT secrets in the repository. Anyone with repo access can forge authentication tokens.

### S9: COMPLIANCE ACTIONS ARE DB-ONLY
Freeze, unfreeze, forced transfer — all write to `audit_logs` but do NOT call on-chain contract functions. Freezing a wallet in the admin panel doesn't actually freeze the tokens on-chain.

### S10: FRONTEND FACTORY ADDRESSES ARE NULL
`NEXT_PUBLIC_SALE_FACTORY_ADDRESS` and `NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS` are not set. Frontend contract interactions will fail with null address errors.

---

## 7. Risk Assessment

| Category | Score | Notes |
|----------|-------|-------|
| **Code Architecture** | 8/10 | Clean separation, proper service layer, good typing. |
| **Smart Contracts** | 7/10 | Well-structured ERC-3643 implementation with tests. Not deployed. |
| **Backend API** | 6/10 | Functional endpoints, auth, RBAC. All external integrations stubbed. |
| **Frontend** | 6/10 | Real wagmi/viem integration, proper auth flow. Needs deployed contracts. |
| **Security** | 3/10 | JWT secrets in git, screening is stub, dev-mode bypasses active. |
| **Infrastructure** | 2/10 | No deployment guide, no auto-migrations, no worker orchestration. |
| **External Integrations** | 1/10 | Everything is placeholder/empty. Zero working external services. |
| **Deployment Readiness** | 1/10 | Nothing deployed, nothing configured, nothing running. |

### **Overall Production Readiness: 2/10**

### Answer to "Is ANY aspect mocked?"

**Yes. Almost every external-facing aspect is mocked:**
- ❌ KYC/KYB verification → mock tokens
- ❌ Wallet screening → stub (risk_score=0.0 always)
- ❌ Smart contract deployment → no contracts exist
- ❌ ONCHAINID → skipped in dev mode
- ❌ Proof of Reserve → mock data
- ❌ Email notifications → no API key
- ❌ IPFS storage → no API key
- ❌ WalletConnect → placeholder project ID
- ❌ Background worker → not running
- ❌ On-chain compliance → DB-only audit logs

**What's NOT mocked:**
- ✅ User registration/authentication (PostgreSQL + bcrypt + JWT)
- ✅ Database CRUD operations
- ✅ Frontend UI components and routing
- ✅ API endpoint structure and validation
- ✅ HMAC signature validation code (correct implementation, wrong credentials)
- ✅ Web3 service code (real web3.py calls, just no deployed contracts to call)

---

## Path to Production

To make this production-ready, you need:

1. **Deploy contracts** to Base Sepolia first, then mainnet. Run `npx hardhat run scripts/deploy.ts --network baseSepolia`.
2. **Get real Sumsub credentials** and replace `placeholder` values.
3. **Implement a real wallet screening provider** — integrate Chainalysis or Elliptic.
4. **Set all environment variables** — deployer key, factory addresses, API keys.
5. **Add arq worker to docker-compose** as a separate service.
6. **Automate Alembic migrations** in Dockerfile CMD or entrypoint.
7. **Remove JWT secrets from git** — use secrets manager.
8. **Fix contribution auto-confirm** — failed on-chain verification should NOT auto-confirm.
9. **Wire compliance actions to on-chain** — freeze/unfreeze must call contract functions.
10. **Set up monitoring and alerting** — Sentry, health checks, uptime monitoring.

Estimated effort: 2-4 weeks of focused engineering to reach minimum viable production deployment.
