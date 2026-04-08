# Cireta RWA Launchpad — Project Handover

> **Version:** 1.0.0 · **Date:** March 2026 · **Status:** Beta — Ready for Mainnet Preparation

---

## Executive Summary

Cireta is a regulated Real-World Asset (RWA) tokenization platform built on Base. It enables issuers to tokenize physical assets (commodities, real estate, equity) as ERC-3643 compliant security tokens, and provides a compliant launchpad for verified investors to participate in token sales. The platform is now **production-ready at the API and smart contract layer**, with 133 Python tests and 85 E2E API tests passing at 100%, all critical security vulnerabilities patched, and full on-chain integration verified on Base Sepolia.

---

## 1. Current State

### 1.1 Test Status: All Green ✅

| Suite | Tests | Status |
|-------|-------|--------|
| Python Unit Tests | 86 | ✅ All passing |
| Python Integration Tests | 47 | ✅ All passing |
| E2E API Test Suite (Bash) | 85 | ✅ 85/85 (100%) |
| Solidity Tests | 113 | ✅ All passing |
| **Total** | **331** | **✅ 100%** |

### 1.2 Live Environment (Base Sepolia Testnet)

| Item | Value |
|------|-------|
| API | http://localhost:8000 (dev) |
| Launchpad | http://localhost:3000 (dev) |
| Admin Panel | http://localhost:3001 (dev) |
| Network | Base Sepolia (chainId: 84532) |
| Deployer Address | `0xBE84C7a8f44F673173d51C0A212C9C66267066A0` |

### 1.3 Key Features Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| User Auth (JWT + MFA) | ✅ Complete | 15min access / 7d refresh tokens |
| KYC Integration (Sumsub) | ✅ Complete | L1/L2/L3 levels, corporate KYB |
| Wallet Management | ✅ Complete | EVM wallets, primary wallet, risk screening |
| ERC-3643 Token Creation | ✅ Complete | Factory pattern, 3 contracts per token |
| Direct Mode Sales | ✅ Complete | Instant token transfer on contribution |
| Vested Mode Sales | ✅ Complete | Fraction tokens + vault + cliff/linear vesting |
| ONCHAINID Integration | ✅ Complete | CREATE2 identity deploy, claim signing |
| Compliance Module | ✅ Complete | Freeze, unfreeze, forced transfer, pause |
| OTC Allocations | ✅ Complete | Admin-side OTC contribution recording |
| Dividend Distribution | ✅ Complete | Admin deposits, investor portfolio view |
| Token Redemptions | ✅ Complete | Status machine: pending→shipped→fulfilled |
| Proof of Reserve (PoR) | ✅ Complete | Chainlink oracle integration |
| Admin Reports (CSV) | ✅ Complete | Sales, holders, compliance, fees |
| Background Workers | ✅ Complete | Arq queue, chain sync, webhook retry |
| Webhook Retry Queue | ✅ Complete | 3x retry with exponential backoff, DLQ |
| Rate Limiting | ✅ Complete | Per-path limits, login lockout |
| CORS / Security Headers | ✅ Complete | OWASP headers, strict CORS |

---

## 2. Security Remediation Summary

All issues from the P0/P1/P2 audit have been resolved. Key fixes:

| Category | Issues Fixed | Critical Highlights |
|----------|-------------|---------------------|
| Backend P0 | 9 | JWT no dev-secret, refresh token revocation, KYC claims fixed, race condition locks |
| Backend P1 | 14 | CORS lockdown, password complexity, SQL safe, rate limiting on contribute |
| Backend P2 | 13 | HMAC webhook validation, keccak256 identity addresses, audit logging |
| Frontend P0 | 7 | XSS sanitization, localStorage→httpOnly cookies, confirmation dialogs |
| Frontend P1 | 8 | Error boundaries, JWT refresh flow, loading states |
| Smart Contract P0 | 6 | ReentrancyGuard, DividendDistributor snapshot, SafeERC20, access control |
| Smart Contract P1 | 5 | MaxHolderCount fix, double-call prevention, holder tracking order |
| Infrastructure | 5 | JWT secrets gitignored, .env files excluded, Dockerfile hardened |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        USERS                             │
│   Investors (Launchpad)    Issuers/Admins (Admin Panel) │
└──────────┬──────────────────────────┬────────────────────┘
           │                          │
    ┌──────▼──────┐            ┌──────▼──────┐
    │  Next.js    │            │  Next.js    │
    │  Launchpad  │            │  Admin Panel│
    │  :3000      │            │  :3001      │
    └──────┬──────┘            └──────┬──────┘
           │                          │
           └──────────┬───────────────┘
                      │ HTTPS/REST
                ┌─────▼──────┐
                │  FastAPI   │
                │  Backend   │
                │  :8000     │
                └──┬──┬──┬───┘
            ┌──────┘  │  └──────────┐
            │         │             │
     ┌──────▼──┐  ┌───▼────┐  ┌────▼────┐
     │Postgres │  │ Redis  │  │  Arq    │
     │  :5432  │  │ :6379  │  │ Worker  │
     └─────────┘  └────────┘  └────┬────┘
                                    │
                          ┌─────────▼──────────┐
                          │  Base / Sepolia  │
                          │  (Web3.py + RPC)    │
                          └─────────────────────┘

External Services:
  Sumsub → KYC/KYB webhooks → API → ONCHAINID deploy
  Resend → Transactional emails (verify, reset, notifications)
  Pinata → IPFS document storage
  Chainlink → Proof of Reserve feeds
  Chainalysis/Elliptic → Wallet risk screening
```

### 3.1 Key Design Decisions

- **ERC-3643 (T-REX):** Full compliance standard — every transfer checks on-chain identity
- **Factory pattern:** CiretaTokenFactory deploys 3 contracts per token (Token, IdentityRegistry, Compliance)
- **Dual sale modes:** Direct (instant) and Vested (fraction tokens + vault + cliff) 
- **ONCHAINID:** CREATE2 deterministic deploy per investor wallet after KYC
- **Arq workers:** Async task queue for chain sync (12s interval) and webhook retry (30s interval)
- **JWT strategy:** Short-lived access (15min) + long-lived refresh (7d) stored in Redis blacklist

---

## 4. External Integrations

### 4.1 Integration Matrix

| # | Service | Env Variables | Purpose | Priority | Est. Cost | Where to Get |
|---|---------|--------------|---------|----------|-----------|--------------|
| 1 | **Sumsub KYC** | `SUMSUB_APP_TOKEN`<br>`SUMSUB_SECRET_KEY` | Real identity verification (KYC L1/L2/L3, KYB). Without it users can't be verified and can't invest. | **P0 — Launch Blocker** | $1.50–$3.00/verification | [dashboard.sumsub.com](https://dashboard.sumsub.com) → Settings → API |
| 2 | **Deployer Wallet** | `DEPLOYER_PRIVATE_KEY` | On-chain: deploy tokens, sales, ONCHAINID identities. Must be mainnet key with ETH. | **P0 — Launch Blocker** | Gas costs only | Generate with `cast wallet new` (foundry) |
| 3 | **Resend Email** | `RESEND_API_KEY`<br>`RESEND_FROM_EMAIL` | Transactional emails: email verification, password reset, notifications | **P0 — Launch Blocker** | Free up to 3k/mo, $20/mo Pro | [resend.com](https://resend.com) → API Keys |
| 4 | **WalletConnect** | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Wallet connection modal in frontends. Without it only MetaMask direct works. | **P0 — Launch Blocker** | Free | [cloud.walletconnect.com](https://cloud.walletconnect.com) → Create Project |
| 5 | **RPC Provider (Base)** | `WEB3_RPC_URL`<br>`WEB3_FALLBACK_RPC_URL` | Reliable RPC endpoint for all on-chain reads/writes. Public RPC is unreliable for prod. | **P0 — Launch Blocker** | Free–$49/mo | [Alchemy](https://alchemy.com) or [QuickNode](https://quicknode.com) |
| 6 | **ONCHAINID Contracts** | `IDENTITY_FACTORY_ADDRESS`<br>`IDENTITY_INIT_CODE_HASH` | Deploy investor ONCHAINID identities on Base mainnet | **P0 — Launch Blocker** | Gas costs only | Deploy from [onchainid/onchainid](https://github.com/onchainid/onchainid) |
| 7 | **Wallet Screening** | `SCREENING_API_KEY`<br>`SCREENING_PROVIDER` | OFAC/SDN sanctions check when wallet is linked. Regulatory compliance. | **P0 — 30 days** | Free tier / Enterprise | [Chainalysis Free](https://www.chainalysis.com/free-cryptocurrency-sanctions-screening-tools/) |
| 8 | **Pinata IPFS** | `PINATA_API_KEY`<br>`PINATA_SECRET_KEY` | Token document storage (prospectus, legal docs, images) on IPFS | **P1 — 30 days** | Free 1GB, $20/mo Picante | [pinata.cloud](https://app.pinata.cloud) → API Keys |
| 9 | **BaseScan** | `BASESCAN_API_KEY` | Verify contract source code on BaseScan for transparency | **P1 — 30 days** | Free | [basescan.org/apis](https://basescan.org/apis) |
| 10 | **Chainlink PoR** | Per-token `chainlink_por_feed` | Proof of Reserve oracle for commodity tokens | **P2 — Optional** | Free read / Custom Functions | [data.chain.link](https://data.chain.link) |

### 4.2 What Happens Without Each Integration

| Missing | What breaks |
|---------|------------|
| Sumsub | KYC initiation returns mock response. Users stuck at `kyc_status=pending`. Cannot invest. |
| Deployer Key | Token/sale deploy fails. Identity registration fails. Platform is read-only. |
| Resend | Email verification skipped (users can register but emails not sent). Password reset broken. |
| WalletConnect | Wallet connection limited to injected MetaMask only. Mobile wallets won't work. |
| RPC Provider | Public `https://mainnet.base.org` works but rate-limited. Will fail under load. |
| ONCHAINID | Identity creation fails silently. Users cannot be verified on-chain. |
| Screening | Wallet linking succeeds with default LOW risk score. Regulatory risk. |

---

## 5. Smart Contract Addresses (Base Sepolia)

| Contract | Address | Purpose |
|----------|---------|---------|
| IdentityRegistryStorage | `0xFEe7c667db9b54767A8772dcBC81a9d177C0954E` | Shared identity storage |
| ClaimTopicsRegistry | `0xc2A8F6ef64B375872dBf09BD3Eb650a620687F02` | KYC claim topics |
| TrustedIssuersRegistry | `0xA695Dd3a5bc6c34BC914a650fAa46596e2E03319` | Trusted claim issuers |
| IssuerRegistry | `0x3bdE32b8AC48d8015e34E2335B5a640072105225` | Platform issuer registry |
| PlatformFeeManager | `0x545Ce9dc34E3086B505D9fd8DB443906E2c796f6` | Fee collection |
| CiretaToken (impl) | `0x35e6CD52b56642A7f1f172e29e6fEa3b9d9473Bc` | Token implementation |
| IdentityRegistry (impl) | `0x921905f38a3af1C35638f2fAA97B41EA4d7f300c` | IR implementation |
| Compliance (impl) | `0xcD84cad8615664472cbFCCa3dAFFC3270c423039` | Compliance implementation |
| CiretaTokenFactory | `0x6918cE85Da96C07Deaeba796512422ab8AEEB99D` | Deploys ERC-3643 token trios |
| CiretaSaleFactory | `0xe4a06Eaa949D12B173B0bA5f7CaABe473b4e8b5F` | Deploys sale contracts |
| CiretaFractionFactory | `0x224fa1965b5B8C1428eD5D92E6d04CF5967aE9ac` | Deploys vault+fraction pairs |
| CountryAllowModule | `0xce620bd7213ed4b56D5AEFc445C3da95C4C7bd24` | Country restriction module |
| MaxHolderCountModule | `0xC21EA2D0f85b25D29e2f9e971d5F76a54986c585` | Max holder count module |
| Sale (impl) | `0x33f4CA4E9C18c22A179a258082D03A94f1B7d53a` | Sale implementation |
| FractionToken (impl) | `0x94064F9B05f2e2D776c048323236df09989199bc` | Fraction token implementation |
| Vault (impl) | `0x7b8Cfe19cb6a2F3186e996bF10843e6FbEAd8764` | Vault implementation |

> ⚠️ **For mainnet:** Re-deploy ALL contracts. Never re-use testnet addresses or keys.

---

## 6. Environment Variables Reference

### 6.1 Complete `.env.production` Template

```bash
# ============================================================
# CIRETA RWA LAUNCHPAD — PRODUCTION ENVIRONMENT
# Generated: March 2026
# ============================================================

# === APPLICATION ===
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO

# === DATABASE ===
# Use managed PostgreSQL (Supabase, Neon, RDS, etc.)
DATABASE_URL=postgresql+asyncpg://cireta:STRONG_PASSWORD@db.host:5432/cireta
# Test: postgresql+asyncpg://cireta:cireta@localhost:5434/cireta

# === REDIS ===
# Use managed Redis (Upstash, Redis Cloud, ElastiCache, etc.)
REDIS_URL=redis://localhost:6379/0

# === SECURITY — GENERATE NEW FOR EVERY ENVIRONMENT ===
# openssl rand -hex 32
JWT_SECRET_KEY=REPLACE_WITH_64_CHAR_HEX_STRING
# python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=REPLACE_WITH_FERNET_KEY
JWT_ALGORITHM=HS256
JWT_ACCESS_EXPIRE_MINUTES=15
JWT_REFRESH_EXPIRE_DAYS=7

# === BLOCKCHAIN ===
CHAIN_ID=8453                                    # Base Mainnet (8453) or Sepolia (84532)
WEB3_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
WEB3_FALLBACK_RPC_URL=https://mainnet.base.org   # Public fallback
DEPLOYER_PRIVATE_KEY=0x_YOUR_MAINNET_DEPLOYER_PRIVATE_KEY  # NEVER commit this

# === CONTRACT ADDRESSES (fill after mainnet deployment) ===
TOKEN_FACTORY_ADDRESS=0x...
SALE_FACTORY_ADDRESS=0x...
FRACTION_FACTORY_ADDRESS=0x...
IDENTITY_FACTORY_ADDRESS=0x...
IDENTITY_REGISTRY_ADDRESS=0x...                  # From factory deployment
IDENTITY_INIT_CODE_HASH=0x...                    # keccak256 of IdentityProxy creation code
PLATFORM_FEE_MANAGER_ADDRESS=0x...
PLATFORM_FEE_RECEIVER=0x...                      # Address that receives platform fees

# === KYC (SUMSUB) ===
SUMSUB_APP_TOKEN=sbx_YOUR_SUMSUB_APP_TOKEN
SUMSUB_SECRET_KEY=YOUR_SUMSUB_SECRET_KEY
# For production, use production credentials (not sandbox sbx_)

# === WALLET SCREENING ===
SCREENING_PROVIDER=chainalysis                   # or: elliptic, custom
SCREENING_API_KEY=YOUR_CHAINALYSIS_API_KEY

# === EMAIL (RESEND) ===
RESEND_API_KEY=re_YOUR_RESEND_API_KEY
RESEND_FROM_EMAIL=noreply@cireta.com
RESEND_FROM_NAME=Cireta RWA Launchpad

# === FRONTEND URLS (used in emails, CORS) ===
FRONTEND_URL=https://launchpad.cireta.com
ADMIN_URL=https://admin.cireta.com
CORS_ORIGINS=https://launchpad.cireta.com,https://admin.cireta.com

# === IPFS (PINATA) ===
PINATA_API_KEY=YOUR_PINATA_API_KEY
PINATA_SECRET_KEY=YOUR_PINATA_SECRET_KEY

# === RATE LIMITING ===
RATE_LIMIT_DEFAULT=100                           # requests/minute
RATE_LIMIT_LOGIN=10                              # login attempts/minute
RATE_LIMIT_REGISTER=10                           # registrations/minute
RATE_LIMIT_CONTRIBUTE=20                         # contributions/minute
RATE_LIMIT_WINDOW_SECONDS=60

# === FEATURE FLAGS ===
MAINTENANCE_MODE=false
REGISTRATION_OPEN=true
```

---

## 7. Deployment Guide

### 7.1 Local Development

```bash
# 1. Clone and enter
git clone https://github.com/jawaddxb/cireta.git && cd cireta

# 2. Start infrastructure
docker run -d --name cireta-postgres -e POSTGRES_USER=cireta \
  -e POSTGRES_PASSWORD=cireta -e POSTGRES_DB=cireta \
  -p 5434:5432 postgres:16-alpine

docker run -d --name cireta-redis -p 6380:6379 redis:7-alpine

# 3. Backend setup
cp .env.example .env  # Fill in values
poetry install
poetry run alembic -c infra/alembic/alembic.ini upgrade head

# 4. Start API
poetry run uvicorn apps.api.main:app --reload --port 8000

# 5. Start worker (separate terminal)
poetry run arq apps.api.workers.tasks.WorkerSettings

# 6. Frontend setup
npm install
npm run dev --workspace=apps/launchpad  # port 3000
npm run dev --workspace=apps/admin      # port 3001

# 7. Seed demo data
bash e2e-tests/seed-demo.sh  # or run e2e-tests/run-all.sh
```

### 7.2 Production Checklist

- [ ] Generate new `JWT_SECRET_KEY` (openssl rand -hex 32)
- [ ] Generate new `ENCRYPTION_KEY` (Fernet.generate_key())
- [ ] Generate new deployer wallet (cast wallet new) — NEVER use testnet key
- [ ] Fund deployer wallet with Base ETH and USDC
- [ ] Deploy all contracts to Base mainnet (contracts/scripts/deploy.ts)
- [ ] Deploy ONCHAINID factory and get `IDENTITY_FACTORY_ADDRESS`
- [ ] Fill `IDENTITY_INIT_CODE_HASH` from IdentityProxy creation code
- [ ] Configure Sumsub production webhook URL
- [ ] Set up Resend domain authentication
- [ ] Configure CORS to production domains only
- [ ] Enable managed PostgreSQL (connection pooling via PgBouncer)
- [ ] Enable managed Redis with persistence
- [ ] Set `MAINTENANCE_MODE=true` during deploy
- [ ] Run `alembic upgrade head` on production DB
- [ ] Smoke test: register → KYC → wallet → invest flow
- [ ] Set `MAINTENANCE_MODE=false`
- [ ] Monitor logs for first 24h

---

## 8. Test Credentials (Dev/Staging Only)

| Email | Password | Role | KYC Status |
|-------|----------|------|------------|
| admin@cireta.io | Admin123!@# | Admin | N/A |
| issuer@goldcorp.io | IssuerPass123! | Issuer | Approved |
| alice@investor.io | AlicePass123! | Investor | Approved (L2) |
| bob@investor.io | BobPass123! | Investor | Pending |
| charlie@investor.io | CharliePass123! | Investor | Not Started |
| eve@blocked.io | EvePass123! | Investor | Blocked |

> ⚠️ Never use these credentials in production. Rotate all secrets before mainnet.

---

## 9. Known Issues & Workarounds

| Issue | Severity | Workaround | Fix ETA |
|-------|----------|-----------|---------|
| Sale deploy needs 3s wait before on-chain status query | Low | E2E test adds `sleep 3` | No fix needed — blockchain confirmation time |
| Vested sale requires explicit phase addition after deploy | Medium | Admin must call `addPhase()` post-deploy | Phase auto-sync in Sprint 2 |
| Public RPC (`sepolia.base.org`) rate-limited under load | Medium | Use Alchemy/QuickNode with API key | Deploy config |
| Chainlink PoR returns 404 if no feed configured (expected) | Low | Configure feed address per token | Expected behavior |
| Docker Compose `entrypoint.sh` permission issues on some hosts | Low | Run API directly with `uvicorn` CMD | Dockerfile cleanup |

---

## 10. Roadmap — Phase 2

| Feature | Description | Priority |
|---------|-------------|---------|
| Secondary Market | Enable token trading between holders on integrated DEX | High |
| Fiat On-Ramp | Stripe/MoonPay integration for card→USDC | High |
| Mobile App | React Native investor app | Medium |
| Multi-Asset PoR | Batch Chainlink PoR updates | Medium |
| Governance | Token holder voting on platform decisions | Low |
| L3 KYC | Enhanced institutional investor verification | Medium |
| Analytics Dashboard | Real-time TVL, volume, holder metrics | High |
| Reporting API | Programmatic access to cap tables, compliance reports | Medium |

---

## 11. Repository

- **GitHub:** https://github.com/jawaddxb/cireta
- **Latest commit:** See `git log --oneline -5`
- **Key branches:** `main` (production), `develop` (staging)

---

*Document last updated: March 2026 — Cireta Engineering Team*
