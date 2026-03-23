# Cireta RWA Launchpad — Architecture Document

> **Created:** 2026-03-24 | **Author:** Zyda (Opus)
> **Version:** 2.0 (incorporating Sale Architecture V2)
> **Status:** Master reference for all development

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Contract Architecture](#2-contract-architecture)
3. [Backend Architecture](#3-backend-architecture)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Data Flow Diagrams](#5-data-flow-diagrams)
6. [Contract Addresses & Deployment Strategy](#6-contract-addresses--deployment-strategy)
7. [Security Model](#7-security-model)
8. [Infrastructure](#8-infrastructure)

---

## 1. System Overview

Cireta is a **regulated RWA (Real World Asset) tokenization launchpad** on Base (Ethereum L2). It enables issuers to create ERC-3643 compliant security tokens, conduct multi-phase token sales with KYC enforcement, and manage vesting/dividend/redemption lifecycles.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USERS                                          │
│   Investors (Browser + Wallet)    Issuers (Admin Portal)    Platform Admin  │
└──────────┬────────────────────────────┬──────────────────────────┬──────────┘
           │                            │                          │
           ▼                            ▼                          ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌──────────────────────┐
│   Launchpad App     │   │    Admin Portal      │   │   Admin Portal       │
│   (Next.js 15)      │   │    (Next.js 15)      │   │   (Platform Routes)  │
│   Port: 3000        │   │    Port: 3001        │   │   Same as Admin      │
│                     │   │                      │   │                      │
│   RainbowKit +      │   │   Issuer dashboard   │   │   Platform config    │
│   wagmi for Web3    │   │   Token/Sale mgmt    │   │   Compliance mgmt    │
│   TanStack Query    │   │   Investor views     │   │   User management    │
└──────────┬──────────┘   └──────────┬───────────┘   └──────────┬───────────┘
           │                         │                           │
           │        REST API (JSON)  │                           │
           ▼                         ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           FastAPI Backend                                    │
│                           Port: 8000                                         │
│                                                                              │
│   ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐     │
│   │ Auth     │  │ KYC      │  │ Sale         │  │ Web3 Services      │     │
│   │ Service  │  │ Service  │  │ Services     │  │ (Token, Sale,      │     │
│   │          │  │ (Sumsub) │  │ (CRUD+Logic) │  │  Identity, Vault,  │     │
│   │ JWT+MFA  │  │          │  │              │  │  Compliance, Tx)   │     │
│   └────┬─────┘  └────┬─────┘  └──────┬───────┘  └────────┬───────────┘     │
│        │              │               │                    │                 │
│   ┌────▼──────────────▼───────────────▼────────────────────▼─────────┐      │
│   │                    PostgreSQL (via SQLAlchemy)                     │      │
│   │   users, tokens, sales, contributions, vesting, wallets, etc.    │      │
│   └──────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│   │ Redis            │  │ arq Worker       │  │ Event Listener   │         │
│   │ JWT blacklist    │  │ Email, KYC,      │  │ Chain sync every │         │
│   │ Rate limiting    │  │ Screening,       │  │ 12s (per block)  │         │
│   │ Session cache    │  │ Reconciliation   │  │                  │         │
│   └──────────────────┘  └──────────────────┘  └──────────────────┘         │
└──────────────────────────────────────────────────────┬───────────────────────┘
                                                       │
                                                       │ Web3 RPC (JSON-RPC)
                                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Base (Ethereum L2)                                     │
│                                                                              │
│   Platform Contracts (deployed once):                                        │
│   ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐        │
│   │CiretaTokenFactory│  │CiretaSaleFactory │  │CiretaFractionFactory│       │
│   │(deploys ERC-3643)│  │(deploys Sales)   │  │(deploys Vault+Frac) │       │
│   └─────────────────┘  └──────────────────┘  └────────────────────┘        │
│                                                                              │
│   ┌─────────────────────┐  ┌───────────────────┐                           │
│   │PlatformFeeManager   │  │IssuerRegistry     │                           │
│   │(collects platform %) │  │(whitelist issuers)│                           │
│   └─────────────────────┘  └───────────────────┘                           │
│                                                                              │
│   ┌─────────────────────┐  ┌───────────────────┐                           │
│   │TrustedIssuersRegistry│  │ClaimTopicsRegistry│                           │
│   │(ONCHAINID issuers)  │  │(KYC/country/accr) │                           │
│   └─────────────────────┘  └───────────────────┘                           │
│                                                                              │
│   Per-Token Contracts:                                                       │
│   ┌─────────────────┐  ┌───────────────────┐  ┌────────────────────┐       │
│   │CiretaToken      │  │IdentityRegistry   │  │ModularCompliance   │       │
│   │(ERC-3643)       │  │(wallet→identity)  │  │(transfer rules)    │       │
│   └─────────────────┘  └───────────────────┘  └────────────────────┘       │
│                                                                              │
│   ┌─────────────────┐  ┌───────────────────┐  ┌────────────────────┐       │
│   │DividendDistrib. │  │RedemptionManager  │  │VestingVault (V1)   │       │
│   │(USDC payouts)   │  │(burn-to-redeem)   │  │(deprecated by V2)  │       │
│   └─────────────────┘  └───────────────────┘  └────────────────────┘       │
│                                                                              │
│   Per-Sale Contracts (V2):                                                   │
│   ┌─────────────────┐  ┌───────────────────┐  ┌────────────────────┐       │
│   │Sale             │  │CiretaFractionToken│  │CiretaVault         │       │
│   │(USDC escrow +   │  │(gated ERC-20      │  │(token lock +       │       │
│   │ multi-phase +   │  │ receipt token)     │  │ vesting +          │       │
│   │ dual mode)      │  │                   │  │ burn-to-release)   │       │
│   └─────────────────┘  └───────────────────┘  └────────────────────┘       │
│                                                                              │
│   Identity Contracts (per-user):                                             │
│   ┌─────────────────┐                                                       │
│   │ONCHAINID        │  ← One per user, deployed via CREATE2                │
│   │(claims: KYC,    │  ← Holds signed claims from platform                 │
│   │ country, accred)│                                                       │
│   └─────────────────┘                                                       │
│                                                                              │
│   External Contracts:                                                        │
│   ┌─────────────────┐                                                       │
│   │USDC (Circle)    │  ← Payment token for all sales                       │
│   │Base: 0x833589...│                                                       │
│   └─────────────────┘                                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Location |
|-------|-----------|----------|
| Frontend (Launchpad) | Next.js 15, React 19, TypeScript, Tailwind CSS, Framer Motion | `apps/launchpad/` |
| Frontend (Admin) | Next.js 15, React 19, TypeScript, Tailwind CSS, Recharts | `apps/admin/` |
| Web3 (Frontend) | wagmi v2, viem, RainbowKit, @safe-global/protocol-kit | `apps/launchpad/src/lib/wagmi.ts` |
| Backend API | Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2 | `apps/api/` |
| Shared Code | Python package with auth, config, DB, middleware | `packages/common/` |
| Smart Contracts | Solidity 0.8.24, Hardhat, OpenZeppelin Upgradeable (UUPS) | `contracts/` |
| Database | PostgreSQL 16 | `infra/alembic/` |
| Cache/Queue | Redis (JWT blacklist, rate limits, arq task queue) | `packages/common/core/cache.py` |
| Task Worker | arq (Redis-based, replaces Celery) | `apps/api/workers/` |
| KYC Provider | Sumsub (WebSDK + webhooks) | `apps/api/core/sumsub_crypto.py` |
| Email | Resend (transactional) | `apps/api/services/email_service.py` |
| Blockchain | Base (Chain ID 8453 mainnet, 84532 Sepolia) | `contracts/hardhat.config.ts` |

---

## 2. Contract Architecture

### 2.1 Contract Hierarchy & Relationships

```
                    PLATFORM LAYER (deployed once)
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  CiretaTokenFactory ─────┐                                 │
│  (src/platform/)          │ deploys                        │
│                           ▼                                 │
│  CiretaSaleFactory ──────┐     Per-Token Set:              │
│  (src/platform/)         │     ┌───────────────────┐       │
│                          │     │ CiretaToken (3643) │       │
│  CiretaFractionFactory──┐     │ IdentityRegistry   │       │
│  (src/platform/)        │     │ IdentityRegStorage │       │
│                         │     │ ModularCompliance  │       │
│  PlatformFeeManager     │     │ ClaimTopicsReg     │       │
│  (src/platform/)        │     │ TrustedIssuersReg  │       │
│                         │     └───────────────────┘       │
│  IssuerRegistry         │                                  │
│  (src/platform/)        │     Per-Sale Set:                │
│                         ▼     ┌───────────────────┐       │
│                               │ Sale               │       │
│                               │ CiretaFractionToken│ ←V2   │
│                               │ CiretaVault        │ ←V2   │
│                               └───────────────────┘       │
│                                                             │
│  Compliance Modules (bound to ModularCompliance):          │
│  ┌────────────────────────────────────────────────┐        │
│  │ CountryAllowModule      MaxBalanceModule       │        │
│  │ MaxOwnershipModule      MaxHolderCountModule   │        │
│  │ TimeTransfersLimitModule LockModule            │        │
│  │ ConditionalTransferModule TransferRestrictModule│        │
│  │ WhitelistModule         TimeLockedTransferModule│       │
│  └────────────────────────────────────────────────┘        │
│                                                             │
│  Token Lifecycle Contracts (per-token):                     │
│  ┌────────────────────────────────────────────────┐        │
│  │ DividendDistributor (USDC payouts)             │        │
│  │ RedemptionManager (commodity burn-to-redeem)   │        │
│  │ ChainlinkPoRChecker (proof of reserves)        │        │
│  └────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Contract Specifications

#### CiretaToken (ERC-3643) — `contracts/src/token/CiretaToken.sol`
- **Standard:** ERC-3643 (T-REX compatible security token)
- **Upgrade:** UUPS proxy pattern
- **Key functions:** `transfer()` with compliance check, `forcedTransfer()` (agent only), `freeze()`/`unfreeze()`, `pause()`/`unpause()`, `burn()`/`mint()`
- **Bound to:** IdentityRegistry (KYC gate), ModularCompliance (transfer rules)
- **Roles:** DEFAULT_ADMIN (factory/deployer), AGENT_ROLE (for forced transfers), SUPPLY_ROLE (mint/burn)

#### Sale (V2) — `contracts/src/sale/Sale.sol`
- **Current:** 331 lines, V1 (Direct mode only)
- **V2 additions:** `SaleMode` enum (Direct/Vested), `vault` + `fractionToken` state, dual-mode `contribute()`, vesting start on finalize, fraction burn on refund
- **Key state:**
  - `phases[]` — multi-phase with per-phase pricing, allocation, whitelist
  - `contributions[address]` — USDC amount, tokens allocated, claimed, refunded, isOtc
  - `totalRaised` — on-platform only (OTC excluded)
  - `feeBasisPoints` + `feeCapUsdc` — fee calculation with cap
  - `maxPerBlock` — front-running protection (line 72)
- **Lifecycle:** Draft → Active → Paused → FinalizedSuccess/FinalizedFailed
- **Fee logic (line 220-231):** Fee = min(totalRaised × bps / 10000, feeCapUsdc). OTC excluded.

#### CiretaFractionToken — `contracts/src/fraction/CiretaFractionToken.sol` (NEW — V2)
- **Standard:** ERC-20 with KYC gating (lighter than ERC-3643)
- **Purpose:** Receipt token representing claim on project tokens locked in vault
- **Transfer gate:** `_update()` checks `identityRegistry.isVerified()` for non-mint/burn transfers
- **Roles:** MINTER_ROLE (Sale), BURNER_ROLE (Vault), DEFAULT_ADMIN
- **Gas:** ~40% less than full ERC-3643 per transfer (no compliance module iteration)

#### CiretaVault — `contracts/src/vault/CiretaVault.sol` (NEW — V2)
- **Purpose:** Locks project tokens, releases 1:1 when fractions burned, with vesting schedule
- **Vesting:** Configurable cliff + linear duration, per-investor tracking
- **Claim flow:** `claim()` → calculate vested → burn fractions → release project tokens (CEI pattern)
- **Excess policy:** `Keep` (issuer retains after claims) or `BurnToMatch` (strict 1:1 backing)
- **Key views:** `getClaimable(investor)`, `getBackingRatio()`, `getVested(investor)`
- **Guards:** onlySale for setup, onlyIssuer for excess withdrawal, nonReentrant on claim

#### CiretaFractionFactory — `contracts/src/platform/CiretaFractionFactory.sol` (NEW — V2)
- **Purpose:** Deploys fraction+vault pairs via UUPS proxies for each vested sale
- **Deployment:** Single `deployVaultAndFraction()` call creates both, grants roles, tracks in mappings
- **State:** `saleToVault[]`, `saleToFraction[]`, implementation addresses

#### Identity Contracts
- **IdentityRegistry** (`contracts/src/token/IdentityRegistry.sol`) — maps wallet→ONCHAINID, `isVerified()` check used by token + fraction transfers
- **IdentityRegistryStorage** (`contracts/src/platform/IdentityRegistryStorage.sol`) — stores identity bindings
- **ClaimTopicsRegistry** (`contracts/src/platform/ClaimTopicsRegistry.sol`) — required claim topics (1=KYC, 2=Country, 3=Accredited)
- **TrustedIssuersRegistry** (`contracts/src/platform/TrustedIssuersRegistry.sol`) — platform deployer as trusted claim issuer
- **ONCHAINID** (per-user, deployed via CREATE2) — holds signed claims

### 2.3 Upgrade Pattern

All Cireta contracts use **UUPS (Universal Upgradeable Proxy Standard)**:
- Each contract deployed as an ERC1967Proxy pointing to an implementation
- `_authorizeUpgrade()` restricted to owner/admin role
- Factory contracts store implementation addresses and deploy proxies
- Upgrade process: deploy new implementation → call `upgradeTo(newImpl)` on proxy

```
Proxy (stores state) ──delegates to──→ Implementation (stores logic)
                                              │
                                     upgradeTo(newImpl)
                                              │
                                              ▼
                                    New Implementation
```

---

## 3. Backend Architecture

### 3.1 Directory Structure

```
apps/api/
├── main.py                          # FastAPI app, middleware, CORS, lifespan
├── api/v1/
│   ├── router.py                    # Route aggregation
│   └── endpoints/
│       ├── auth.py                  # Login, register, refresh, password reset, MFA
│       ├── kyc.py                   # Sumsub webhooks, access tokens
│       ├── wallets.py               # Link/unlink, SIWE verification
│       ├── tokens.py                # Token CRUD, deploy
│       ├── sales.py                 # Sale CRUD, phases, contribute, OTC
│       ├── portfolio.py             # Holdings, vesting, dividends, transactions
│       ├── health.py                # /live, /ready health checks
│       ├── notifications.py         # User notification preferences
│       ├── admin.py                 # Platform admin operations
│       ├── admin_compliance.py      # Freeze, recover, pause, trusted issuers
│       ├── admin_investors.py       # Investor management
│       ├── admin_issuers.py         # Issuer whitelisting, fees
│       ├── admin_operations.py      # Analytics, system health, webhooks
│       └── issuer_withdrawals.py    # USDC withdrawal management
├── models/
│   ├── user.py                      # User + auth + KYC fields
│   ├── wallet.py                    # Linked wallets + screening
│   ├── token.py                     # ERC-3643 token metadata + contract addresses
│   ├── token_sale.py                # Sale config + status + V2 fields
│   ├── sale_phase.py                # Per-phase config
│   ├── sale_phase_whitelist.py      # Whitelist entries per phase
│   ├── contribution.py              # Investor contributions + tx_hash
│   ├── vesting_schedule.py          # Vesting config per investor
│   ├── redemption_request.py        # Commodity redemption requests
│   ├── dividend_distribution.py     # Dividend epochs + claims
│   ├── issuer.py                    # Issuer entities + fees
│   ├── audit_log.py                 # All compliance/admin actions
│   ├── notification.py              # User notifications
│   ├── notification_preferences.py  # Notification settings
│   ├── platform_setting.py          # Global platform config
│   ├── recovery_log.py              # Token recovery audit trail
│   ├── kyc_application.py           # KYC application tracking
│   ├── token_document.py            # IPFS document references
│   └── enums.py                     # Shared enums
├── schemas/                         # Pydantic v2 request/response schemas
│   ├── auth.py, kyc.py, sale.py, token.py, portfolio.py, wallet.py, ...
├── services/
│   ├── auth_service.py              # JWT, password, session, brute force protection
│   ├── kyc_service.py               # Sumsub integration, level management
│   ├── wallet_service.py            # SIWE, link/unlink, screening hook
│   ├── token_service.py             # Token CRUD
│   ├── sale_service.py              # Sale CRUD orchestration
│   ├── sale_create_service.py       # Sale creation logic
│   ├── sale_query_service.py        # Sale queries
│   ├── sale_contribute_service.py   # Contribution logic (465 lines — core business logic)
│   ├── portfolio_service.py         # Portfolio aggregation
│   ├── vesting_service.py           # Vesting schedule management
│   ├── redemption_service.py        # Redemption request flow
│   ├── compliance_service.py        # Compliance check orchestration
│   ├── compliance_base_service.py   # Base compliance operations
│   ├── compliance_action_service.py # On-chain compliance actions (freeze, forced transfer, etc.)
│   ├── issuer_service.py            # Issuer management
│   ├── email_service.py             # Resend transactional email
│   ├── notification_service.py      # In-app notifications
│   ├── platform_settings_service.py # Platform config CRUD
│   ├── web3_base_service.py         # Base web3 service (provider, signing)
│   ├── web3_service.py              # Legacy web3 operations
│   ├── web3_token_service.py        # Token deployment via factory (250 lines)
│   ├── web3_identity_service.py     # ONCHAINID deploy + claims (271 lines — needs fix)
│   ├── web3_sale_service.py         # NEW: Sale deployment + contribution recording
│   ├── web3_vault_service.py        # NEW: Vault queries + claim orchestration
│   ├── web3_tx_service.py           # NEW: Transaction submission + receipt handling
│   ├── wallet_screening_service.py  # NEW: Sanctions/risk screening
│   ├── mfa_service.py               # NEW: TOTP 2FA
│   ├── dividend_service.py          # NEW: Dividend distribution
│   └── event_listener_service.py    # NEW: Chain event sync
├── core/
│   ├── config.py                    # Settings via pydantic-settings
│   ├── contract_registry.py         # ABI loading + contract instantiation (115 lines)
│   ├── sumsub_crypto.py             # Sumsub HMAC verification
│   ├── tokens.py                    # JWT token creation/validation
│   └── web3_provider.py             # NEW: Circuit breaker + fallback RPC
├── workers/
│   ├── worker.py                    # arq worker configuration
│   └── tasks.py                     # Background tasks (email, KYC, screening, sync, reconciliation)
└── __init__.py

packages/common/
├── config/defaults.py               # Default configuration values
├── core/
│   ├── config.py                    # Base settings class
│   ├── cache.py                     # Redis client
│   ├── auth_deps.py                 # FastAPI auth dependencies
│   ├── service_deps.py              # Service dependency injection
│   └── logging.py                   # Structured JSON logging
├── db/
│   ├── base.py                      # SQLAlchemy Base model
│   ├── session.py                   # Async session factory
│   └── repository.py               # Generic CRUD repository
├── middleware/
│   ├── logging_middleware.py        # Request/response logging with correlation IDs
│   ├── rate_limit.py                # Redis-backed per-endpoint rate limiting
│   └── security_headers.py         # CSP, X-Frame-Options, etc.
├── models/
│   ├── base.py                      # Shared model base (id, timestamps)
│   └── encrypted_types.py          # SQLAlchemy encrypted column types
├── services/
│   ├── auth_service.py              # JWT blacklist + token validation (67 lines)
│   └── base_service.py             # Service base class with DB session
└── utils/
    ├── error_handlers.py            # Global exception handlers
    └── http_errors.py               # Standard HTTP error responses
```

### 3.2 Service Layer Design

Services follow a consistent pattern:

```python
class ExampleService(BaseService):
    """All business logic lives in services, not endpoints."""
    
    def __init__(self, db: AsyncSession):
        super().__init__(db)
    
    async def do_something(self, input: Schema) -> Result:
        # 1. Validate input
        # 2. Check authorization
        # 3. Execute business logic
        # 4. Interact with DB (via self.db)
        # 5. Interact with blockchain (via web3 services)
        # 6. Return result
```

**Key services and their responsibilities:**

| Service | File | Lines | Responsibility |
|---------|------|-------|----------------|
| `SaleContributeService` | `sale_contribute_service.py` | 465 | Core business logic: validate contribution, check whitelist/limits/KYC, record on-chain contribution, handle claims and refunds |
| `Web3TokenService` | `web3_token_service.py` | 250 | Deploy ERC-3643 token sets via CiretaTokenFactory |
| `Web3IdentityService` | `web3_identity_service.py` | 271 | Deploy ONCHAINID, issue KYC/country claims, register in IdentityRegistry |
| `ComplianceActionService` | `compliance_action_service.py` | ~150 | On-chain freeze, unfreeze, forced transfer, recover, pause, unpause + audit logs |
| `AuthService` (common) | `packages/common/services/auth_service.py` | 67 | JWT blacklist via Redis with in-memory fallback |
| `ContractRegistry` | `core/contract_registry.py` | 115 | Load ABIs from Hardhat artifacts, create web3 contract instances |

### 3.3 Database Schema (Key Tables)

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    users      │     │    wallets        │     │  kyc_applications │
│──────────────│     │──────────────────│     │──────────────────│
│ id           │──┐  │ id               │     │ id               │
│ email        │  │  │ user_id (FK)     │──┐  │ user_id (FK)     │
│ password_hash│  ├──│ address          │  │  │ sumsub_id        │
│ kyc_level    │  │  │ is_primary       │  │  │ status           │
│ kyc_expires_at│ │  │ risk_score       │  │  │ level            │
│ is_accredited│  │  │ last_screened_at │  │  └──────────────────┘
│ is_admin     │  │  │ registered_on_chain│ │
│ mfa_enabled  │  │  └──────────────────┘  │
│ mfa_secret   │  │                         │
└──────────────┘  │  ┌──────────────────┐   │
                  │  │    issuers        │   │
                  │  │──────────────────│   │
                  │  │ id               │   │
                  ├──│ user_id (FK)     │   │
                  │  │ legal_entity_name│   │
                  │  │ jurisdiction     │   │
                  │  │ fee_basis_points │   │
                  │  │ status           │   │
                  │  └──────────────────┘   │
                  │                          │
┌──────────────┐  │  ┌──────────────────┐   │
│   tokens      │  │  │  token_sales     │   │
│──────────────│  │  │──────────────────│   │
│ id           │  │  │ id               │   │
│ issuer_id(FK)│  │  │ token_id (FK)    │   │
│ name/symbol  │  │  │ status           │   │
│ total_supply │  │  │ soft_cap/hard_cap│   │
│ contract_addr│  │  │ total_raised_...  │  │
│ identity_reg.│  │  │ sale_mode        │   │  ← Direct/Vested
│ compliance_  │  │  │ vault_address    │   │  ← V2
│ sale_contract│  │  │ fraction_token_  │   │  ← V2
│ vault_address│  │  │ fee_cap_usdc     │   │
│ fraction_tok.│  │  │ platform_fee_bps │   │
│ slug         │  │  │ platform_fee_... │   │
│ image_url    │  │  └────────┬─────────┘   │
│ description  │  │           │              │
└──────────────┘  │  ┌────────▼─────────┐   │
                  │  │  sale_phases      │   │
                  │  │──────────────────│   │
                  │  │ id               │   │
                  │  │ sale_id (FK)     │   │
                  │  │ name             │   │
                  │  │ price_per_token  │   │
                  │  │ allocation       │   │
                  │  │ min/max_contrib  │   │
                  │  │ start/end_time   │   │
                  │  │ whitelist_only   │   │
                  │  └──────────────────┘   │
                  │                          │
                  │  ┌──────────────────┐   │
                  │  │  contributions    │   │
                  │  │──────────────────│   │
                  │  │ id               │   │
                  ├──│ user_id (FK)     │   │
                  │  │ sale_id (FK)     │   │
                  │  │ wallet_address   │   │
                  │  │ tx_hash (unique) │   │  ← Dedup key
                  │  │ amount           │   │
                  │  │ tokens_allocated │   │
                  │  │ phase_index      │   │
                  │  │ is_otc           │   │
                  │  │ status           │   │
                  │  │ acknowledged_at  │   │  ← Compliance acknowledgment
                  │  └──────────────────┘   │
                  │                          │
                  │  ┌──────────────────┐   │
                  │  │vesting_schedules │   │
                  │  │──────────────────│   │
                  ├──│ user_id (FK)     │   │
                     │ token_id (FK)    │   │
                     │ total_amount     │   │
                     │ cliff_end_date   │   │
                     │ vesting_end_date │   │
                     │ claimed_amount   │   │
                     │ is_revocable     │   │
                     │ is_revoked       │   │
                     └──────────────────┘

                  ┌──────────────────┐    ┌──────────────────┐
                  │redemption_requests│    │  audit_logs       │
                  │──────────────────│    │──────────────────│
                  │ id               │    │ id               │
                  │ user_id (FK)     │    │ user_id          │
                  │ token_id (FK)    │    │ action           │
                  │ amount           │    │ target           │
                  │ status           │    │ details (JSON)   │
                  │ rejection_reason │    │ tx_hash          │
                  │ delivery_details │    │ created_at       │
                  │ delivery_name    │    └──────────────────┘
                  │ delivery_address │
                  │ delivery_phone   │
                  └──────────────────┘

                  ┌──────────────────┐
                  │  webhook_events   │  ← NEW (Sprint 4)
                  │──────────────────│
                  │ id               │
                  │ provider         │
                  │ payload (JSON)   │
                  │ status           │  pending/processed/failed
                  │ attempts         │
                  │ last_error       │
                  │ created_at       │
                  │ processed_at     │
                  └──────────────────┘
```

### 3.4 Migrations

Located at `infra/alembic/versions/`:

| Migration | Description |
|-----------|-------------|
| `001_initial_schema.py` | Base tables (users, wallets, tokens, sales, etc.) |
| `002_cireta_initial_schema.py` | Cireta-specific extensions |
| `003_spec_gap_fields.py` | Sprint 0.5 data model gaps |
| `004_contract_addresses_and_sale_fields.py` | Per-token/sale contract addresses, V2 fields |
| `9cd097779a53_add_slug_description_image_url_to_tokens.py` | Token metadata fields |

---

## 4. Frontend Architecture

### 4.1 Launchpad App (`apps/launchpad/`)

```
apps/launchpad/src/
├── app/                              # Next.js 15 App Router
│   ├── page.tsx                      # Home — hero + project grid + stats
│   ├── layout.tsx                    # Root layout with providers
│   ├── explore/page.tsx              # Browse projects with filters
│   ├── project/[slug]/page.tsx       # Project detail — 6 tabs
│   ├── invest/[slug]/page.tsx        # Investment flow wrapper
│   ├── login/page.tsx                # Email + password + Google OAuth
│   ├── register/page.tsx             # Registration
│   ├── forgot-password/page.tsx      # Password reset
│   ├── reset-password/page.tsx       # Password reset confirmation
│   ├── verify/page.tsx               # KYC verification (Sumsub WebSDK)
│   ├── verify/corporate/page.tsx     # KYB corporate verification
│   ├── account/page.tsx              # Account overview
│   ├── portfolio/
│   │   ├── page.tsx                  # Portfolio dashboard
│   │   ├── holdings/page.tsx         # Token holdings
│   │   ├── vesting/page.tsx          # Vesting schedules
│   │   ├── dividends/page.tsx        # Claimable dividends
│   │   ├── transactions/page.tsx     # Transaction history
│   │   ├── claim/[token]/page.tsx    # Claim tokens (direct + vested)
│   │   └── redeem/[token]/page.tsx   # Commodity redemption
│   └── settings/
│       ├── layout.tsx                # Settings sidebar
│       ├── page.tsx                  # Settings redirect
│       ├── profile/page.tsx          # Profile edit
│       ├── verification/page.tsx     # KYC status
│       ├── wallets/page.tsx          # Wallet management
│       └── notifications/page.tsx    # Notification preferences
├── components/
│   ├── atoms/                        # Button, Input, Badge, Avatar, Spinner, etc.
│   ├── molecules/                    # ProjectCard, StatCard, PhaseCard, TxRow, KYCBadge, WalletBadge
│   ├── organisms/                    # InvestFlow, InvestSidebar, Navbar, Footer, HeroSection, ProjectGrid, PortfolioTable, SumsubVerification, VestingCard, ComplianceFeatures
│   ├── providers/                    # AppProviders (auth + web3 + query), ClientProviders
│   └── templates/                    # DashboardLayout, PageLayout, SplitAuthLayout
├── contexts/
│   ├── AuthContext.tsx               # Auth state, login/logout, token refresh
│   ├── KYCContext.tsx                # KYC level, verification status
│   └── Web3Context.tsx               # Wallet connection, chain detection, Safe detection
├── lib/
│   ├── api/
│   │   ├── client.ts                 # Axios client with auth interceptor
│   │   └── repositories/            # API call wrappers per domain
│   ├── contracts/                    # NEW: ABI exports + address constants
│   │   ├── saleAbi.ts              # Sale contract ABI
│   │   ├── vaultAbi.ts             # CiretaVault ABI
│   │   └── addresses.ts            # Contract addresses per chain
│   ├── hooks/
│   │   └── useAuth.ts              # Auth hook
│   ├── safe/                        # NEW: Safe Protocol Kit integration
│   │   └── safeClient.ts           # Propose/execute helpers
│   ├── utils.ts                     # Formatting, date helpers
│   └── wagmi.ts                     # wagmi + RainbowKit config
└── middleware.ts                     # Auth redirect middleware
```

### 4.2 Web3 Integration Pattern

```
User Action (e.g., "Invest $10,000")
         │
         ▼
┌─────────────────────────────────────────┐
│  InvestFlow.tsx (React Component)        │
│                                          │
│  Step 1: Amount input + validation       │
│  Step 2: Review + compliance checkbox    │
│  Step 3: USDC Approve                    │
│    → useWriteContract(USDC.approve)      │
│    → wait for tx receipt                 │
│  Step 4: Contribute on-chain             │
│    → useWriteContract(Sale.contribute)   │   ← Currently missing (CRITICAL)
│    → wait for tx receipt                 │
│    → POST /contributions {tx_hash}       │   ← Backend records from chain
│  Step 5: Success                         │
│    → Show tx hash + BaseScan link        │
└─────────────────────────────────────────┘
```

### 4.3 Admin Portal (`apps/admin/`)

Two-tier routing:
- **Issuer routes** (`/issuer/*`): Token management, sale management, investor views, compliance actions, reports
- **Platform routes** (`/platform/*`): Issuer whitelisting, global compliance, analytics, system health, user management

Layout: `IssuerDashboardLayout` (sidebar + topbar) and `PlatformAdminLayout` (similar, different nav).

### 4.4 State Management

| Concern | Solution | Location |
|---------|----------|----------|
| Server state | TanStack Query (react-query) | API repository hooks |
| Auth state | React Context + localStorage | `AuthContext.tsx` |
| Web3 state | wagmi hooks + RainbowKit | `Web3Context.tsx`, `wagmi.ts` |
| KYC state | React Context | `KYCContext.tsx` |
| Form state | React Hook Form | Inline in page components |
| UI animations | Framer Motion | Component-level |

---

## 5. Data Flow Diagrams

### 5.1 Investor Contribution Flow (End-to-End)

```
┌──────────┐                    ┌──────────┐                  ┌──────────┐
│ INVESTOR  │                    │ FRONTEND  │                  │ BACKEND   │
│ (Browser) │                    │ (Next.js) │                  │ (FastAPI) │
└─────┬────┘                    └─────┬────┘                  └─────┬────┘
      │                               │                              │
      │  1. Click "Invest"            │                              │
      │──────────────────────────────→│                              │
      │                               │                              │
      │  2. Enter amount ($10,000)    │                              │
      │──────────────────────────────→│                              │
      │                               │  3. Validate:                │
      │                               │  - min/max per phase         │
      │                               │  - cumulative limit          │
      │                               │  - USDC balance check        │
      │                               │                              │
      │  4. Show review + checkboxes  │                              │
      │←──────────────────────────────│                              │
      │                               │                              │
      │  5. Check both compliance     │                              │
      │     checkboxes + confirm      │                              │
      │──────────────────────────────→│                              │
      │                               │                              │
      │         ┌─────────────────────────────────────────────────────────┐
      │         │                     BASE BLOCKCHAIN                     │
      │         └─────────────────────────────────────────────────────────┘
      │                               │                              │
      │  6. Sign USDC.approve(sale,   │                              │
      │     amount) in wallet         │                              │
      │──────────────────────────────→│                              │
      │                               │──────── tx to Base ─────────→│
      │                               │←──── approval receipt ──────│
      │                               │                              │
      │  7. Sign Sale.contribute(     │                              │
      │     phaseId, amount) in wallet│                              │
      │──────────────────────────────→│                              │
      │                               │──────── tx to Base ─────────→│
      │                               │                              │
      │         ┌─────────────────────────────────────────────────────────┐
      │         │  Sale.contribute() executes on-chain:                   │
      │         │  • USDC transferred: Investor → Sale contract           │
      │         │  • Tokens calculated: $10K / pricePerToken              │
      │         │  • IF Direct: projectToken.transfer(investor, tokens)   │
      │         │  • IF Vested: fractionToken.mint(investor, tokens)      │
      │         │              vault.recordAllocation(investor, tokens)   │
      │         │  • Event: ContributionMade(investor, phase, amt, tokens)│
      │         └─────────────────────────────────────────────────────────┘
      │                               │                              │
      │                               │←──── contribute receipt ────│
      │                               │                              │
      │                               │  8. POST /contributions      │
      │                               │     { tx_hash, sale_id }     │
      │                               │────────────────────────────→│
      │                               │                              │
      │                               │           9. Backend:        │
      │                               │           - Read receipt     │
      │                               │           - Parse event      │
      │                               │           - Verify amounts   │
      │                               │           - Create row in DB │
      │                               │           - Dedup by tx_hash │
      │                               │                              │
      │                               │←────── 200 OK ──────────────│
      │                               │                              │
      │  10. Show success:            │                              │
      │  "Contributed $10,000"        │                              │
      │  tx: 0xabc... (BaseScan link) │                              │
      │←──────────────────────────────│                              │
```

### 5.2 Token Creation + Deployment Flow

```
┌──────────┐                    ┌──────────┐                  ┌──────────┐
│  ISSUER   │                    │  ADMIN    │                  │ BACKEND   │
│ (Browser) │                    │  PORTAL   │                  │ (FastAPI) │
└─────┬────┘                    └─────┬────┘                  └─────┬────┘
      │                               │                              │
      │  1. Fill token wizard:        │                              │
      │  Name, symbol, supply, type,  │                              │
      │  compliance modules           │                              │
      │──────────────────────────────→│                              │
      │                               │  2. POST /tokens              │
      │                               │────────────────────────────→│
      │                               │                              │  3. Save to DB
      │                               │←────── Token created ───────│     (status: DRAFT)
      │                               │                              │
      │  4. Click "Deploy to Base"    │                              │
      │──────────────────────────────→│                              │
      │                               │  5. POST /tokens/{id}/deploy │
      │                               │────────────────────────────→│
      │                               │                              │
      │         ┌─────────────────────────────────────────────────────────┐
      │         │  Backend calls CiretaTokenFactory.deployToken():        │
      │         │  1. Deploy CiretaToken proxy (ERC-3643)                 │
      │         │  2. Deploy IdentityRegistry proxy                       │
      │         │  3. Deploy IdentityRegistryStorage proxy                │
      │         │  4. Deploy ModularCompliance proxy                      │
      │         │  5. Bind: token ↔ identityRegistry ↔ compliance         │
      │         │  6. Add compliance modules (CountryAllow, etc.)          │
      │         │  7. Mint total supply to issuer                          │
      │         │  8. Event: TokenDeployed(token, registry, compliance)    │
      │         └─────────────────────────────────────────────────────────┘
      │                               │                              │
      │                               │                              │  6. Store addresses:
      │                               │                              │     token.contract_address
      │                               │                              │     token.identity_registry_address
      │                               │                              │     token.compliance_address
      │                               │                              │     Status: DEPLOYED
      │                               │←────── Deploy complete ─────│
      │  7. See deployed token with   │                              │
      │     BaseScan links            │                              │
      │←──────────────────────────────│                              │
```

### 5.3 Sale Lifecycle (Create → Activate → Contribute → Finalize → Claim/Refund)

```
STATE MACHINE:

    ┌───────┐    activate()    ┌────────┐    pause()     ┌────────┐
    │ DRAFT │ ────────────────→│ ACTIVE │ ──────────────→│ PAUSED │
    └───────┘                  └───┬────┘                └───┬────┘
                                   │                         │
                                   │ resume()                │
                                   │←────────────────────────┘
                                   │
                contribute()       │     hardCap reached
                (multiple) ────────┤     OR manual finalize
                                   │
                                   ▼
                          ┌─────────────────┐
                          │   _finalize()    │
                          │                  │
                          │ totalRaised      │
                          │ >= softCap?      │
                          │                  │
                     YES  │            NO    │
                    ┌─────┘─────┐    ┌──────┘────┐
                    ▼           │    ▼            │
          ┌──────────────┐     │   ┌─────────────┐
          │ FINALIZED    │     │   │ FINALIZED   │
          │ SUCCESS      │     │   │ FAILED      │
          └──────┬───────┘     │   └──────┬──────┘
                 │             │          │
                 ▼             │          ▼
         Fee calculated        │   claimRefund()
         USDC → issuer         │   USDC → investor
         (vault.startVesting   │   (fractions burned
          if Vested)           │    if Vested)
                 │             │
                 ▼             │
         claimTokens()         │
         (Direct mode)         │
         OR vault.claim()      │
         (Vested mode)         │
```

**Finalization Detail:**
```
_finalize() [Sale.sol line 220-231]:
  │
  ├── totalRaised >= softCap?
  │   ├── YES → FinalizedSuccess
  │   │   ├── fee = min(totalRaised × feeBasisPoints / 10000, feeCapUsdc)
  │   │   ├── USDC.transfer(feeManager, fee)
  │   │   ├── USDC.transfer(issuer, totalRaised - fee)
  │   │   └── IF Vested: vault.startVesting()
  │   │
  │   └── NO → FinalizedFailed
  │       └── Investors can call claimRefund()
```

### 5.4 KYC → ONCHAINID → Claim Issuance Flow

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ INVESTOR  │   │ FRONTEND  │   │ SUMSUB    │   │ BACKEND   │   │  BASE    │
└─────┬────┘   └─────┬────┘   └─────┬────┘   └─────┬────┘   └─────┬────┘
      │               │              │               │              │
      │ 1. Click      │              │               │              │
      │ "Verify KYC"  │              │               │              │
      │──────────────→│              │               │              │
      │               │ 2. GET /kyc/access-token     │              │
      │               │────────────────────────────→│              │
      │               │              │               │ 3. Generate  │
      │               │              │               │    Sumsub    │
      │               │              │               │    token     │
      │               │←───────── token ────────────│              │
      │               │              │               │              │
      │ 4. Sumsub     │              │               │              │
      │    WebSDK     │              │               │              │
      │    launches   │──────────────│               │              │
      │               │              │               │              │
      │ 5. Submit     │              │               │              │
      │    ID + selfie│              │               │              │
      │──────────────→│─────────────→│               │              │
      │               │              │               │              │
      │               │              │ 6. Sumsub     │              │
      │               │              │    reviews    │              │
      │               │              │    (auto/     │              │
      │               │              │     manual)   │              │
      │               │              │               │              │
      │               │              │ 7. Webhook:   │              │
      │               │              │ applicantReviewed            │
      │               │              │──────────────→│              │
      │               │              │               │              │
      │               │              │               │ 8. Verify    │
      │               │              │               │    HMAC-256  │
      │               │              │               │              │
      │               │              │               │ 9. If APPROVED:
      │               │              │               │    a. Set kyc_level=2
      │               │              │               │    b. Set kyc_expires_at
      │               │              │               │              │
      │               │              │               │ 10. Deploy   │
      │               │              │               │     ONCHAINID│
      │               │              │               │────────────→│
      │               │              │               │              │ CREATE2:
      │               │              │               │              │ 0xff + factory
      │               │              │               │              │ + salt(wallet)
      │               │              │               │              │ + keccak(init)
      │               │              │               │←── address ──│
      │               │              │               │              │
      │               │              │               │ 11. Issue    │
      │               │              │               │     claims:  │
      │               │              │               │              │
      │               │              │               │  a. KYC claim│
      │               │              │               │     topic=1  │
      │               │              │               │     data=L1  │
      │               │              │               │     expiry=  │
      │               │              │               │     now+365d │
      │               │              │               │     sig=ECDSA│
      │               │              │               │────────────→│
      │               │              │               │              │ identity.addClaim()
      │               │              │               │              │
      │               │              │               │  b. Country  │
      │               │              │               │     topic=2  │
      │               │              │               │     data=AE  │
      │               │              │               │     sig=ECDSA│
      │               │              │               │────────────→│
      │               │              │               │              │ identity.addClaim()
      │               │              │               │              │
      │               │              │               │ 12. Register │
      │               │              │               │     in IR:   │
      │               │              │               │────────────→│
      │               │              │               │              │ identityRegistry
      │               │              │               │              │  .registerIdentity(
      │               │              │               │              │    wallet,
      │               │              │               │              │    identity,
      │               │              │               │              │    country)
      │               │              │               │              │
      │               │              │               │ 13. Store    │
      │               │              │               │     identity │
      │               │              │               │     address  │
      │               │              │               │     on user  │
      │               │              │               │              │
      │ 14. "KYC Verified" badge     │               │              │
      │←──────────────────────────────────────────────│              │
```

### 5.5 Dividend Distribution Flow

```
┌──────────┐                  ┌──────────┐                  ┌──────────┐
│  ISSUER   │                  │ BACKEND   │                  │   BASE    │
└─────┬────┘                  └─────┬────┘                  └─────┬────┘
      │                              │                              │
      │  1. POST /admin/dividends/   │                              │
      │     {token_id, amount}       │                              │
      │────────────────────────────→│                              │
      │                              │  2. Call DividendDistributor  │
      │                              │     .depositDividend(amount)  │
      │                              │────────────────────────────→│
      │                              │                              │
      │                              │  ┌────────────────────────────────┐
      │                              │  │  DividendDistributor:          │
      │                              │  │  • USDC transferred to contract│
      │                              │  │  • New epoch created           │
      │                              │  │  • Per-holder amounts recorded │
      │                              │  │    based on balanceOf() at     │
      │                              │  │    snapshot block              │
      │                              │  └────────────────────────────────┘
      │                              │                              │
      │←───── Deposit confirmed ─────│                              │

┌──────────┐                  ┌──────────┐                  ┌──────────┐
│ INVESTOR  │                  │ FRONTEND  │                  │   BASE    │
└─────┬────┘                  └─────┬────┘                  └─────┬────┘
      │                              │                              │
      │  3. View /portfolio/dividends│                              │
      │────────────────────────────→│  4. GET /portfolio/dividends  │
      │                              │────────────────────────────→│
      │                              │                              │
      │                              │     calls DividendDistributor│
      │                              │     .getClaimable(wallet)    │
      │                              │────────────────────────────→│
      │                              │←──── claimable amounts ─────│
      │                              │                              │
      │  5. See: "$500 claimable"    │                              │
      │←────────────────────────────│                              │
      │                              │                              │
      │  6. Click "Claim Dividend"   │                              │
      │────────────────────────────→│                              │
      │                              │  7. DividendDistributor      │
      │                              │     .claimDividend(epoch)    │
      │                              │     (signed by investor)     │
      │                              │────────────────────────────→│
      │                              │                              │ USDC → investor
      │                              │←──── claim receipt ──────────│
      │                              │                              │
      │  8. "$500 USDC received"     │                              │
      │←────────────────────────────│                              │
```

### 5.6 Vesting + Redemption Flow

```
VESTING CLAIM:

  Time: sale finalized at T=0, cliff=90d, vesting=180d

  T=0:    Investor holds 100 frWMAU, 0 WMAU, vault holds 100 WMAU
  T=30d:  Investor holds 100 frWMAU, 0 WMAU (before cliff)
  T=90d:  Cliff reached → 50 WMAU claimable (90/180 = 50%)
  T=135d: 75 WMAU claimable (135/180 = 75%)
  T=180d: 100 WMAU claimable (fully vested)

  ┌──────────┐                                  ┌──────────┐
  │ INVESTOR  │                                  │   BASE    │
  └─────┬────┘                                  └─────┬────┘
        │                                              │
        │  vault.claim()                               │
        │────────────────────────────────────────────→│
        │                                              │
        │  ┌──────────────────────────────────────────────┐
        │  │  CiretaVault.claim():                        │
        │  │  1. vested = totalFractions × elapsed / dur  │
        │  │  2. claimable = vested - claimedAmount       │
        │  │  3. Update claimedAmount += claimable        │
        │  │  4. fractionToken.burnFrom(investor, clmbl)  │
        │  │  5. projectToken.transfer(investor, clmbl)   │
        │  └──────────────────────────────────────────────┘
        │                                              │
        │←─── Receipt (FractionsBurned + TokensClaimed)│

  After claim at T=90d:
    Investor: 50 frWMAU, 50 WMAU
    Vault: 50 WMAU locked

  After claim at T=180d:
    Investor: 0 frWMAU, 100 WMAU
    Vault: 0 WMAU locked ✓

COMMODITY REDEMPTION (post-vesting, investor holds WMAU):

  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ INVESTOR  │   │ FRONTEND  │   │ BACKEND   │   │   BASE    │
  └─────┬────┘   └─────┬────┘   └─────┬────┘   └─────┬────┘
        │               │              │               │
        │ Request redeem│              │               │
        │ 10 WMAU       │              │               │
        │──────────────→│ POST /redeem │               │
        │               │────────────→│               │
        │               │              │ Create request │
        │               │              │ status=PENDING │
        │               │←── 201 ─────│               │
        │               │              │               │
        │  [Issuer reviews + approves] │               │
        │               │              │               │
        │               │              │ Approve:       │
        │               │              │ RedemptionMgr  │
        │               │              │ .approveRedeem │
        │               │              │────────────────→│ burn 10 WMAU
        │               │              │                │ from investor
        │               │              │←── receipt ────│
        │               │              │                │
        │ "Redeemed —   │              │ Update status  │
        │  delivery in  │              │ = APPROVED     │
        │  5-10 days"   │              │                │
        │←──────────────│←─────────────│                │
```

---

## 6. Contract Addresses & Deployment Strategy

### 6.1 Deployment Order (One-Time Platform Setup)

```
Step 1: Deploy implementation contracts (logic only, no state)
  ├── CiretaToken implementation
  ├── IdentityRegistry implementation
  ├── IdentityRegistryStorage implementation
  ├── ModularCompliance implementation
  ├── Sale implementation (V2 with SaleMode)
  ├── CiretaFractionToken implementation          ← NEW
  └── CiretaVault implementation                   ← NEW

Step 2: Deploy platform infrastructure
  ├── PlatformFeeManager (receives platform fees)
  ├── IssuerRegistry (whitelist issuers)
  ├── ClaimTopicsRegistry (KYC topics)
  ├── TrustedIssuersRegistry (platform as trusted issuer)
  ├── CiretaTokenFactory (deploys token sets)
  ├── CiretaSaleFactory (deploys sales)
  └── CiretaFractionFactory (deploys vault+fraction) ← NEW

Step 3: Configure platform
  ├── Add claim topics: [1=KYC, 2=COUNTRY, 3=ACCREDITED]
  ├── Add platform deployer as trusted issuer
  ├── Set default fee rate on PlatformFeeManager
  └── Whitelist initial issuers in IssuerRegistry
```

### 6.2 Per-Project Deployment (Repeats for Each Token)

```
Step 1: CiretaTokenFactory.deployToken()
  → CiretaToken proxy (ERC-3643)
  → IdentityRegistry proxy
  → IdentityRegistryStorage proxy
  → ModularCompliance proxy

Step 2: Configure compliance modules
  → Add CountryAllowModule + set allowed countries
  → Add MaxBalanceModule + set max balance (if needed)
  → Bind modules to ModularCompliance

Step 3: CiretaSaleFactory.deploySale(mode, ...)
  → Sale proxy (V2)
  IF mode == Vested:
    → CiretaFractionFactory.deployVaultAndFraction(...)
    → CiretaFractionToken proxy
    → CiretaVault proxy

Step 4: Fund the sale
  IF mode == Direct:
    → Mint project tokens to issuer
    → Issuer approves Sale contract
    → Issuer deposits tokens to Sale
  IF mode == Vested:
    → Mint project tokens to issuer
    → Issuer approves Vault
    → Vault.depositTokens(amount) via Sale

Step 5: Sale.activate()
```

### 6.3 Address Storage

All deployed addresses stored in two places:

1. **On-chain:** Factory contracts track deployments in mappings
2. **Database:** Per-token fields in `tokens` table and per-sale fields in `token_sales` table

| Field | Table | Purpose |
|-------|-------|---------|
| `contract_address` | `tokens` | CiretaToken (ERC-3643) address |
| `identity_registry_address` | `tokens` | IdentityRegistry address |
| `compliance_address` | `tokens` | ModularCompliance address |
| `sale_contract_address` | `tokens` | Associated Sale address |
| `vault_address` | `tokens` / `token_sales` | CiretaVault address (if vested) |
| `fraction_token_address` | `tokens` / `token_sales` | CiretaFractionToken address (if vested) |

### 6.4 Testnet Deployment Registry

File: `contracts/deployments/base-sepolia.json`

```json
{
  "chainId": 84532,
  "platform": {
    "platformFeeManager": "0x...",
    "issuerRegistry": "0x...",
    "claimTopicsRegistry": "0x...",
    "trustedIssuersRegistry": "0x...",
    "tokenFactory": "0x...",
    "saleFactory": "0x...",
    "fractionFactory": "0x..."
  },
  "implementations": {
    "ciretaToken": "0x...",
    "identityRegistry": "0x...",
    "sale": "0x...",
    "fractionToken": "0x...",
    "vault": "0x..."
  },
  "tokens": {
    "WMAU": {
      "token": "0x...",
      "identityRegistry": "0x...",
      "compliance": "0x...",
      "sale": "0x...",
      "vault": "0x...",
      "fractionToken": "0x..."
    }
  }
}
```

---

## 7. Security Model

### 7.1 Authentication & Authorization

```
┌─────────────────────────────────────────────────────────┐
│                  AUTH FLOW                                │
│                                                          │
│  Login → JWT access (15min) + refresh (7d)              │
│       → If MFA enabled: partial JWT → verify code → full │
│                                                          │
│  Token Rotation: refresh token → new access + refresh   │
│  Logout: blacklist access token in Redis (TTL=expiry)   │
│                                                          │
│  Brute Force: 5 failed attempts → 15min lockout         │
│  Password: bcrypt hash, 12 rounds                       │
└─────────────────────────────────────────────────────────┘

ROLE HIERARCHY:
  Platform Admin (is_admin=true)
    └── All platform management, compliance, user management
  Issuer (issuer.status=active)
    └── Own tokens, sales, investor management, fee reports
  Investor (kyc_level >= 1)
    └── Browse, invest, portfolio, claim, redeem
  Public (no auth)
    └── Browse projects, register
```

### 7.2 API Security Layers

| Layer | Implementation | Location |
|-------|---------------|----------|
| CORS | Strict origins (configurable) | `apps/api/main.py` |
| CSP | Security headers middleware | `packages/common/middleware/security_headers.py` |
| Rate Limiting | Redis-backed per-endpoint | `packages/common/middleware/rate_limit.py` |
| JWT Validation | Every request via dependency | `packages/common/core/auth_deps.py` |
| JWT Blacklist | Redis SET with TTL | `packages/common/services/auth_service.py` |
| HMAC Verification | Sumsub webhooks | `apps/api/core/sumsub_crypto.py` |
| Input Validation | Pydantic v2 schemas | `apps/api/schemas/` |
| SQL Injection | SQLAlchemy parameterized queries | All services |
| Encrypted Fields | AES-256 for sensitive data | `packages/common/models/encrypted_types.py` |

### 7.3 On-Chain Security

| Risk | Mitigation | Contract |
|------|-----------|----------|
| Front-running | `maxPerBlock` limit (50K USDC default) | `Sale.sol:72` |
| Reentrancy | `nonReentrant` on contribute, claim, refund | `Sale.sol`, `CiretaVault.sol` |
| Unauthorized transfer | ERC-3643 compliance + IdentityRegistry | `CiretaToken.sol` |
| KYC bypass | `isVerified()` check on every transfer | `CiretaToken`, `CiretaFractionToken` |
| Vault drain | CEI pattern, fraction burn before release | `CiretaVault.claim()` |
| Double claim | `claimedAmount` tracking + fraction balance check | `CiretaVault.sol` |
| Excess manipulation | ExcessPolicy locked after finalization | `CiretaVault.setExcessPolicy()` |
| Unauthorized mint/burn | Role-based access (MINTER/BURNER) | `CiretaFractionToken.sol` |

### 7.4 Key Management (Current → Target)

| | Current | Target (Sprint 7) |
|---|---------|-------------------|
| Deployer key | Private key loaded from file | AWS KMS / HSM |
| Signing | Local `eth_account.Account.sign_transaction()` | KMS API signing |
| Platform admin | Single EOA | Safe multisig (2/3) |
| Key rotation | Manual | KMS key policy |

### 7.5 Wallet Screening (Sprint 5)

```
Screening Triggers:
  1. Wallet link → screen before accepting
  2. Before contribution → screen before processing
  3. Daily re-screen → all linked wallets

Risk Levels:
  LOW (0-30)     → Allow
  MEDIUM (31-70) → Flag for review, allow
  HIGH (71-100)  → Block transaction, flag in admin
  SANCTIONS HIT  → Block everything, alert admin immediately

Provider: Chainalysis KYT or Elliptic Lens (TBD)
```

---

## 8. Infrastructure

### 8.1 Current Infrastructure

```
┌──────────────────────────────────────────────────────┐
│                   DEPLOYMENT                          │
│                                                       │
│  Backend API:    Docker → Railway (or similar PaaS)  │
│  Launchpad App:  Vercel (Next.js)                    │
│  Admin Portal:   Vercel (Next.js)                    │
│  PostgreSQL:     Railway managed PostgreSQL           │
│  Redis:          Railway managed Redis               │
│  Worker:         Same Docker image, entrypoint=worker│
│                                                       │
│  Blockchain:     Base mainnet (8453) + Sepolia (84532)│
│  RPC:            Alchemy / QuickNode                  │
│  KYC:            Sumsub API + webhooks               │
│  Email:          Resend API                           │
└──────────────────────────────────────────────────────┘
```

### 8.2 Docker Setup

```dockerfile
# Backend (apps/api/)
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN pip install poetry && poetry install --no-dev
COPY . .
CMD ["uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Worker (same image, different entrypoint)
CMD ["arq", "apps.api.workers.worker.WorkerSettings"]
```

### 8.3 CI/CD Pipeline

```
GitHub Actions:

ci.yml (on PR):
  ├── api-tests: ruff check + pytest
  ├── contract-tests: npx hardhat test
  ├── launchpad-build: npx tsc --noEmit + next build
  └── admin-build: npx tsc --noEmit + next build

deploy-staging.yml (on merge to develop):
  ├── Build Docker image
  ├── Run tests
  ├── Deploy to staging
  └── Health check

deploy-production.yml (manual trigger):
  ├── Build Docker image
  ├── Run tests
  ├── Deploy to production
  ├── Health check
  └── Rollback on failure
```

### 8.4 Monitoring (Target State)

| Component | Tool | Status |
|-----------|------|--------|
| Error tracking | Sentry | Sprint 7 |
| Health checks | `/api/v1/health/live`, `/api/v1/health/ready` | ✅ Implemented |
| Structured logging | JSON with correlation IDs | ✅ Implemented |
| Audit trail | `audit_logs` table | ✅ Implemented |
| Metrics (future) | Prometheus + Grafana | Deferred (post-launch) |
| Uptime monitoring | External (UptimeRobot) | TBD |

### 8.5 Environment Variables

Key environment variables (see `.env.backend.example` for full list):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `SECRET_KEY` | JWT signing key |
| `WEB3_RPC_URL` | Base RPC endpoint (Alchemy/QuickNode) |
| `WEB3_FALLBACK_RPC_URL` | Fallback RPC endpoint |
| `DEPLOYER_PRIVATE_KEY` | Contract deployer key (→ KMS in production) |
| `TOKEN_FACTORY_ADDRESS` | CiretaTokenFactory contract address |
| `SALE_FACTORY_ADDRESS` | CiretaSaleFactory contract address |
| `FRACTION_FACTORY_ADDRESS` | CiretaFractionFactory contract address |
| `PLATFORM_FEE_MANAGER` | PlatformFeeManager contract address |
| `USDC_ADDRESS` | USDC contract on Base |
| `SUMSUB_APP_TOKEN` | Sumsub API token |
| `SUMSUB_SECRET_KEY` | Sumsub HMAC secret |
| `RESEND_API_KEY` | Resend email API key |
| `WALLET_SCREENING_API_KEY` | Chainalysis/Elliptic API key |
| `SENTRY_DSN` | Sentry error tracking DSN |
| `CORS_ORIGINS` | Allowed frontend origins |

---

*Architecture document generated 2026-03-24 by Zyda (Claude Opus). All file references verified against codebase at `/Users/zephyroc/projects/cireta/`.*
