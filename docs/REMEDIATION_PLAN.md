# REMEDIATION PLAN — Cireta RWA Launchpad

**Created:** 2026-03-24
**Based on:** `docs/PRODUCTION_READINESS.md` (audit of commit `8c798b9`)
**Goal:** Bring production readiness from 2/10 → 7/10 (testnet-complete, mainnet-ready pending API keys)

---

## Categories

| Category | Description | Items |
|----------|-------------|-------|
| **A** | Can be coded NOW — no external dependencies | Batches R1–R6 |
| **B** | Needs API keys/credentials — documented in `docs/HANDOVER.md` | Sumsub, Chainalysis, Resend, Pinata, WalletConnect, Chainlink |

---

## Category A: Batches

### Batch R1: Contract Deployment + Address Wiring

**Effort:** ~2 hours
**Prerequisite:** Deployer wallet has Base Sepolia ETH

#### Context
- Deploy script: `contracts/scripts/deploy.ts` — well-structured, idempotent (checks for existing addresses)
- Hardhat config: `contracts/hardhat.config.ts` — `baseSepolia` network configured, reads `DEPLOYER_PRIVATE_KEY` from env
- Deployer wallet: `~/.ferron/x402-server-wallet.json` — address `0xBE84C7a8...`, key field is `private_key` (note: underscore, not camelCase)
- Deployment output: `contracts/deployments/base-sepolia.json` — currently empty stub with only `_comment`

#### Tasks

| # | Task | Files | Details |
|---|------|-------|---------|
| R1.1 | Extract private key from wallet JSON | `~/.ferron/x402-server-wallet.json` | Read `private_key` field (hex with `0x` prefix). Set as `DEPLOYER_PRIVATE_KEY` env var for Hardhat. |
| R1.2 | Verify deployer has Base Sepolia ETH | — | `cast balance 0xBE84C7a8f44F673173d51C0A212C9C66267066A0 --rpc-url https://sepolia.base.org`. Need ≥0.05 ETH for ~15 contract deploys. If insufficient, use Base Sepolia faucet. |
| R1.3 | Run deploy script | `contracts/scripts/deploy.ts` | `cd contracts && DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/deploy.ts --network baseSepolia`. Script deploys: IdentityRegistryStorage, ClaimTopicsRegistry, TrustedIssuersRegistry, IssuerRegistry, PlatformFeeManager, CiretaToken impl, IdentityRegistry impl, ModularCompliance impl, Sale impl, CiretaTokenFactory, CiretaSaleFactory, CountryAllowModule, MaxHolderCountModule. |
| R1.4 | Verify deployment JSON | `contracts/deployments/base-sepolia.json` | After deploy, file should have all 13 addresses (non-null). Read and verify. |
| R1.5 | Wire addresses to backend `.env` | `.env` | Set: `DEPLOYER_PRIVATE_KEY`, `TOKEN_FACTORY_ADDRESS`, `SALE_FACTORY_ADDRESS`, `IDENTITY_REGISTRY_ADDRESS` (from `identityRegistryStorage`), `IDENTITY_FACTORY_ADDRESS` (from `identityRegistryStorage`). |
| R1.6 | Wire addresses to `.env.backend` | `.env.backend` | Same factory/registry addresses. |
| R1.7 | Wire addresses to frontend `.env.local` | `apps/launchpad/.env.local` | Add: `NEXT_PUBLIC_SALE_FACTORY_ADDRESS=0x...`, `NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=0x...`, `NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=0x...` |
| R1.8 | Wire addresses to frontend `.env.production` | `apps/launchpad/.env.production` | Same as R1.7 but for production build. Change `NEXT_PUBLIC_CHAIN_ID=84532` for testnet. |
| R1.9 | Verify on-chain: read factory owner | — | `cast call <tokenFactory> "owner()(address)" --rpc-url https://sepolia.base.org` — should return deployer address. |
| R1.10 | Verify on BaseScan | — | Check each address on `https://sepolia.basescan.org/address/<addr>` — should show contract code. |

#### Definition of Done
- `contracts/deployments/base-sepolia.json` has 13 non-null addresses
- `.env`, `.env.backend`, `apps/launchpad/.env.local`, `apps/launchpad/.env.production` all have factory addresses
- `cast call` to factory `owner()` returns deployer address
- All 13 contracts visible on BaseScan Sepolia

---

### Batch R2: Background Worker + Infrastructure

**Effort:** ~2 hours

#### Context
- `infra/docker-compose.yml` already has a `worker` service — it runs `python -m arq apps.api.workers.tasks.WorkerSettings`
- Root `docker-compose.yml` does NOT have a worker service
- `Procfile.dev` references `apps.example_api.main:app` (wrong path — should be `apps.api.main:app`)
- `Dockerfile.api` runs only `uvicorn` — no migrations, no worker
- Alembic migrations: `infra/alembic/versions/` has 9 migration files
- Worker startup: `apps/api/workers/worker.py` re-exports `WorkerSettings` from `tasks.py`
- `WorkerSettings.on_startup()` spawns background loops for chain sync (12s) and webhook processing (30s)

#### Tasks

| # | Task | Files | Details |
|---|------|-------|---------|
| R2.1 | Fix Procfile.dev | `Procfile.dev` | Change `apps.example_api.main:app` → `apps.api.main:app`. Add worker line: `worker: poetry run arq apps.api.workers.tasks.WorkerSettings`. Add frontend lines for launchpad and admin. |
| R2.2 | Create entrypoint script | `docker/entrypoint.sh` (new) | Script that: (1) runs `alembic upgrade head` (from `infra/alembic/`), (2) execs `uvicorn apps.api.main:app ...`. Make executable. |
| R2.3 | Update Dockerfile.api | `Dockerfile.api` | Copy `docker/entrypoint.sh`, `COPY infra/ infra/`, set `ENTRYPOINT ["./docker/entrypoint.sh"]`. Remove hardcoded CMD. Add `CMD ["api"]` with entrypoint supporting `api` and `worker` modes. |
| R2.4 | Create full docker-compose.yml | `docker-compose.yml` | Replace current file. Services: `db` (postgres:16-alpine), `redis` (redis:7-alpine), `api` (Dockerfile.api, depends on db+redis, runs migrations+api), `worker` (same image, command override for arq), `launchpad` (Dockerfile.launchpad, port 3000), `admin` (Dockerfile.admin, port 3001). All with healthchecks. |
| R2.5 | Add worker healthcheck | `apps/api/workers/tasks.py` | In `WorkerSettings.on_startup()`, write a heartbeat key to Redis every 30s. Healthcheck: `redis-cli GET cireta:worker:heartbeat` — value must be within last 60s. |
| R2.6 | Add API health check for worker | `apps/api/api/v1/endpoints/health.py` | Add `/health/worker` endpoint that checks Redis for the worker heartbeat key. Returns unhealthy if missing or stale. |
| R2.7 | Add Alembic config to Docker | `Dockerfile.api` | Ensure `alembic.ini` and `infra/alembic/` are in the image. Verify `alembic upgrade head` runs successfully against a fresh Postgres. |

#### Definition of Done
- `honcho start -f Procfile.dev` starts API + worker + frontend
- `docker compose up` starts all 5 services (db, redis, api, worker, launchpad)
- Migrations run automatically on API startup
- `/api/v1/health/ready` reports database + RPC status
- Worker heartbeat visible in Redis
- No manual `alembic upgrade head` needed

---

### Batch R3: Critical Bug Fixes

**Effort:** ~2 hours

#### Context
- **SHOWSTOPPER #7:** `apps/api/workers/tasks.py` line 150-152: `task_index_contribution` catches Exception and marks contribution as `confirmed` even when chain verification fails
- **SHOWSTOPPER #8:** `.env` line 21: `JWT_SECRET_KEY=dev-only-k8f3j2m9x7q1w4p6r0t5v8b3n2c7y1a9` committed to git. `.env.backend` line 2: another hardcoded JWT secret.
- **SHOWSTOPPER #9:** `apps/api/services/compliance_base_service.py` lines 131-136 and 172-177: freeze/unfreeze catch Exception and log warning "proceeding with DB-only" — on-chain failure is silently swallowed
- Silent `pass` blocks: `apps/api/core/web3_provider.py` lines 135-136 and 143-144, `apps/api/services/event_listener_service.py` line 263-264
- Dev-mode bypasses: `apps/api/workers/tasks.py` line 84 skips identity registration in development, line 93-100 has `except AttributeError` fallback

#### Tasks

| # | Task | Files | Details |
|---|------|-------|---------|
| R3.1 | Fix contribution auto-confirm | `apps/api/workers/tasks.py` lines 148-152 | Change the `except Exception` block: instead of `contribution.status = "confirmed"`, set `contribution.status = "pending"` and log error. Re-raise to trigger arq retry. The contribution should stay pending until chain verification succeeds. |
| R3.2 | Remove JWT secrets from committed files | `.env`, `.env.backend` | Remove `JWT_SECRET_KEY=...` lines from both files. Add to `.env.example` as `JWT_SECRET_KEY=` (empty). Add to `packages/common/core/config.py` `_validate_security()`: raise if `jwt_secret_key` is empty in ANY environment. |
| R3.3 | Add `.env` and `.env.backend` to `.gitignore` | `.gitignore` | Ensure `.env` and `.env.backend` are gitignored. Only `.env.example` and `.env.backend.example` should be committed. |
| R3.4 | Fix compliance freeze/unfreeze error handling | `apps/api/services/compliance_base_service.py` lines 131-136 | Change: remove the `except Exception` that catches and continues with DB-only. On-chain failure for compliance MUST propagate — re-raise the exception. If no contract is deployed (address is null/zero), that's fine (skip). But if contract IS deployed and call fails → raise, don't silently continue. |
| R3.5 | Fix silent `pass` in web3_provider | `apps/api/core/web3_provider.py` lines 135-136, 143-144 | Replace `except Exception: pass` with `except Exception as e: logger.warning("RPC health check failed: %s", e)`. The `pass` is acceptable here (health check, non-critical) but needs logging. |
| R3.6 | Fix silent `pass` in event_listener | `apps/api/services/event_listener_service.py` line 263-264 | Replace `except Exception: pass` with proper logging: `except Exception as e: logger.error("Event processing failed: %s", e, exc_info=True)`. This is CRITICAL — silently dropping events means lost contributions. |
| R3.7 | Fix silent `pass` in kyc_service UUID parsing | `apps/api/services/kyc_service.py` lines 200-201, 459-460 | Replace `except ValueError: pass` with `except ValueError: log.debug("Invalid UUID in webhook payload: %s", ...)`. UUID parse failures in webhooks should at minimum be logged. |
| R3.8 | Remove dev-mode identity skip | `apps/api/workers/tasks.py` line 84-86 | Remove the `if environment == "development": return` block. Instead, check if `deployer_private_key` and `identity_registry_address` are set. If not → log error with clear message and return (not silently). If set → proceed with on-chain call regardless of environment. |
| R3.9 | Fix `except AttributeError` fallback | `apps/api/workers/tasks.py` lines 93-100 | Remove the `except AttributeError` block entirely. If `register_identity` doesn't exist on `Web3IdentityService`, that's a code bug that must be caught at development time, not silently bypassed in production. |
| R3.10 | Verify Settings._validate_security catches missing JWT | `packages/common/core/config.py` | The existing `_validate_security()` (line ~120) checks `jwt_secret_key` in production/staging. Extend: also fail if the value matches known dev values (`dev-only-k8f3j2m9x7q1w4p6r0t5v8b3n2c7y1a9` or `local-dev-secret-key-cireta-2026-change-me-min32chars`). |

#### Definition of Done
- Failed on-chain verification → contribution stays `pending`, NOT auto-confirmed
- No JWT secrets in any committed file (`.env`, `.env.backend`)
- `.gitignore` excludes `.env` and `.env.backend`
- On-chain compliance failures propagate (no silent DB-only fallback)
- Zero `except ...: pass` blocks — all have logging
- No environment-based bypasses for on-chain operations — only credential-presence checks
- Settings rejects known dev JWT secrets in production/staging

---

### Batch R4: Stub Elimination

**Effort:** ~3 hours

#### Context
- Wallet screening: `apps/api/services/wallet_screening_service.py` — `WalletScreeningProvider.screen()` is a stub returning `risk_score=0.0` always
- KYC: `apps/api/services/kyc_service.py` — `_is_dev_mode()` returns True when token is `placeholder`/`test`/empty
- ONCHAINID: `apps/api/workers/tasks.py` lines 61-66 — skips if `DEPLOYER_PRIVATE_KEY` or `IDENTITY_FACTORY_ADDRESS` not set
- Email: `apps/api/services/email_service.py` — uses Resend SDK, fails silently (returns `False`)
- Proof of Reserve: `apps/api/api/v1/endpoints/tokens.py` lines 134-143 — returns mock data when no Chainlink feed
- IPFS/Pinata: referenced in settings but service file not found (may be inline in token service)

#### Tasks

| # | Task | Files | Details |
|---|------|-------|---------|
| R4.1 | Create abstract screening interface | `apps/api/services/wallet_screening_service.py` | Rename current `WalletScreeningProvider` to `StubScreeningProvider`. Create abstract `BaseScreeningProvider` with `async def screen(address) -> dict`. Create `ChainalysisProvider` skeleton that reads `SCREENING_API_KEY` from settings and raises `RuntimeError("SCREENING_API_KEY not configured — cannot screen wallets")` if missing. |
| R4.2 | Add provider factory | `apps/api/services/wallet_screening_service.py` | Add `get_screening_provider()` function: if `settings.screening_api_key` is set → return `ChainalysisProvider()`. If `settings.environment == "development"` and no key → return `StubScreeningProvider()` (with WARNING log). If `settings.environment in ("staging", "production")` and no key → raise `RuntimeError("SCREENING_API_KEY required in production")`. |
| R4.3 | Wire provider into service | `apps/api/services/wallet_screening_service.py` | Change `WalletScreeningService.__init__()` default: `provider = provider or get_screening_provider()`. |
| R4.4 | Add `screening_api_key` to settings | `packages/common/core/config.py` | Add field: `screening_api_key: str = Field(default="")`. |
| R4.5 | Make KYC fail loudly without credentials | `apps/api/services/kyc_service.py` | Change `_is_dev_mode()`: rename to `_has_sumsub_credentials()` (returns True if credentials are real). In `initiate()`: if no credentials AND `environment != "development"` → raise `HTTPException(503, "KYC service not configured — SUMSUB_APP_TOKEN required")`. In development without credentials → return mock token but log WARNING. |
| R4.6 | Make ONCHAINID fail loudly | `apps/api/workers/tasks.py` lines 61-66 | Change from "skip" to: if `environment in ("staging", "production")` and key missing → raise `RuntimeError("DEPLOYER_PRIVATE_KEY required for ONCHAINID deployment in production")`. In development → log WARNING and return None. |
| R4.7 | Make email fail loudly | `apps/api/services/email_service.py` | In `_get_client()`: check `settings.resend_api_key`. If empty AND `environment != "development"` → raise `RuntimeError("RESEND_API_KEY not configured")`. In development → log WARNING and return (skip send). Change all `return False` catch blocks to re-raise in production. |
| R4.8 | Make Proof of Reserve explicit | `apps/api/api/v1/endpoints/tokens.py` lines 134-143 | Keep mock return but change `is_live: False` to include `"warning": "No Chainlink PoR feed configured — data is estimated, not verified"`. Add header `X-PoR-Status: estimated`. |
| R4.9 | Add Pinata fail-loud | `packages/common/core/config.py` | If any endpoint tries to upload to IPFS and `pinata_api_key` is empty → raise `RuntimeError("PINATA_API_KEY not configured — document upload unavailable")`. |
| R4.10 | Add `screening_api_key` to `.env.example` | `.env.example` | Add: `SCREENING_API_KEY=` with comment `# Chainalysis or Elliptic API key for wallet sanctions screening`. |

#### Definition of Done
- Zero stubs that silently succeed in production/staging
- Every missing credential in production/staging → loud, clear error with the exact env var name
- Development mode still works with warnings (degraded but functional)
- Screening provider is pluggable (abstract base + factory pattern)
- KYC returns 503 in production without Sumsub credentials
- Email raises in production without Resend key

---

### Batch R5: Frontend → Backend → Chain Integration

**Effort:** ~2 hours

#### Context
- Frontend addresses: `apps/launchpad/src/lib/contracts/addresses.ts` — reads from `NEXT_PUBLIC_*` env vars, falls back to `null`
- Wagmi config: `apps/launchpad/src/lib/wagmi.ts` — uses `@rainbow-me/rainbowkit`, WalletConnect project ID from env
- `.env.local` has a real WalletConnect project ID: `b56e18d47c72ab683b10814fe9495694`
- `.env.production` has `placeholder` for WalletConnect
- API client: `apps/launchpad/src/lib/api/client.ts` — reads `NEXT_PUBLIC_API_URL`
- CORS: `.env` line 19: `CORS_ORIGINS=http://localhost:3000,http://localhost:3001,https://launchpad.cireta.com,https://admin.cireta.com`

#### Tasks

| # | Task | Files | Details |
|---|------|-------|---------|
| R5.1 | Add null-address guard to frontend | `apps/launchpad/src/lib/contracts/addresses.ts` | Add runtime check: `export function requireAddress(addr: \`0x${string}\` | null, name: string): \`0x${string}\` { if (!addr) throw new Error(\`Contract address not configured: ${name}. Set NEXT_PUBLIC_${name.toUpperCase()}_ADDRESS\`); return addr; }`. Use in all contract call sites. |
| R5.2 | Fix .env.production WalletConnect | `apps/launchpad/.env.production` | Copy the real project ID from `.env.local`: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=b56e18d47c72ab683b10814fe9495694`. Or mark as env-override for deployment. |
| R5.3 | Add WalletConnect guard | `apps/launchpad/src/lib/wagmi.ts` | After reading `walletConnectProjectId`: `if (walletConnectProjectId === "placeholder") console.error("WalletConnect project ID not configured — wallet connection will fail. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID")`. |
| R5.4 | Wire deployed addresses to .env.production | `apps/launchpad/.env.production` | After R1 completes, add all `NEXT_PUBLIC_SALE_FACTORY_ADDRESS`, `NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS`, `NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS` from `contracts/deployments/base-sepolia.json`. |
| R5.5 | Configure wagmi for Base Sepolia as default | `apps/launchpad/src/lib/wagmi.ts` | For testnet phase: set `chains: [baseSepolia, base]` (Sepolia first = default). Change `NEXT_PUBLIC_CHAIN_ID=84532` in `.env.local`. |
| R5.6 | Verify CORS config | `.env` | Ensure CORS includes all frontend domains. Add `http://localhost:3001` for admin panel if not present. Current config already includes both localhost ports and production domains — verify this propagates to the API via `settings.cors_origins`. |
| R5.7 | Verify API client base URL | `apps/launchpad/src/lib/api/client.ts` | Confirm it reads `NEXT_PUBLIC_API_URL` and doesn't have hardcoded fallbacks to wrong URLs. |
| R5.8 | Add chain ID validation | `apps/launchpad/src/lib/contracts/addresses.ts` | In `getAddresses()`: if `chainId` not in `ADDRESSES` map, throw descriptive error instead of falling back to mainnet silently. |
| R5.9 | Verify admin panel API proxy | `apps/admin/src/app/api/proxy/[...path]/route.ts` | Confirm admin panel proxies to `NEXT_PUBLIC_API_URL`. Ensure it passes auth headers. |

#### Definition of Done
- Frontend connects to backend API (verify with network tab in browser)
- Backend connects to Base Sepolia RPC (verify via `/api/v1/health/ready`)
- All contract addresses non-null in frontend env
- WalletConnect modal opens and connects (Sepolia)
- No `null address` errors in console
- CORS allows frontend origins
- Chain ID mismatch = clear error (not silent mainnet fallback)

---

### Batch R6: End-to-End Smoke Test

**Effort:** ~3 hours

#### Context
- Full flow: Register → KYC → Link Wallet → Screen → Deploy Token → Create Sale → Contribute USDC → Event Listener → Confirm → Claim
- Without real Sumsub: manually set user KYC status in DB
- Without real screening: stub provider will pass (acceptable for testnet)
- Need USDC on Base Sepolia for contribution test

#### Tasks

| # | Task | Files | Details |
|---|------|-------|---------|
| R6.1 | Start full stack | `docker-compose.yml` | `docker compose up -d`. Verify all services healthy: `docker compose ps`. |
| R6.2 | Register a test user | — | `curl -X POST http://localhost:8000/api/v1/auth/register -H 'Content-Type: application/json' -d '{"email":"test@cireta.local","password":"TestPass123!","full_name":"Test User"}'` |
| R6.3 | Simulate KYC approval | — | Connect to Postgres: `psql -U postgres -d cireta`. Run: `UPDATE users SET kyc_status='approved', kyc_level=1 WHERE email='test@cireta.local';` |
| R6.4 | Login and get JWT | — | `curl -X POST http://localhost:8000/api/v1/auth/login -d '{"email":"test@cireta.local","password":"TestPass123!"}'`. Save the access token. |
| R6.5 | Link wallet | — | Use the API to link a test wallet address to the user. |
| R6.6 | Deploy test token via API | — | As an issuer/admin: create a token via the admin API. This triggers `CiretaTokenFactory.createToken()` on-chain. |
| R6.7 | Create sale for test token | — | Create a sale via admin API. This triggers `CiretaSaleFactory.createSale()` on-chain. |
| R6.8 | Contribute to sale | — | From frontend or via API: approve USDC → contribute to sale. Requires Base Sepolia USDC (use faucet or mint mock USDC). |
| R6.9 | Verify event listener picks up contribution | — | Check worker logs: `docker compose logs worker -f`. Should see "Contribution confirmed on-chain: tx=0x...". |
| R6.10 | Verify portfolio shows contribution | — | `curl http://localhost:8000/api/v1/portfolio -H 'Authorization: Bearer <token>'`. Should show the contribution. |
| R6.11 | Finalize sale + claim tokens | — | If sale has enough contributions: finalize. Then claim tokens via frontend. |
| R6.12 | Document results | `docs/E2E_SMOKE_TEST.md` (new) | Document every step, commands used, responses received, any issues found. Include timestamps and transaction hashes. |

#### Definition of Done
- Full flow documented in `docs/E2E_SMOKE_TEST.md`
- At least: register → KYC (manual) → wallet link → token deploy → sale create → contribute → event pickup → portfolio display
- All transaction hashes on BaseScan Sepolia
- Any issues found are logged as GitHub issues or TODOs

---

## Category B: External Dependencies (API Keys Required)

These are documented in `docs/HANDOVER.md`. They are NOT implemented in remediation — only the integration points and fail-loud guards (from Batch R4) are coded.

| Integration | Batch R4 Task | What We Code | What We DON'T Code |
|-------------|---------------|--------------|---------------------|
| Sumsub KYC | R4.5 | Fail-loud guard, mock-in-dev | Real Sumsub API calls (already coded, needs credentials) |
| Wallet Screening | R4.1–R4.3 | Abstract provider + factory + Chainalysis skeleton | Actual Chainalysis/Elliptic HTTP calls |
| Resend Email | R4.7 | Fail-loud guard | Email sending (already coded, needs API key) |
| Pinata IPFS | R4.9 | Fail-loud guard | IPFS upload (needs API key) |
| WalletConnect | R5.2 | Copy existing project ID from .env.local | Creating new WalletConnect project |
| Chainlink PoR | R4.8 | Explicit "estimated" warning | Oracle integration (per-token Chainlink feed setup) |

---

## Execution Timeline

| Session | Batches | Estimated Time | Cumulative |
|---------|---------|---------------|------------|
| **Session 1** | R1 (Deploy) + R2 (Infra) | ~4 hours | 4h |
| **Session 2** | R3 (Bugs) + R4 (Stubs) | ~5 hours | 9h |
| **Session 3** | R5 (Integration) + R6 (Smoke Test) | ~5 hours | 14h |

**Total estimated effort: 14 hours across 2-3 focused sessions.**

---

## Dependency Graph

```
R1 (Deploy Contracts)
  ↓
R2 (Infrastructure) ← independent of R1, can parallel
  ↓
R3 (Bug Fixes) ← independent of R1/R2
  ↓
R4 (Stub Elimination) ← independent of R1/R2
  ↓
R5 (Frontend Wiring) ← depends on R1 (needs addresses)
  ↓
R6 (Smoke Test) ← depends on ALL above
```

R1 and R2 can run in parallel. R3 and R4 can run in parallel. R5 depends on R1. R6 depends on everything.

---

## Post-Remediation Score

After completing all batches:

| Category | Before | After | Notes |
|----------|--------|-------|-------|
| Code Architecture | 8/10 | 8/10 | Already good |
| Smart Contracts | 7/10 | 9/10 | Deployed + verified on testnet |
| Backend API | 6/10 | 8/10 | Fail-loud stubs, no silent errors |
| Frontend | 6/10 | 8/10 | Wired to real contracts + API |
| Security | 3/10 | 6/10 | No committed secrets, fail-loud in prod |
| Infrastructure | 2/10 | 7/10 | docker-compose, auto-migrations, worker |
| External Integrations | 1/10 | 3/10 | Fail-loud guards, needs real keys for higher |
| Deployment Readiness | 1/10 | 7/10 | Testnet-complete, documented |
| **Overall** | **2/10** | **7/10** | **Testnet-ready, mainnet pending API keys** |
