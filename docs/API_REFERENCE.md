# Cireta API Reference

> Extracted from CLAUDE.md — endpoint routes, services, and environment variables.

---

## API Routes

POST /api/v1/auth/register          [public]
POST /api/v1/auth/login             [public, 5/min rate limit]
POST /api/v1/auth/refresh           [bearer]
POST /api/v1/auth/logout            [bearer]
GET  /api/v1/auth/me                [bearer]

POST /api/v1/kyc/initiate           [bearer, kyc_level>=1]
GET  /api/v1/kyc/status             [bearer]
POST /api/v1/kyc/webhook            [hmac_verified — Sumsub only, NOT public]

GET  /api/v1/tokens/                [public]
GET  /api/v1/tokens/{id}            [public]
POST /api/v1/tokens/                [issuer role]
POST /api/v1/tokens/{id}/deploy     [issuer role]

GET  /api/v1/sales/                 [public]
GET  /api/v1/sales/{id}             [public]
POST /api/v1/sales/                 [issuer]
POST /api/v1/sales/{id}/contribute  [bearer, kyc_level>=2]
POST /api/v1/sales/{id}/finalize    [issuer]
POST /api/v1/sales/{id}/claim       [bearer]
POST /api/v1/sales/{id}/refund      [bearer]

GET  /api/v1/portfolio/holdings     [bearer]
GET  /api/v1/portfolio/vesting      [bearer]
POST /api/v1/portfolio/vesting/{id}/claim [bearer]
GET  /api/v1/portfolio/redemptions  [bearer]
POST /api/v1/portfolio/redemptions  [bearer, kyc_level>=2]

GET  /api/v1/admin/issuers/         [platform_admin]
POST /api/v1/admin/issuers/         [platform_admin]
PATCH/api/v1/admin/issuers/{id}/fee [platform_admin]
POST /api/v1/admin/issuers/{id}/revoke [platform_admin]

POST /api/v1/admin/compliance/freeze           [issuer|admin]
POST /api/v1/admin/compliance/unfreeze         [issuer|admin]
POST /api/v1/admin/compliance/forced-transfer  [issuer]
POST /api/v1/admin/compliance/recover          [issuer]
POST /api/v1/admin/compliance/pause/{token_id} [issuer]
POST /api/v1/admin/compliance/unpause/{token_id} [issuer]

GET  /api/v1/health/live            [public]
GET  /api/v1/health/ready           [public]

---

## Services

AuthService: register, login, refresh_token, logout, get_current_user, hash_password, verify_password
KYCService: initiate, get_status, handle_webhook (HMAC validate first!), _issue_onchain_claims, _write_audit
TokenService: create_token, deploy_contract, list_tokens, get_token
SaleService: create_sale, contribute, finalize_sale, claim_tokens, claim_refund
VestingService: create_schedule, get_schedules, get_claimable, claim_tranche
RedemptionService: create_request, list_requests, update_fulfillment
IssuerService: onboard_issuer, list_issuers, set_fee, revoke_issuer
ComplianceService: freeze_address, unfreeze_address, forced_transfer, recover_tokens, pause_token, unpause_token (ALL write audit_logs)
Web3Service: deploy_erc3643_token, send_tx, call_contract, get_balance, register_identity, issue_claim
PortfolioService: get_holdings, get_portfolio_summary

---

## Database Models

All in apps/api/models/ using SQLAlchemy 2.0 mapped_column syntax.
PII fields marked with EncryptedString or EncryptedJSON.

users:
  id UUID PK, email str unique, hashed_password str,
  role enum(investor|issuer|admin), kyc_status enum(none|pending|approved|rejected),
  kyc_level int default 0, onchain_id str nullable,
  sumsub_applicant_id EncryptedString nullable,
  created_at, updated_at

kyc_applications:
  id UUID PK, user_id UUID FK, sumsub_review_id EncryptedString,
  result_payload EncryptedJSON, status str, submitted_at, reviewed_at

wallets:
  id UUID PK, user_id UUID FK, address EncryptedString,
  address_checksum str indexed, chain_id int, is_primary bool, created_at

issuers:
  id UUID PK, user_id UUID FK, name str, slug str unique,
  wallet_address EncryptedString, fee_bps int default 200,
  status enum(pending|active|suspended), legal_entity_name str,
  jurisdiction str, created_at

tokens:
  id UUID PK, issuer_id UUID FK, name str, symbol str,
  asset_type enum(commodity|futures), contract_address str nullable,
  chain_id int default 8453, total_supply Numeric, decimals int default 18,
  ipfs_docs_hash str nullable, chainlink_por_feed str nullable,
  is_paused bool default false, created_at

token_sales:
  id UUID PK, token_id UUID FK, issuer_id UUID FK,
  payment_token str (USDC address), soft_cap Numeric, hard_cap Numeric,
  status enum(draft|active|paused|finalized|failed),
  total_raised Numeric default 0, created_at

sale_phases:
  id UUID PK, sale_id UUID FK, phase_number int,
  name str, price_per_token Numeric, allocation Numeric,
  min_contribution Numeric, max_contribution Numeric,
  start_time datetime, end_time datetime,
  whitelist_only bool default false, created_at

contributions:
  id UUID PK, user_id UUID FK, sale_id UUID FK, phase_id UUID FK,
  amount Numeric, tokens_allocated Numeric, tx_hash str unique,
  status enum(pending|confirmed|claimed|refunded),
  claimed_at datetime nullable, created_at

vesting_schedules:
  id UUID PK, token_id UUID FK, user_id UUID FK,
  total_amount Numeric, claimed_amount Numeric default 0,
  cliff_end datetime, vesting_end datetime,
  last_claim_at datetime nullable, created_at

redemption_requests:
  id UUID PK, token_id UUID FK, user_id UUID FK,
  amount Numeric, fulfillment_method enum(physical|cash),
  status enum(pending|processing|fulfilled|cancelled),
  tx_hash str, fulfilled_at datetime nullable, notes str nullable, created_at

audit_logs:
  id UUID PK, actor_id UUID FK users, action str, target_type str,
  target_id str, payload JSON, ip_address str, created_at
  -- APPEND ONLY — never update or delete rows

---

## Environment Variables

ENVIRONMENT=development
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=<32+ char random>
ENCRYPTION_KEY=<Fernet key>
SUMSUB_SECRET_KEY=<from Sumsub>
SUMSUB_APP_TOKEN=<from Sumsub>
WEB3_RPC_URL=https://mainnet.base.org
DEPLOYER_PRIVATE_KEY=<from ~/.ferron/x402-server-wallet.json>
TOKEN_FACTORY_ADDRESS=<deployed factory address>
CHAIN_ID=8453
PLATFORM_FEE_RECEIVER=0xBE84C7a8f44F673173d51C0A212C9C66267066A0
CORS_ORIGINS=https://launchpad.cireta.com,https://admin.cireta.com
PINATA_API_KEY=
RESEND_API_KEY=

---

## Sumsub Webhook Validation (CRITICAL)
```python
import hmac, hashlib

def validate_sumsub_signature(body: bytes, sig_header: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig_header)

# In endpoint — do this FIRST before any processing:
@router.post("/webhook")
async def kyc_webhook(request: Request, kyc_service: KYCService = Depends()):
    body = await request.body()
    sig = request.headers.get("X-App-Token", "")
    if not validate_sumsub_signature(body, sig, settings.sumsub_secret_key):
        raise HTTPException(401, detail={"code": "INVALID_SIGNATURE", "message": "..."})
    payload = json.loads(body)
    await kyc_service.handle_webhook(payload)
```

---

## Smart Contracts (contracts/ — Hardhat)

Platform (deploy once):
  CiretaTokenFactory, CiretaSaleFactory, IdentityRegistryStorage,
  TrustedIssuersRegistry, ClaimTopicsRegistry, PlatformFeeManager, IssuerRegistry

Per-token (via factory):
  CiretaToken (ERC-3643), IdentityRegistry, ModularCompliance,
  Sale, VestingVault, RedemptionManager

Compliance modules:
  CountryAllowModule, MaxOwnershipModule, MaxHolderCountModule,
  ConditionalTransferModule, TimeTransfersLimitModule

Chain: Base Mainnet (8453). UUPS upgradeable (OpenZeppelin).
Deployer wallet: ~/.ferron/x402-server-wallet.json (has ETH on Base mainnet)
