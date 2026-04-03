# Email Template Management System — Implementation Plan

**Date:** 2026-04-03 02:30 UTC+4  
**Status:** Plan

---

## 1. Current State

**What exists:**
- `EmailTemplate` model (`apps/api/models/email_template.py`) — has `key`, `subject`, `html_body`, `description` fields
- `EmailService` (`apps/api/services/email_service.py`) — DB lookup with fallback to `DEFAULT_TEMPLATES` dict, sends via Resend, `_render()` replaces `{{variable}}` placeholders
- `NotificationService` (`apps/api/services/notification_service.py`) — references functions that don't exist in email_service.py (`send_investment_confirmed`, `send_kyc_approved`, etc.) — **bug: emails are silently not sent**
- Admin settings page has a "Notifications" tab that says "Coming soon"
- Only 6 default templates defined: `otp_code`, `welcome`, `investment_confirmation`, `kyc_approved`, `kyc_rejected`, `issuer_approved`

**Critical bugs to fix:**
1. `NotificationService` imports nonexistent standalone email functions — all notification emails silently fail
2. `kyc_expiry_service.py` imports nonexistent `send_kyc_expiry_warning`
3. `issuer_service.py` references template key `issuer_approval_request` not in defaults

---

## 2. Complete Email Catalog (20 templates)

### Authentication & Onboarding

| # | Key | Trigger | Variables | Status |
|---|-----|---------|-----------|--------|
| 1 | `otp_code` | OTP requested (login/register) | `code`, `frontend_url` | Exists |
| 2 | `welcome` | Email verified / registration complete | `display_name`, `frontend_url`, `onboarding_url` | Exists (update body — see Section 7) |

### KYC / Compliance

| # | Key | Trigger | Variables | Status |
|---|-----|---------|-----------|--------|
| 3 | `kyc_approved` | KYC approved (webhook or admin) | `display_name`, `kyc_level`, `frontend_url` | Exists (never sent — bug) |
| 4 | `kyc_rejected` | KYC rejected (webhook or admin) | `display_name`, `reason`, `frontend_url` | Exists (never sent — bug) |
| 5 | `kyc_expiry_warning` | Daily cron, KYC expiring in 30 days | `display_name`, `days_left`, `frontend_url` | New |

### Investments & Sales

| # | Key | Trigger | Variables | Status |
|---|-----|---------|-----------|--------|
| 6 | `investment_confirmation` | Contribution recorded | `display_name`, `token_name`, `token_symbol`, `amount`, `tokens_allocated`, `tx_hash`, `frontend_url` | Exists (never sent — bug) |
| 7 | `sale_finalized_success` | Sale finalized, soft cap met | `display_name`, `token_symbol`, `token_name`, `frontend_url` | New |
| 8 | `sale_finalized_failed` | Sale finalized, soft cap not met | `display_name`, `token_symbol`, `token_name`, `frontend_url` | New |
| 9 | `tokens_claimed` | Investor claims tokens | `display_name`, `token_symbol`, `tokens_amount`, `frontend_url` | New |
| 10 | `refund_claimed` | Investor claims refund | `display_name`, `token_symbol`, `amount`, `frontend_url` | New |
| 11 | `dividend_available` | Issuer deposits dividends | `display_name`, `token_symbol`, `amount`, `frontend_url` | New |

### Wallet

| # | Key | Trigger | Variables | Status |
|---|-----|---------|-----------|--------|
| 12 | `wallet_linked` | Investor links new wallet | `display_name`, `wallet_address_short`, `frontend_url` | New |

### Issuer

| # | Key | Trigger | Variables | Status |
|---|-----|---------|-----------|--------|
| 13 | `issuer_approved` | Admin activates issuer | `display_name`, `admin_url`, `frontend_url` | Exists |
| 14 | `issuer_approval_request` | Issuer submits for approval | `issuer_name`, `action_url`, `admin_url` | New (referenced but missing) |
| 15 | `sale_approved` | Admin approves a sale | `display_name`, `sale_name`, `token_symbol`, `admin_url` | New |
| 16 | `sale_rejected` | Admin rejects a sale | `display_name`, `sale_name`, `reason`, `admin_url` | New |
| 17 | `issuer_wallet_approved` | Admin approves issuer wallet | `display_name`, `wallet_address_short`, `admin_url` | New |
| 18 | `issuer_wallet_rejected` | Admin rejects issuer wallet | `display_name`, `reason`, `admin_url` | New |

### Admin Notifications (to platform admins)

| # | Key | Trigger | Variables | Status |
|---|-----|---------|-----------|--------|
| 19 | `admin_new_issuer` | New issuer registers | `issuer_name`, `issuer_email`, `admin_url` | New |
| 20 | `admin_sale_submitted` | Sale submitted for approval | `sale_name`, `issuer_name`, `admin_url` | New |

---

## 3. Database Changes

### Model update (`apps/api/models/email_template.py`)

Add one column:
```python
is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
```

### Migration

New migration `023_email_template_is_active_and_seed.py`:
- Add `is_active` boolean column (default true)
- Seed all 20 templates via INSERT ON CONFLICT DO NOTHING

---

## 4. Backend Architecture

### Fix NotificationService (critical)

Rewrite each `notify_*` method to use `EmailService.send()` directly:

```python
# Before (broken):
from apps.api.services.email_service import send_investment_confirmed  # doesn't exist
email_fn=send_investment_confirmed

# After (fixed):
email_svc = EmailService(self.db)
await email_svc.send("investment_confirmation", user_email, {
    "display_name": display_name, "amount": amount, ...
})
```

### Admin CRUD Endpoints

New file: `apps/api/api/v1/endpoints/admin_email_templates.py`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/email-templates` | List all templates |
| `GET` | `/admin/email-templates/{key}` | Get single template |
| `PATCH` | `/admin/email-templates/{key}` | Update subject/html_body |
| `PATCH` | `/admin/email-templates/{key}/toggle` | Enable/disable template |
| `POST` | `/admin/email-templates/{key}/preview` | Send test email |
| `POST` | `/admin/email-templates/{key}/reset` | Reset to default |

### EmailService updates

- Add `is_active` check — if template disabled, skip silently
- Expand `DEFAULT_TEMPLATES` to all 20 templates
- Add `get_all_templates()` for admin listing
- Add `reset_template(key)` that deletes DB row (falls back to default)

---

## 5. Frontend Admin UI

### New page: `/platform/email-templates`

- Sidebar nav: add "Email Templates" under Settings
- List view: all 20 templates grouped by category, showing key, subject, active badge
- Edit view: click a template to open editor
  - Subject input
  - RichTextEditor for HTML body (reuse existing component)
  - Available variables shown as clickable chips
  - Live preview pane (rendered HTML with sample data)
  - "Send Test Email" button
  - "Save" / "Reset to Default" / "Enable/Disable" toggle

### API repository

New file: `apps/admin/src/lib/api/repositories/email-templates.ts`

```typescript
getEmailTemplates(): Promise<EmailTemplate[]>
getEmailTemplate(key: string): Promise<EmailTemplate>
updateEmailTemplate(key: string, data): Promise<EmailTemplate>
toggleEmailTemplate(key: string): Promise<EmailTemplate>
previewEmailTemplate(key: string, toEmail: string): Promise<void>
resetEmailTemplate(key: string): Promise<EmailTemplate>
```

---

## 6. Welcome Email — Onboarding Guidance

The `welcome` email should guide the user through the onboarding steps shown in the screenshot. Updated template body:

**Subject:** Welcome to Cireta — let's get you started

**Body concept:**
```
Hi {{display_name}},

Welcome to Cireta! Your account is ready.

Complete these quick steps to start investing in tokenized real-world assets:

1. Choose Investor Type — Individual or corporate
2. Basic Information — Name, date of birth, nationality
3. Identity Verification — Quick KYC, usually under 5 min
4. Connect Wallet (optional) — Link an EVM wallet for on-chain investments

[Get Started →] {{onboarding_url}}

You can complete these steps whenever you're ready. 
Your progress is saved automatically.

— The Cireta Team
```

This mirrors the onboarding wizard UI the user sees after registration.

---

## 7. Implementation Sequence

### Phase 1 — Bug fixes + foundation
1. Add `is_active` to EmailTemplate model
2. Migration: add column + seed 20 templates
3. Expand `DEFAULT_TEMPLATES` with all 20 template HTML bodies
4. Fix `NotificationService` — replace broken imports with `EmailService.send()`
5. Fix `kyc_expiry_service.py` — use `EmailService.send()`
6. Add `is_active` check to `EmailService._get_template()`

### Phase 2 — Admin API
7. Create `schemas/email_template.py`
8. Create `admin_email_templates.py` endpoints
9. Wire into `router.py`

### Phase 3 — Missing email triggers
10. Add email sends in: `issuer_service.py`, `admin_sales.py`, `sale_contribute_service.py`, `wallet_service.py`
11. Welcome email: trigger on email verification in auth flow

### Phase 4 — Frontend admin UI
12. Create `email-templates.ts` repository
13. Create `/platform/email-templates` page
14. Add sidebar nav link

### Phase 5 — Testing
15. Unit tests for EmailService
16. Integration test for notification → email flow

---

## 8. File Summary

| File | Action |
|------|--------|
| `apps/api/models/email_template.py` | Add `is_active` column |
| `apps/api/services/email_service.py` | Expand defaults, add is_active check |
| `apps/api/services/notification_service.py` | Fix broken imports — use EmailService.send() |
| `apps/api/services/kyc_expiry_service.py` | Fix broken import |
| `apps/api/api/v1/endpoints/admin_email_templates.py` | New — CRUD endpoints |
| `apps/api/schemas/email_template.py` | New — request/response schemas |
| `apps/api/api/v1/router.py` | Wire new router |
| `infra/alembic/versions/023_*.py` | New migration |
| `apps/admin/src/lib/api/repositories/email-templates.ts` | New — API client |
| `apps/admin/src/app/platform/email-templates/page.tsx` | New — admin UI |
