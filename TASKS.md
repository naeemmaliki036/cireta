# Cireta — Task Tracker

## Format: [STATUS] PRIORITY | Task

## CRITICAL
[~] HIGH | Deploy API to fresh Railway project — old service stuck on stale context
[ ] HIGH | Sumsub SDK integration on /verify page
[ ] HIGH | Invest flow — wire USDC approve + on-chain tx (wagmi writeContract)
[ ] HIGH | Smart contracts — write ERC-3643 token contracts (contracts/ is empty)

## IN PROGRESS  
[x] DONE | Explore page — 3 real projects from API ✅
[x] DONE | Project detail page — by-slug API, real data ✅
[x] DONE | Register/Login E2E — both work, auth context wired ✅
[x] DONE | Portfolio page — wired to real API ✅
[x] DONE | Seed data — 3 users, 1 issuer, 3 tokens, 3 sales ✅

## SCAFFOLD COMPLIANCE
[ ] MED | Split web3_service.py (493 LOC) into base + token + identity
[ ] MED | Split sale_service.py (468 LOC) into write + query services  
[ ] MED | Split compliance_service.py (359 LOC)
[ ] MED | Split admin.py endpoint (315 LOC)

## MEDIUM
[ ] MED | Admin portal — wire all pages to API (currently placeholder data)
[ ] MED | Portfolio vesting claim — wire on-chain claim transaction
[ ] LOW | Home page — split 330 LOC file

## DEPLOYMENT
[ ] HIGH | Fresh Railway project — API + Frontend + Postgres
[ ] HIGH | Run Alembic migrations on Railway Postgres
[ ] HIGH | Seed Railway DB with demo data
[ ] HIGH | Wire NEXT_PUBLIC_API_URL on launchpad to Railway API URL
