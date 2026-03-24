# HANDOVER — External API Keys & Credentials

**Created:** 2026-03-24
**Purpose:** Every external integration that needs API keys to move from testnet-ready to mainnet-ready.
**After remediation:** Every missing credential = loud error with exact env var name. No silent stubs.

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| **P0** | Launch blocker — cannot go mainnet without this |
| **P1** | Needed within 30 days of launch |
| **P2** | Nice to have, not a blocker |

---

## Integration Matrix

| # | Integration | Env Var(s) | Read By | Where to Get It | What It Unlocks | Est. Cost/mo | Priority |
|---|-------------|-----------|---------|-----------------|-----------------|-------------|----------|
| 1 | **Sumsub KYC** | `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` | `packages/common/core/config.py` lines 81-82 → `settings.sumsub_app_token`, `settings.sumsub_secret_key` | [dashboard.sumsub.com](https://dashboard.sumsub.com) — sign up, create app, get credentials | Real identity verification (KYC L1/L2/L3). Without it: users can register but cannot pass KYC, which blocks investing. | $1.50-$3.00 per verification (~$500-$2000/mo at scale) | **P0** |
| 2 | **Wallet Screening** | `SCREENING_API_KEY` | `packages/common/core/config.py` (add in R4.4) → `settings.screening_api_key`; used by `apps/api/services/wallet_screening_service.py` | [Chainalysis](https://www.chainalysis.com/free-cryptocurrency-sanctions-screening-tools/) (free tier for sanctions) or [Elliptic](https://www.elliptic.co/) (enterprise) | OFAC/SDN sanctions screening on wallet link + pre-contribution. Without it: all wallets pass screening (stub returns risk=0). Regulatory risk. | Chainalysis free tier: $0; Elliptic: $500+/mo | **P0** |
| 3 | **Deployer Private Key** | `DEPLOYER_PRIVATE_KEY` | `packages/common/core/config.py` line 89 → `settings.deployer_private_key`; `contracts/hardhat.config.ts` line 28 | Wallet with mainnet ETH/Base ETH. Generate new for production (DO NOT reuse testnet key). | On-chain contract deployment, ONCHAINID identity creation, token minting, compliance actions. Without it: no on-chain operations work. | Gas costs only (~$5-50/mo depending on activity) | **P0** |
| 4 | **Resend Email** | `RESEND_API_KEY` | `packages/common/core/config.py` line 98 → `settings.resend_api_key`; used by `apps/api/services/email_service.py` line 15 | [resend.com](https://resend.com) — sign up, create API key, verify sending domain | Transactional emails: email verification, password reset, KYC status, investment confirmation, sale finalization, redemption fulfillment. Without it: no emails sent. | Free tier: 100 emails/day; Pro: $20/mo (50K emails) | **P0** |
| 5 | **WalletConnect** | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | `apps/launchpad/src/lib/wagmi.ts` line 6; `apps/launchpad/.env.production` | [cloud.walletconnect.com](https://cloud.walletconnect.com) — create project, get project ID | Wallet connection modal (MetaMask, Coinbase, Rainbow, etc). Without it: WalletConnect relay fails. **Note:** `.env.local` already has ID `b56e18d47c72ab683b10814fe9495694` — verify if this is a production-ready project or dev-only. | Free | **P0** |
| 6 | **Pinata IPFS** | `PINATA_API_KEY`, `PINATA_SECRET_KEY` | `packages/common/core/config.py` lines 96-97 → `settings.pinata_api_key`, `settings.pinata_secret_key` | [pinata.cloud](https://app.pinata.cloud) — sign up, create API keys | IPFS document uploads (token prospectus, legal docs, asset photos). Without it: document upload fails. | Free tier: 1GB; $20/mo for 25GB | **P1** |
| 7 | **BaseScan API** | `BASESCAN_API_KEY` | `contracts/hardhat.config.ts` line 39 | [basescan.org/apis](https://basescan.org/apis) — create account, get free API key | Contract source code verification on BaseScan. Without it: contracts show as unverified bytecode. | Free | **P1** |
| 8 | **Chainlink PoR Feeds** | Per-token: `chainlink_por_feed` on Token model | `apps/api/api/v1/endpoints/tokens.py` line 134 → reads from token DB record | [data.chain.link](https://data.chain.link) — find appropriate PoR feed for each commodity. Custom feeds via [Chainlink Functions](https://functions.chain.link). | Proof of Reserve for commodity tokens (gold, silver, etc). Without it: PoR endpoint returns estimated data with `is_live: false`. | Custom feed: varies ($200-$2000/mo); existing feeds: free | **P1** |
| 9 | **ONCHAINID Factory** | `IDENTITY_FACTORY_ADDRESS`, `IDENTITY_INIT_CODE_HASH` | `packages/common/core/config.py` lines 91-95 → `settings.identity_factory_address`, `settings.identity_init_code_hash` | Deploy ONCHAINID factory contract to Base mainnet. See [onchainid.com](https://onchainid.com). The `identity_init_code_hash` is the keccak256 of the IdentityProxy creation code — obtained after factory deployment. | On-chain identity for each KYC'd user. Without it: identity deployment skipped. Regulatory compliance for ERC-3643 token transfers. | Gas costs only | **P0** |
| 10 | **Production RPC** | `WEB3_RPC_URL`, `WEB3_FALLBACK_RPC_URL` | `packages/common/core/config.py` lines 87-88 → `settings.web3_rpc_url`, `settings.web3_fallback_rpc_url` | [Alchemy](https://www.alchemy.com/chain-connect/chain/base), [Infura](https://www.infura.io/), [QuickNode](https://www.quicknode.com/) — Base mainnet RPC | Reliable RPC for all on-chain reads/writes. Public RPC (`https://mainnet.base.org`) has rate limits and no SLA. | Alchemy free: 300M CU/mo; Growth: $49/mo | **P1** |

---

## Detailed Integration Notes

### 1. Sumsub KYC

**Files that use it:**
- `apps/api/services/kyc_service.py` — `_sumsub_request()` for API calls, `_is_dev_mode()` check
- `apps/api/workers/tasks.py` — `task_process_webhooks()` calls `kyc_service.handle_webhook()`
- `packages/common/core/config.py` — `_validate_security()` requires `sumsub_secret_key` in production

**What happens if missing (after remediation):**
- Development: mock KYC token returned, WARNING logged
- Production/Staging: `ValueError("SUMSUB_SECRET_KEY must be set in production/staging environments")` on startup

**Setup steps:**
1. Sign up at [sumsub.com](https://sumsub.com)
2. Create application → get App Token and Secret Key
3. Configure KYC level: `basic-kyc-level` (document + selfie)
4. Set webhook URL: `https://api.cireta.com/api/v1/kyc/webhook`
5. Set env vars: `SUMSUB_APP_TOKEN=sbx_...` and `SUMSUB_SECRET_KEY=...`

---

### 2. Wallet Screening (Chainalysis)

**Files that use it:**
- `apps/api/services/wallet_screening_service.py` — `WalletScreeningService` class
- Used at wallet link time and before every contribution

**What happens if missing (after remediation):**
- Development: stub returns `risk_score=0`, WARNING logged
- Production: `RuntimeError("SCREENING_API_KEY required in production")`

**Setup steps:**
1. Apply for [Chainalysis Sanctions Screening API](https://www.chainalysis.com/free-cryptocurrency-sanctions-screening-tools/) (free for basic OFAC)
2. Or contact Elliptic for enterprise screening
3. Set `SCREENING_API_KEY=...` in env

---

### 3. Deployer Private Key (Mainnet)

**Files that use it:**
- `contracts/hardhat.config.ts` line 28 — Hardhat deploy
- `packages/common/core/config.py` line 89 — backend on-chain operations
- `apps/api/services/web3_token_service.py` — token operations
- `apps/api/services/web3_sale_service.py` — sale operations
- `apps/api/services/web3_identity_service.py` — ONCHAINID deploy
- `apps/api/workers/tasks.py` — background on-chain tasks

**What happens if missing (after remediation):**
- ONCHAINID deploy → `RuntimeError("DEPLOYER_PRIVATE_KEY required")`
- Contract operations → web3 calls fail with "no signer" error

**Setup steps:**
1. Generate a NEW keypair for mainnet (NEVER reuse testnet key)
2. Fund with ~0.1 ETH on Base mainnet
3. Set `DEPLOYER_PRIVATE_KEY=0x...` (never commit)
4. Set `PLATFORM_FEE_RECEIVER=<address>` to the fee collection address

---

### 4. Resend Email

**Files that use it:**
- `apps/api/services/email_service.py` — all `send_*` functions
- `apps/api/workers/tasks.py` — `task_send_email()`

**What happens if missing (after remediation):**
- Development: email send skipped, WARNING logged
- Production: `RuntimeError("RESEND_API_KEY not configured")`

**Setup steps:**
1. Sign up at [resend.com](https://resend.com)
2. Verify domain `cireta.com` (add DNS records)
3. Create API key
4. Set `RESEND_API_KEY=re_...`

---

### 5. WalletConnect

**Files that use it:**
- `apps/launchpad/src/lib/wagmi.ts` — RainbowKit config
- `apps/launchpad/.env.local`, `.env.production`

**What happens if missing:**
- WalletConnect modal may not function; users can still connect via injected providers (MetaMask browser extension)

**Note:** `.env.local` already contains project ID `b56e18d47c72ab683b10814fe9495694`. Verify ownership and whether it's suitable for production.

---

## Environment Template (`.env.production`)

```bash
# === REQUIRED FOR LAUNCH (P0) ===
ENVIRONMENT=production
DEBUG=false

# Database (use managed Postgres)
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/cireta

# Redis
REDIS_URL=redis://host:6379/0

# Security
JWT_SECRET_KEY=<generate: openssl rand -hex 32>
ENCRYPTION_KEY=<generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">

# Blockchain
CHAIN_ID=8453
WEB3_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<your-key>
WEB3_FALLBACK_RPC_URL=https://mainnet.base.org
DEPLOYER_PRIVATE_KEY=0x<new-mainnet-key>
PLATFORM_FEE_RECEIVER=0x<fee-receiver-address>

# Contract addresses (from mainnet deployment)
TOKEN_FACTORY_ADDRESS=0x...
SALE_FACTORY_ADDRESS=0x...
IDENTITY_FACTORY_ADDRESS=0x...
IDENTITY_REGISTRY_ADDRESS=0x...
IDENTITY_INIT_CODE_HASH=0x...

# KYC
SUMSUB_APP_TOKEN=sbx_...
SUMSUB_SECRET_KEY=...

# Wallet Screening
SCREENING_API_KEY=...

# Email
RESEND_API_KEY=re_...
FRONTEND_URL=https://launchpad.cireta.com

# CORS
CORS_ORIGINS=https://launchpad.cireta.com,https://admin.cireta.com

# === NEEDED WITHIN 30 DAYS (P1) ===

# IPFS
PINATA_API_KEY=...
PINATA_SECRET_KEY=...

# BaseScan (for contract verification)
BASESCAN_API_KEY=...

# Production RPC (if not using Alchemy above)
# WEB3_RPC_URL already set above
```

---

## Credential Security Rules

1. **NEVER commit credentials** — only `.env.example` templates go in git
2. **Use a secrets manager** in production (AWS Secrets Manager, Railway secrets, 1Password)
3. **Rotate the deployer key** after initial mainnet deployment if using a shared key
4. **Generate new JWT_SECRET_KEY** for production — never reuse dev values
5. **Separate testnet/mainnet keys** — different deployer wallets, different API keys
