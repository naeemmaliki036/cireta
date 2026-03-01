
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
