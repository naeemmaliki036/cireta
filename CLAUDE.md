# CLAUDE.md — Cireta RWA Launchpad

## What We Are Building
Cireta is a regulated RWA tokenization launchpad for gold, copper, and commodity futures.
ERC-3643 security tokens. Full KYC/AML via Sumsub + ONCHAINID. Multi-issuer platform.

Website: www.cireta.com
Brand repo: ~/projects/cireta-repo (Gilroy fonts, exact colours, component patterns)
Scaffold reference: ~/projects/scaffold-rules (copy patterns exactly)

**Extended docs:**
- UI/design patterns: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)
- API routes, models, env vars: [docs/API_REFERENCE.md](docs/API_REFERENCE.md)

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
│   │   ├── models/             SQLAlchemy models
│   │   ├── schemas/            Pydantic request/response schemas
│   │   └── main.py             App init + middleware stack
│   ├── launchpad/              Next.js investor portal (launchpad.cireta.com)
│   └── admin/                  Next.js admin portal (admin.cireta.com)
├── packages/common/            Shared Python (middleware, auth, DB, encryption)
├── contracts/                  Hardhat — ERC-3643 token contracts
├── infra/alembic/              DB migrations
├── tests/                      pytest suites (unit/ integration/ e2e/)
├── docs/                       Architecture docs, design system, API reference
└── scripts/                    Dev scripts

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

## Build Order

Step 1: Set up packages/common (copy + adapt from scaffold-rules)
Step 2: Initial Alembic migration with all models
Step 3: apps/api skeleton — main.py, middleware, health endpoint
Step 4: AuthService + auth endpoints + JWT
Step 5: KYCService + Sumsub webhook (HMAC validation first)
Step 6: TokenService + SaleService + endpoints
Step 7: VestingService + RedemptionService + portfolio endpoints
Step 8: IssuerService + ComplianceService + admin endpoints + audit_logs
Step 9: Web3Service (deploy contracts via CiretaTokenFactory)
Step 10: Smart contracts (Hardhat) — ERC-3643 token set
Step 11: apps/launchpad — all investor pages (see docs/DESIGN_SYSTEM.md)
Step 12: apps/admin — issuer + platform admin pages (see docs/DESIGN_SYSTEM.md)
Step 13: Tests — unit for all services, integration for API routes
Step 14: Docker + Railway deploy config
Step 15: Security hardening pass — verify ALL encrypted fields, rate limits, HMAC validation

---

## Reference Files

Scaffold sources:
  ~/projects/scaffold-rules/packages/common/ (middleware, models, DB, auth)
  ~/projects/scaffold-rules/Makefile, pyproject.toml, docker-compose.local-db.yml

Frontend patterns:
  ~/projects/cireta-repo/src/app/components/ (Button.tsx, ProjectCard.tsx, Header.tsx)
  ~/projects/cireta-repo/tailwind.config.ts

---

## Audit Protocol (MANDATORY — run after EVERY step)

```bash
# Backend
poetry run ruff check .                            # lint clean
python -c "from apps.api.main import app"          # no import errors
poetry run pytest tests/ -x -q                     # all pass

# Frontend (once exists)
cd apps/launchpad && npx tsc --noEmit              # TypeScript clean
cd apps/admin && npx tsc --noEmit                  # TypeScript clean

# Contracts
cd contracts && npx hardhat test                   # all pass

# Docker
docker build -f Dockerfile.api . --no-cache        # builds OK
docker build -f Dockerfile.launchpad . --no-cache  # builds OK
```

If ANY step fails — stop, fix it, re-run, THEN proceed.
Document every audit result in docs/BUILD_LOG.md.

---

## Docker Conventions

Dockerfile naming: Dockerfile.api, Dockerfile.launchpad, Dockerfile.admin at REPO ROOT
Multi-stage: deps → builder → runner (non-root appuser)
docker-compose.local-db.yml — copy from ~/projects/scaffold-rules/

---

## BUILD_LOG.md Protocol

Maintain docs/BUILD_LOG.md. After every step append:

```
## Step N — [name] — [YYYY-MM-DD HH:MM]
### Built
- list of files created/modified
### Audit
- pytest: X/X passed, ruff: clean, tsc: clean, docker: OK
### Decisions / Issues
- any deviation and why, what broke
```

---

## E2E UI Testing Methodology (NON-NEGOTIABLE)

All end-to-end user-flow testing of the launchpad/admin apps follows this protocol:

**Tools — UI only.**
- `mcp__claude-in-chrome__*` — every click, form input, navigation, network/console read on the launchpad/admin web apps.
- `mcp__computer-use__*` — only for surfaces the browser extension cannot reach: native wallet extension popups (MetaMask/Rainbow sign/approve/confirm), OS-level modals, screenshots of native state.
- **Forbidden:** Playwright, Cypress, direct curl/HTTPie to API, DB writes to bypass validation, injecting values into localStorage/cookies to skip steps, any shortcut that avoids the UI. If a flow cannot be completed via the UI, that is a **finding**, not a reason to bypass.

**Document format — DoD (Definition of Done).**
- Every test case is a checkbox with: preconditions → UI steps → expected result → evidence (screenshot or console log ref) → expected-vs-actual → driver sign-off → blank `SWEEP:` column for the human reviewer.
- No item is closed without a concrete validation artifact.
- Findings log kept alongside the checklist: ID · phase · severity · repro · expected vs actual · evidence.

**Roles.**
- Claude **drives** (executes every step, captures evidence, checks items off).
- A human teammate **sweeps** (independently validates each item, signs the `SWEEP:` column).

**Stop-and-ask triggers.** Halt and request manual help if any of: wallet extension missing from the Chrome profile · Sumsub keys blank and no dev-approve · RPC unreachable · no ACTIVE sale available. Config issues are solved by the user, not worked around. **Do NOT treat a remote/shared DB as a blocker** — UI testing mimics a real user, and real users don't get DB permission. The DB is invisible to the UI test.

**Tracking.** Mirror the DoD checklist to `TaskCreate` tasks while driving — one task per phase.
