# Railway Deployment Guide — Cireta Staging

## Project

- **Railway Project**: Cireta
- **Project ID**: `bac7527e-bc37-4f8e-8daa-ebdc3121984c`
- **Environment**: staging
- **Branch**: `staging` (auto-deploys on push)
- **Repo**: `jawaddxb/cireta`

## Services

| Service | Dockerfile | Port | Domain | Status |
|---------|-----------|------|--------|--------|
| **api** | `Dockerfile.api` | 8080 (Railway-assigned) | `api-staging-7865.up.railway.app` | ✅ Online |
| **launchpad** | `Dockerfile.launchpad` | 3000 | `launchpad-staging.up.railway.app` | ⚠️ Needs builder set to Dockerfile |
| **admin** | `Dockerfile.admin` | 3000 | `admin-staging-f0ca.up.railway.app` | ⚠️ Needs builder set to Dockerfile |
| **Cireta** (Postgres) | — | 5432 | `postgres.railway.internal` | ✅ Online |
| **Redis-cierta** | — | 6379 | `redis-wrew.railway.internal` | ✅ Online |

## Known Railway Quirks

### 1. Builder MUST be set to Dockerfile in dashboard
Railway defaults to Nixpacks when creating services via CLI (`railway add`). You MUST manually change:
- Service → Settings → Build → Builder → **Dockerfile**
- Set Dockerfile Path (e.g., `/Dockerfile.launchpad`)

### 2. railway.toml / railway.json apply to ALL services
Never put `railway.toml` or `railway.json` in the repo root — they override settings for every service in the project. Each service must be configured individually via the dashboard.

### 3. Cached start command
Railway caches the start command from the first detection. If it ever detects `start.py` or `Procfile`, that command sticks forever. Workarounds:
- Delete and recreate the service
- Add a `start.py` shim in the Dockerfile that calls the real entrypoint
- The API uses this pattern: `COPY scripts/start_api.py /app/start.py`

### 4. NEXT_PUBLIC_ env vars need to be at build time
Next.js bakes `NEXT_PUBLIC_*` vars into the bundle at build time. The Dockerfiles use `ARG`/`ENV` to pass these during the Docker build. If you change them, you need a full rebuild (not just redeploy).

### 5. Custom Start Command
Set in dashboard under Settings → Deploy → Custom Start Command:
- **api**: `python3 /app/start.py` (shim that starts uvicorn)
- **launchpad**: Not needed if builder is Dockerfile (uses ENTRYPOINT)
- **admin**: Not needed if builder is Dockerfile (uses ENTRYPOINT)

If Railway ignores the Dockerfile ENTRYPOINT, set Custom Start Command to `python3 /app/start.py` — both frontend Dockerfiles include a Python shim.

## Remaining Setup for launchpad & admin

Both services were created but need the Dockerfile builder configured:

1. Click service → **Settings → Build**
2. Change Builder: **Nixpacks** → **Dockerfile**
3. Set Dockerfile Path:
   - launchpad: `/Dockerfile.launchpad`
   - admin: `/Dockerfile.admin`
4. Save → Railway auto-redeploys

## Environment Variables

### API Service
```
ENVIRONMENT=development          # "development" for dev OTP bypass, "staging" for production-like
DEBUG=false
DATABASE_URL=postgresql+asyncpg://postgres:<password>@postgres.railway.internal:5432/railway
REDIS_URL=redis://default:<password>@redis-wrew.railway.internal:6379
JWT_SECRET_KEY=<generated-hex-64>
ENCRYPTION_KEY=<generated-base64>
LOG_LEVEL=INFO
API_HOST=0.0.0.0
CORS_ORIGINS=https://launchpad-staging.up.railway.app,https://admin-staging-f0ca.up.railway.app
CHAIN_ID=84532
WEB3_RPC_URL=https://base-sepolia.g.alchemy.com/v2/<key>
IDENTITY_SIGNER_PRIVATE_KEY=<key>
PLATFORM_FEE_RECEIVER=0x7C7fAF2473C43A8F02e70B93938e436FADeFfcbb
TOKEN_FACTORY_ADDRESS=0x527985be91A82Be2903f6F62d0cf707fe5E3c8C1
SALE_FACTORY_ADDRESS=0xf83CbEf48eb68fF32C1aaDCc85E63A0Da7AD0835
FRACTION_FACTORY_ADDRESS=0x1Ec520E0c61c7C92484908f7d29a9cEa5e60Af42
ISSUER_REGISTRY_ADDRESS=0x48066cC2dE6A46561469cf2664b0BD9143aa448c
IDENTITY_REGISTRY_ADDRESS=0xD4Bb57300F1cE6b8dD84de7C904B2E7Ac9AF5695
IDENTITY_MODE=simple
SUMSUB_APP_TOKEN=sbx:<token>
SUMSUB_SECRET_KEY=<key>
GCS_BUCKET=cireta-docs-public-dev
GCS_PRIVATE_BUCKET=cireta-docs-private-dev
GCS_PROJECT_ID=prj-mizan
GCS_CREDENTIALS_JSON=<full-json>
GOOGLE_CLIENT_ID=<id>
GOOGLE_CLIENT_SECRET=<secret>
FRONTEND_URL=https://launchpad-staging.up.railway.app
SMTP_FROM=noreply@cireta.com
PYTHONUNBUFFERED=1
```

### Launchpad Service
```
NEXT_PUBLIC_API_URL=https://api-staging-7865.up.railway.app
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=placeholder    # Replace with real WalletConnect project ID
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
NEXT_PUBLIC_SALE_FACTORY_ADDRESS=0xf83CbEf48eb68fF32C1aaDCc85E63A0Da7AD0835
NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=0x527985be91A82Be2903f6F62d0cf707fe5E3c8C1
NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS=0xD4Bb57300F1cE6b8dD84de7C904B2E7Ac9AF5695
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
```

### Admin Service
```
NEXT_PUBLIC_API_URL=https://api-staging-7865.up.railway.app
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=placeholder
NEXT_PUBLIC_CHAIN_ID=84532
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
```

## Contract Addresses (Base Sepolia — shared with local dev)

| Contract | Address |
|----------|---------|
| Token Factory | `0x527985be91A82Be2903f6F62d0cf707fe5E3c8C1` |
| Sale Factory | `0xf83CbEf48eb68fF32C1aaDCc85E63A0Da7AD0835` |
| Fraction Factory | `0x1Ec520E0c61c7C92484908f7d29a9cEa5e60Af42` |
| Issuer Registry | `0x48066cC2dE6A46561469cf2664b0BD9143aa448c` |
| Identity Registry | `0xD4Bb57300F1cE6b8dD84de7C904B2E7Ac9AF5695` |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

## Google OAuth Setup

In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials):
- **Authorized JavaScript origins**: `https://launchpad-staging.up.railway.app`
- **Authorized redirect URIs**: `https://launchpad-staging.up.railway.app/api/auth/callback/google`

## Remaining TODOs

- [ ] Set launchpad & admin builder to Dockerfile in dashboard
- [ ] Set `RESEND_API_KEY` on API if email (OTP) needed in staging
- [ ] Replace `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=placeholder` with real key from [cloud.walletconnect.com](https://cloud.walletconnect.com)
- [ ] Delete empty `redis` service (the one showing "Service is offline")

## Deploying Changes

1. Push to `platform-overhaul-auth-otc-identity-sale-contract` branch
2. Merge to `staging`: `git checkout staging && git merge platform-overhaul-auth-otc-identity-sale-contract --no-edit && git push origin staging`
3. Railway auto-deploys all 3 services from staging branch

Or manually: `railway service <name> && railway up --detach`

## Dockerfiles

- `Dockerfile.api` — Python 3.11, Poetry venv, includes `start.py` shim at `/app/start.py`
- `Dockerfile.launchpad` — Node 20, Next.js standalone, includes Python + `start.py` shim
- `Dockerfile.admin` — Node 20, Next.js standalone, includes Python + `start.py` shim
