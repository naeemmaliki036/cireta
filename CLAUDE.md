# CLAUDE.md — Cireta RWA Launchpad Build Guide

## What We Are Building
Cireta is a regulated RWA tokenization launchpad for gold, copper, and commodity futures on Base L2.
ERC-3643 security tokens. Full KYC/AML via Sumsub + ONCHAINID. Multi-issuer platform.

Website: www.cireta.com
Brand repo: ~/projects/cireta-repo (Gilroy fonts, exact colours, component patterns)
Scaffold reference: ~/projects/scaffold-rules (copy patterns exactly)

---

## Scaffolding Rules (NON-NEGOTIABLE)

Stack:
- Backend: FastAPI (Python 3.11+) — NOT NestJS, NOT Express
- Frontend: Next.js 16 (App Router, React 19, TypeScript strict)
- ORM: SQLAlchemy 2.0 + Alembic migrations
- Validation: Pydantic v2
- Styling: Tailwind CSS 4 + CSS variables (bg-[var(--brand-primary)])
- Testing backend: pytest (unit / integration / e2e)
- Testing frontend: Vitest

Request flow:
  Client → Middleware Stack → FastAPI Router → Service Layer → Repository → Database

Middleware stack (apps/api/main.py — applied bottom to top):
  app.add_middleware(CORSMiddleware)
  app.add_middleware(RateLimitMiddleware)
  app.add_middleware(SecurityHeadersMiddleware)
  app.add_middleware(LoggingMiddleware)

Backend rules:
- Thin controllers — endpoints only validate + delegate to service
- Service layer — ALL business logic here
- Repository pattern — all DB access abstracted
- Dependency injection — everything via FastAPI Depends()
- EncryptedString for all PII (wallet addresses, KYC IDs, API tokens)
- EncryptedJSON for KYC result payloads
- HTTPException with {"code": "ERROR_CODE", "message": "..."} always
- 300 LOC max per file

Frontend rules:
- Atomic design: atoms → molecules → organisms → templates → pages
- Atoms: forwardRef + extend HTML attrs + NEVER make API calls
- Never raw fetch() — all calls via lib/api/repositories/
- CSS variables only — never hardcode colours
- TypeScript strict — no any
- 300 LOC max per component, 150 LOC max per hook

---

## Monorepo Structure

cireta/
├── apps/
│   ├── api/                    FastAPI backend (api.cireta.com)
│   │   ├── api/v1/endpoints/   Thin route handlers
│   │   ├── services/           Business logic
│   │   ├── models/             SQLAlchemy models (app-specific)
│   │   ├── schemas/            Pydantic request/response schemas
│   │   ├── core/config.py      App config
│   │   └── main.py             App init + middleware stack
│   ├── launchpad/              Next.js investor portal (launchpad.cireta.com)
│   │   └── src/
│   │       ├── app/            Next.js App Router pages
│   │       ├── components/     atoms/ molecules/ organisms/ templates/
│   │       ├── contexts/       AuthContext, Web3Context, KYCContext
│   │       └── lib/
│   │           ├── api/repositories/
│   │           ├── hooks/
│   │           └── types/
│   └── admin/                  Next.js admin portal (admin.cireta.com)
│       └── src/ (same structure as launchpad)
├── packages/
│   └── common/                 Shared Python — copy from ~/projects/scaffold-rules/packages/common/
│       ├── config/defaults.py  Safe defaults (committed, no secrets)
│       ├── core/config.py      Pydantic Settings + env overrides
│       ├── core/auth_deps.py   JWT FastAPI dependencies
│       ├── core/logging.py     Structured logging + PII filter
│       ├── core/cache.py       Redis with fallback
│       ├── db/base.py          SQLAlchemy declarative base
│       ├── db/session.py       Connection pool + get_db
│       ├── db/repository.py    Generic CRUD + get_or_404
│       ├── models/base.py      Timestamps mixin
│       ├── models/encrypted_types.py  EncryptedString + EncryptedJSON
│       ├── middleware/logging_middleware.py
│       ├── middleware/security_headers.py
│       └── middleware/rate_limit.py
├── infra/alembic/              DB migrations
├── tests/                      pytest suites (unit/ integration/ e2e/)
├── docs/                       Architecture docs
└── scripts/                    Dev scripts

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

## Services to Build

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

## Security Rules

1. OWASP headers on EVERY response via SecurityHeadersMiddleware
2. Rate limits: login 5/min, register 10/min, contribute 20/min, default 100/min
3. EncryptedString: users.sumsub_applicant_id, wallets.address, issuers.wallet_address, kyc_applications.sumsub_review_id
4. EncryptedJSON: kyc_applications.result_payload
5. Sumsub webhook: validate HMAC-SHA256 signature BEFORE processing — return 401 if invalid
6. JWT: access=15min, refresh=7d with rotation (store hash in Redis, invalidate old on refresh)
7. HSTS in production only
8. audit_logs: EVERY compliance action logged — immutable, append-only
9. No secrets in code — env vars only via Settings class
10. Wallet addresses: always checksummed on read, encrypted at rest

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
CHAIN_ID=8453
PLATFORM_FEE_RECEIVER=0xBE84C7a8f44F673173d51C0A212C9C66267066A0
CORS_ORIGINS=https://launchpad.cireta.com,https://admin.cireta.com
PINATA_API_KEY=
RESEND_API_KEY=

---

## Frontend Pages

launchpad (apps/launchpad):
  /                        Home — hero, live projects, how it works
  /explore                 Project grid with filters
  /project/[slug]          Project detail — phases, docs, invest CTA
  /login                   Auth
  /register                Auth
  /verify                  Sumsub KYC embedded WebSDK
  /invest/[slug]           Amount → approve USDC → confirm
  /portfolio               Holdings, vesting, claimable
  /portfolio/claim/[token] Claim unlocked tokens
  /portfolio/redeem/[token]Redemption request (commodity only)
  /account                 KYC status, wallets, CSV export

admin (apps/admin):
  /issuer/overview
  /issuer/tokens/new        4-step wizard
  /issuer/tokens/[id]
  /issuer/sales/[id]
  /issuer/investors         + OTC allocate
  /issuer/compliance        freeze/recover/forced-transfer
  /issuer/withdrawals
  /platform/issuers
  /platform/compliance
  /platform/analytics

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

---

## Brand

Font: Gilroy — ~/projects/cireta-repo/src/assets/fonts/Gilroy-{Bold,Semibold,Medium}.woff2
Colours: #13636F (teal), #ECF3F4 (light bg), #180B2E (dark bg), #C9913D (gold), #0C0C0C (text)
Letter spacing: -0.03em body
Logo: 4-pointed star SVG path "M20 2 L22.5 17.5 L38 20 L22.5 22.5 L20 38 L17.5 22.5 L2 20 L17.5 17.5 Z"
Tailwind config: ~/projects/cireta-repo/tailwind.config.*
Existing components: ~/projects/cireta-repo/src/app/components/

---

## Build Order

Step 1: Set up packages/common (copy + adapt from scaffold-rules)
Step 2: Initial Alembic migration with all models above
Step 3: apps/api skeleton — main.py, middleware, health endpoint
Step 4: AuthService + auth endpoints + JWT
Step 5: KYCService + Sumsub webhook (HMAC validation first)
Step 6: TokenService + SaleService + endpoints
Step 7: VestingService + RedemptionService + portfolio endpoints
Step 8: IssuerService + ComplianceService + admin endpoints + audit_logs
Step 9: Web3Service (deploy contracts, interact)
Step 10: Smart contracts (Hardhat) — ERC-3643 token set
Step 11: apps/launchpad — all investor pages
Step 12: apps/admin — issuer + platform admin pages
Step 13: Tests — unit for all services, integration for API routes
Step 14: Docker + Railway deploy config
Step 15: Security hardening pass — verify ALL encrypted fields, rate limits, HMAC validation

---

## Reference Files

Copy these directly from scaffold:
  ~/projects/scaffold-rules/packages/common/middleware/security_headers.py
  ~/projects/scaffold-rules/packages/common/middleware/logging_middleware.py
  ~/projects/scaffold-rules/packages/common/middleware/rate_limit.py
  ~/projects/scaffold-rules/packages/common/models/encrypted_types.py
  ~/projects/scaffold-rules/packages/common/core/config.py
  ~/projects/scaffold-rules/packages/common/db/repository.py
  ~/projects/scaffold-rules/packages/common/db/session.py
  ~/projects/scaffold-rules/packages/common/services/auth_service.py
  ~/projects/scaffold-rules/Makefile
  ~/projects/scaffold-rules/pyproject.toml
  ~/projects/scaffold-rules/docker-compose.local-db.yml
  ~/projects/scaffold-rules/infra/alembic/

Cireta existing frontend patterns to match:
  ~/projects/cireta-repo/src/app/components/Button.tsx
  ~/projects/cireta-repo/src/app/globals.css
  ~/projects/cireta-repo/tailwind.config.*

---

## Audit Protocol (MANDATORY — run after EVERY step)

Before moving from one step to the next, run ALL of these:

```bash
# Backend
ruff check .                                          # lint clean
python -c "from apps.api.main import app"            # no import errors
poetry run pytest tests/ -x -q                       # all pass

# Frontend (once exists)
cd apps/launchpad && npx tsc --noEmit                # TypeScript clean
cd apps/launchpad && npm run test:run                # vitest clean

# Docker
docker build -f Dockerfile.api . --no-cache          # builds OK
docker build -f Dockerfile.launchpad . --no-cache    # builds OK

# LOC check
find . -name "*.py" -not -path "*/.venv/*" | xargs wc -l | sort -rn | head -20
find apps/launchpad/src -name "*.tsx" | xargs wc -l | sort -rn | head -20
```

If ANY audit step fails — stop, fix it, re-run audit, THEN proceed.
Never carry broken code into the next step.

Document every audit result in docs/BUILD_LOG.md.

---

## BUILD_LOG.md Protocol

Maintain docs/BUILD_LOG.md. After every step append:

```
## Step N — [name] — [YYYY-MM-DD HH:MM]
### Built
- list of files created/modified
### Audit
- pytest: X/X passed
- ruff: clean
- tsc: clean
- docker build api: OK
- imports: OK
- LOC: all under 300
- Encrypted fields: confirmed
### Decisions
- any deviation from CLAUDE.md and why
### Issues
- what broke, what the fix was
```

---

## Docker Conventions (from scaffold-rules — follow exactly)

Dockerfile naming: Dockerfile.api, Dockerfile.launchpad, Dockerfile.admin at REPO ROOT

Multi-stage pattern:
```dockerfile
# Stage 1: deps
FROM python:3.11-slim AS deps
WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN pip install poetry && poetry install --no-root --only main

# Stage 2: build
FROM deps AS builder
COPY . .
RUN poetry install --only main

# Stage 3: runner (non-root)
FROM python:3.11-slim AS runner
RUN useradd -m -u 1001 appuser
WORKDIR /app
COPY --from=builder /app .
USER appuser
CMD ["uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

docker-compose.local-db.yml — copy from ~/projects/scaffold-rules/docker-compose.local-db.yml

All env files committed:
- .env.example (root)
- .env.backend.example
- .env.dockerfile.example-api
- .env.dockerfile.example-launchpad

---

## UI Design System (NON-NEGOTIABLE — Read Before Steps 11 & 12)

This is NOT a generic UI. Every pixel must match Cireta's real brand identity.
Study ~/projects/cireta-repo before writing a single component.

### Typography
- Font: Gilroy ONLY — load via @font-face from local woff2 files (same as globals.css)
- Weights: 500 (Medium) | 600 (Semibold) | 700 (Bold)
- letter-spacing: -0.03em on body (Cireta brand rule — critical)
- Heading tracking: -tracking-[1.44px] to -tracking-[1.8px] on large headings
- Font smoothing: -webkit-font-smoothing: antialiased

### Exact Tailwind Color Tokens (from tailwind.config.ts)
```
darkBlack:  #180B2E   (deep purple-black — dark sections, nav bg)
darkAqua:   #13636F   (teal — primary brand, CTAs, links, progress bars)
box:        #ECF3F4   (light blue-grey — card backgrounds, input fills)
text:       #0C0C0C   (near-black — body copy)
black:      #000000
white:      #ffffff
```
Use these tokens always. Never hardcode hex values in components.

### Gold Accent
#C9913D — used for premium/featured badges, hover accents, star ratings.
Add to tailwind config as `gold: '#C9913D'`.

### Background Patterns
- Dark hero sections: bg-darkBlack with subtle gradient overlay
- Light sections: bg-white or bg-box
- Cards: bg-box with border-[1.5px] border-darkBlack/10 (exactly like ProjectCard)
- Featured/dark cards: bg-darkAqua/[0.08] (semi-transparent teal wash)

### Border Radius Scale
- Cards: rounded-3xl (24px) — see ProjectCard
- Inner card image area: rounded-[20px]
- Buttons: rounded-full (pill shape — see Button.tsx)
- Badges/tags: rounded-[100px]
- Feature cards: rounded-3xl or rounded-[40px] for section containers

### Button Component
Copy the exact Button.tsx pattern from cireta-repo:
- Uses framer-motion (motion.button)
- rounded-full, py-2.5 md:py-[18px] px-6 md:px-10
- text-xsm/4 md:text-sm/5 lg:text-base/6
- hover:opacity-80 with duration-300
- Primary CTA: bg-darkAqua text-white
- Secondary: bg-white text-text border border-darkBlack/10
- Outline teal: border border-darkAqua text-darkAqua bg-transparent
- NO generic MUI/shadcn buttons — hand-rolled only

### Tag / Badge Pattern (from ProjectCard)
```tsx
<div className="flex items-center justify-center rounded-[100px] py-1.5 px-4 gap-[10px] border-[0.5px] border-white bg-white/20 text-white font-medium text-[14px] shadow-tag backdrop-blur-[10px]">
  {label}
</div>
```
Use backdrop-blur for floating labels over images. shadow-tag defined in tailwind config.

### Progress Bar Pattern (from ProjectCard)
```tsx
<div className="bg-[#b2b7b81a] rounded-[100px] overflow-hidden h-[12px]">
  <div className="h-[12px] bg-darkAqua rounded-[100px]" style={{ width: `${pct}%` }} />
</div>
```

### Card Pattern (from ProjectCard)
```tsx
<div className="relative group block bg-box p-1 rounded-3xl border-[1.5px] border-darkBlack/10 h-full cursor-pointer overflow-hidden">
  <div className="rounded-[20px] h-[393px] overflow-hidden">
    <Image ... className="group-hover:scale-105 duration-500" />
  </div>
  <div className="flex justify-between flex-col pt-4 p-3">
    {/* content */}
  </div>
</div>
```
Cards scale image on hover with `group-hover:scale-105 duration-500`.

### Navigation Pattern (from Header.tsx)
- Transparent on top, gains `shadow-nav` on scroll (isScrolled state)
- shadow-nav: 0px 0px 16px 0px rgba(255,255,255,0.06) inset
- backdrop-blur on scroll
- Logo: 4-pointed star SVG + "Cireta" in Gilroy Bold
- Links: text-white on dark hero, text-text on light pages
- Mobile: hamburger → full-screen aside panel (AsideBar pattern)

### Section Layout
- Max content width: max-w-inner (1624px) centered
- Section padding: py-10 to py-20 depending on density
- Grid: grid-cols-2 or grid-cols-3 with gap-16 or gap-8
- Container: use Container component with max-w-inner class

### Animations (framer-motion — mandatory, not optional)
Copy the motion patterns from cireta-repo:
- Cards: whileInView opacity 0→1, y 100→0, type: "spring", duration: 2
- Staggered: delay: (index + 1) * 0.25
- Buttons: already on motion.button
- Page transitions: initial opacity 0, animate opacity 1
- viewport: {{ once: true }} on all scroll animations

### Dashboard / Portal Specific Rules
The launchpad and admin are app-like (not marketing). Apply this adapted style:

**Sidebar nav:**
- Width: 240px, bg-darkBlack, text-white
- Active item: bg-darkAqua/20 text-darkAqua rounded-xl
- Icons: Lucide React ONLY (not heroicons, not fontawesome)
- No generic sidebar templates — custom built

**Data cards:**
- bg-box rounded-3xl p-6 border border-darkBlack/10
- Metric value: text-2xl font-bold text-darkBlack tracking-tight
- Label: text-xs text-text/60 uppercase tracking-wide
- Trend indicator: green (#16a34a) up / red (#dc2626) down

**Tables:**
- thead: bg-darkAqua text-white text-sm font-semibold
- tbody rows: hover:bg-box transition-colors
- Striped: even rows bg-box/50
- Status pills: use rounded-full px-3 py-1 text-xs font-semibold
  - active: bg-darkAqua/10 text-darkAqua
  - pending: bg-gold/10 text-gold
  - failed/rejected: bg-red-100 text-red-700

**Forms:**
- Input: bg-box border border-darkBlack/10 rounded-xl px-4 py-3 focus:border-darkAqua focus:ring-1 focus:ring-darkAqua outline-none
- Label: text-sm font-semibold text-text mb-1.5
- Error: text-red-600 text-xs mt-1
- No floating labels — labels above inputs always

**Empty states:**
- Centered layout, custom SVG illustration (simple geometric, on-brand)
- Heading + subtext + CTA button
- NOT generic grey box with "No data found"

### Icons
Use Lucide React ONLY. Never:
- heroicons
- fontawesome
- react-icons random packs
- emoji as icons
- Generic stock icon sets

Common icons: TrendingUp, Shield, Coins, Wallet, Users, ArrowRight, ChevronDown, CheckCircle2, XCircle, Clock, Lock, Globe, FileText, BarChart3, RefreshCw

### Key Screen References
Study these before building each page:
- Home/hero: ~/projects/cireta-repo/src/app/components/homepage/Banner.tsx
- Project card: ~/projects/cireta-repo/src/app/components/card/ProjectCard.tsx
- Asset card: ~/projects/cireta-repo/src/app/components/card/AssetsCard.tsx
- Featured section: ~/projects/cireta-repo/src/app/components/homepage/FeaturedProjects.tsx
- Header: ~/projects/cireta-repo/src/app/components/Header.tsx
- Button: ~/projects/cireta-repo/src/app/components/Button.tsx
- Tailwind config: ~/projects/cireta-repo/tailwind.config.ts

### What "Gorgeous" Means Here
1. Every card has real hover states (scale, shadow change, border glow)
2. Progress bars are always teal (#13636F), pill-shaped, with light track
3. Status badges use backdrop-blur on media, solid pill on lists
4. Numbers/metrics are large, bold, darkBlack or darkAqua colored
5. Sections alternate: dark hero → light content → dark feature → light content
6. Framer-motion entrance animations on every card grid (staggered)
7. No grey placeholder boxes. No lorem ipsum in UI code.
8. Images always have object-cover + aspect ratio locked containers
9. Mobile-first — every component must look perfect at 375px AND 1440px
10. Letter spacing -0.03em EVERYWHERE — it defines the brand feel

### What NOT to Build
- No Material UI / Ant Design / shadcn default themes
- No Bootstrap grid
- No generic CSS resets beyond Tailwind
- No SVG icon libraries except Lucide
- No inline styles except for dynamic values (progress width, chart bars)
- No fixed pixel font sizes not in the tailwind fontSize scale
