# Sale Creation Flow — Persistence & Reload Audit

**Date:** 2026-04-30
**Branch audited:** `sandbox` (`c2e545c`)
**Scope:** every field the issuer can fill in the create-sale wizard, traced through:

1. **Wizard send** — frontend payload to `createSale` / `updateSale`
2. **Schema receive** — `SaleCreateRequest` / `SaleUpdateRequest` in Pydantic
3. **Service persist** — `SaleCreateService.create_sale` (create) or `setattr` loop (update)
4. **Response build** — `_sale_to_response` in `apps/api/api/v1/endpoints/sales.py`
5. **Reload** — wizard prefill effect reading `getSale(id)` on draft resume

The goal: confirm every field round-trips so a draft can be saved, the page reloaded, and the form repopulated faithfully.

---

## Bugs found and fixed

### Critical (silently dropped on every create)

| # | Field | Symptom | Fix commit |
|---|---|---|---|
| 1 | `total_token_supply` | Stored as `0` regardless of wizard input → on-chain deploy revert | `8c6cfe8` |
| 2 | `sale_start_time` | Stored as `NULL` → "Sale Start" empty on reload, phases couldn't validate | `8c6cfe8` |
| 3 | `sale_end_time` | Stored as `NULL` → "Sale End" empty on reload | `8c6cfe8` |
| 4 | `otc_token_address` | Stored as `NULL` → on-chain deploy guard rejected with "OTC enabled but no OTC token set" | `8c6cfe8` |
| 5 | `is_open_ended` | Always `false` even when checkbox was on → unchecked on reload | `8a4ecfe` |
| 6 | `sale_mode` | Response defaulted to `"vested"` regardless of DB value → "direct" mode lost on reload | `f5fecf7` |
| 7 | Phase `top_up_min`, `allocation_mode` | Service silently dropped these on persist | `2fe6703` |

The first six were caused by the **same class of bug**: `create_sale` service signature didn't accept the parameter, the endpoint didn't pass it, and the response builder either omitted the field or used the wrong default. Updates worked through generic `setattr`, but every fresh sale lost the data.

### High (UX / correctness)

| # | Issue | Fix commit |
|---|---|---|
| 8 | Wizard's `cliff/vesting_duration_days: float` collided with `int` validator and lost float precision | `d869ea9` (refactored to `_seconds: int` end-to-end + Alembic 043) |
| 9 | `AddPhaseForm.toLocal()` sliced `Z` instead of converting to local TZ → bogus "Phase outside sale window" rejections for non-UTC users | `cfd3adc` |
| 10 | `AddPhaseForm` POST `/phases` silently swallowed errors → on-chain phase added but DB has 0 phases, checklist stuck | `cfd3adc` |
| 11 | `apiFetch` showed generic `APIError` on 422 instead of decoding FastAPI's `[{loc, msg}]` format | `da32c0f` |
| 12 | OTC default-template fetch was admin-only → blocked the "Use default" button for issuers | bundled fallback in template module + `CurrentUserId` on the GET endpoint |
| 13 | Final-step nav row had no error display → save failures appeared silent | `79740c3` |
| 14 | "Save Draft" button hidden on intermediate steps after first save → users had to walk to Review to persist further edits | `bf687ae` |
| 15 | Phase reload showed `100.000000000000000000` (full Decimal precision) instead of `100` | `8c6cfe8` (trim-zeros helper) |
| 16 | Header "Submit for Approval" button bypassed the `SaleSetupChecklist` readiness check → sales submitted before phases on-chain or tokens deposited | `1764498` |

---

## Final field-by-field round-trip table

| Field | Wizard send | Schema receive | Persist (create) | Persist (update) | Response | Reload |
|---|---|---|---|---|---|---|
| `title` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `description` | ✅ | ✅ | ✅ | ✅ | ✅ (as `description_text`) | ✅ |
| `full_description` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `banner_image_url` | ✅ (derived from gallery) | ✅ | ✅ | ✅ | ✅ | ✅ (derived) |
| `is_coming_soon` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `otc_enabled` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `otc_content` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `otc_token_address` | ✅ | ✅ | ✅ ★ | ✅ | ✅ | ✅ |
| `sale_mode` | ✅ | ✅ | ✅ | ✅ | ✅ ★ | ✅ |
| `sale_structure` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `cliff_duration_seconds` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `vesting_duration_seconds` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `token_id` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `payment_token` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `soft_cap` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `hard_cap` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `total_token_supply` | ✅ | ✅ | ✅ ★ | ✅ | ✅ | ✅ |
| `sale_start_time` | ✅ | ✅ | ✅ ★ | ✅ | ✅ | ✅ |
| `sale_end_time` | ✅ | ✅ | ✅ ★ | ✅ | ✅ | ✅ |
| `is_open_ended` | ✅ ★ | ✅ ★ | ✅ ★ | ✅ | ✅ | ✅ |
| `vault_address` | n/a (chain-set) | n/a | ✅ (record-deployment) | n/a | ✅ ★ | n/a |
| `fraction_token_address` | n/a (chain-set) | n/a | ✅ (record-deployment) | n/a | ✅ ★ | n/a |
| `platform_fee_bps` | n/a | n/a | ✅ | ✅ | ✅ ★ | n/a |
| `fee_cap_usdc` | n/a | n/a | ✅ | ✅ | ✅ ★ | n/a |
| `is_redeemable` | not in wizard | ✅ | ✅ | ✅ | ✅ | n/a |
| Phase `name` / `price_per_token` / `allocation` / `start_time` / `end_time` | ✅ | ✅ | ✅ | ✅ (delete-recreate) | ✅ | ✅ (with trim-zeros) |
| Phase `top_up_min` | hardcoded `"1000"` | ✅ | ✅ ★ | ✅ | ✅ | n/a (not in wizard form) |
| Phase `allocation_mode` | hardcoded `"fixed"` | ✅ | ✅ ★ | ✅ | ✅ | n/a (not in wizard form) |
| Phase `whitelist_only` | hardcoded `false` | ✅ | ✅ | ✅ | ✅ | n/a |
| Team members | ✅ (separate POST `/team`) | ✅ | ✅ | ✅ (delete-recreate) | ✅ (separate GET) | ✅ |
| FAQs | ✅ (separate POST `/faqs`) | ✅ | ✅ | ✅ (delete-recreate) | ✅ (separate GET) | ✅ |
| Documents | ✅ (separate POST `/documents`) | ✅ | ✅ | ✅ (delete-recreate) | ✅ (separate GET) | ✅ |
| Gallery images | ✅ (separate POST `/images`) | ✅ | ✅ | ✅ (delete-recreate) | ✅ (separate GET) | ✅ |

★ = previously broken, fixed during this audit.

---

## Out of scope (intentionally not in the wizard)

These fields exist on the model and are settable via other admin/launchpad surfaces. They're properly persisted via the generic `setattr` loop on `PATCH /sales/{id}` and returned correctly in the response — no audit gap, just not part of the wizard.

- Social URLs: `website_url`, `twitter_url`, `linkedin_url`, `instagram_url`, `facebook_url`, `telegram_url`, `discord_url`
- Admin/visibility: `is_visible`, `display_order`
- Lifecycle timestamps: `approved_at`, `activated_at`, `refunds_activated_at`, `finalization_pending`
- Aggregates: `total_raised`, `total_raised_on_platform`, `platform_fee_collected`, `is_active`, `soft_cap_reached`, `hard_cap_reached`, `remaining_capacity`, `status`

---

## Recovery for existing drafts

Sales created **before** the create-path fixes landed will have:

- `total_token_supply = 0`
- `sale_start_time = NULL`
- `sale_end_time = NULL`
- `otc_token_address = NULL`
- `is_open_ended = false` (regardless of choice)
- `sale_mode` whatever was stored (now correctly displayed)

To fix an existing draft:

1. Wait for Vercel + Railway to deploy the latest sandbox commit.
2. Reopen the wizard for the affected draft.
3. Re-fill: Total Token Supply, Sale Start, Sale End, Open-ended (if applicable), OTC Token (if OTC enabled).
4. Click **Save Changes** — the PATCH path was already wired for these fields via `setattr`, so values stick on the second save.

---

## Diagnostic scripts (kept in `contracts/scripts/`)

- `check-deploy-preconditions.ts` — read-only on-chain pre-flight; verifies `isVerified`, `isActiveIssuer`, `feeBps`, replays a failed `eth_call` to decode the custom-error selector. No private key needed.
- `decode-failed-tx.ts` — replay a failed tx by hash and decode the custom-error selector against every known contract interface.
- `repro-sale-deploy.ts` — full repro of the deploy flow (deploy TST token → deploy sale → add phase) using a local `ISSUER_PK` env var. Surfaces named errors instead of "execution reverted".
- `check-otc-minter.ts` — verifies an issuer holds `MINTER_ROLE` on each of their deployed OTC tokens.
