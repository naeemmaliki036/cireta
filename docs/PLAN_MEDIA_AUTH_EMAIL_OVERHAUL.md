# Plan: Media Gallery, Auth Overhaul & Email System

**Date:** 2026-03-30
**Status:** Planning — awaiting confirmation before implementation

---

## Scope Summary

8 major workstreams:

1. **Sale Media Gallery** — multiple images + videos per sale (like featured project showcase)
2. **File Storage (GCS + local fallback)** — all uploads go to GCS in production, local disk in dev
3. **Passwordless Auth (OTP)** — no passwords anywhere, email OTP for login/register/verify
4. **Google SSO** — launchpad only (investors), not admin
5. **Email Verification** — OTP code sent to email, not magic link
6. **Email System** — welcome email, transaction confirmation, admin-editable templates
7. **Admin Login UI** — improved design, issuer login requires OTP (no password)
8. **Sale Social Links** — website, Twitter, LinkedIn, Instagram, Facebook per sale

---

## Workstream 1: Sale Media Gallery

### Requirement
- Multiple images per sale (already have `sale_images` table)
- Video support (YouTube/Vimeo embed URLs + direct upload)
- Gallery component on project page (carousel/grid with lightbox)
- Issuer uploads via admin portal

### Current State
- `sale_images` table exists with: `url`, `caption`, `is_banner`, `sort_order`
- CRUD endpoints exist: `GET/POST /sales/{id}/images`, `DELETE /sales/{id}/images/{id}`
- Project page shows banner image but no gallery component

### Gap
- No video support (model or UI)
- No gallery carousel/lightbox component
- No file upload — currently URL-only
- Images table exists but UI for managing multiple images is basic

### Plan
- Add `media_type` field to `sale_images` (or new `sale_media` table): "image" | "video"
- Add `video_url` for YouTube/Vimeo embeds
- Build gallery component (grid + lightbox) on launchpad project page
- Build media upload UI in admin (drag-and-drop, reorder)
- Connect to file storage service (workstream 2)

---

## Workstream 2: File Storage (GCS + Local Fallback)

### Requirement
- All file uploads (images, documents, videos) stored in GCS
- If GCS not configured, fall back to local webserver storage
- Production always uses GCS

### Current State
- No file upload service exists
- All images/documents are URL references (manually uploaded elsewhere)
- No GCS integration

### Plan

**Backend:**
- New `FileStorageService` with interface: `upload(file, path) → url`, `delete(path)`
- `GCSStorageBackend` — uses `google-cloud-storage` SDK
- `LocalStorageBackend` — saves to `uploads/` dir, serves via static files
- Config: `STORAGE_BACKEND=gcs|local`, `GCS_BUCKET`, `GCS_CREDENTIALS_JSON`
- New endpoint: `POST /uploads` — multipart file upload, returns URL

**Frontend:**
- Reusable `FileUpload` component (drag-and-drop + click)
- Used in: sale images, sale documents, team member photos, banner image

---

## Workstream 3: Passwordless Auth (OTP)

### Requirement
- **No passwords anywhere** — OTP verification for all auth flows
- Register: enter email → receive OTP → verify → account created
- Login: enter email → receive OTP → verify → logged in
- Issuer login in admin: email → OTP (no password, no Google)
- Admin login: email + password stays (or also OTP — need to confirm)

### Current State
- Email + password for all auth (register, login)
- `hashed_password` field on User model
- JWT access/refresh tokens after login
- No OTP model or email sending for auth

### Gap — BREAKING CHANGE
This is a fundamental auth architecture change:
- `hashed_password` becomes optional (null for passwordless users)
- New `otp_codes` table or field for storing temporary codes
- Email sending required for every login attempt
- Rate limiting critical (prevent OTP spam)
- Need to handle: OTP expiry, brute force, replay attacks

### Plan

**Database:**
- New table: `auth_otps` (user_id, code, expires_at, used_at, purpose: "login"|"register"|"verify_email")
- User model: `hashed_password` becomes nullable

**Backend:**
- `OTPService`: generate 6-digit code, store with 10-min expiry, verify, rate limit (5/hour per email)
- New endpoints:
  - `POST /auth/otp/request` — send OTP to email (login or register)
  - `POST /auth/otp/verify` — verify OTP, return JWT tokens
  - `POST /auth/register` — now takes email + OTP (no password)
  - `POST /auth/login` — now takes email + OTP (no password)
- Keep password-based login as fallback for existing users (migration period)

**Frontend:**
- Login page: email input → "Send Code" → OTP input → verify → logged in
- Register page: email input → "Send Code" → OTP input → display name → done
- No password fields anywhere

---

## Workstream 4: Google SSO (Launchpad Only)

### Requirement
- "Sign in with Google" on launchpad login/register
- Not available on admin portal
- Maps Google email to Cireta account

### Current State
- No OAuth/SSO integration
- Email + password only

### Plan
- Use `next-auth` or direct Google OAuth2 flow
- Backend: `POST /auth/google` — accepts Google ID token, creates/finds user, returns JWT
- Frontend: Google sign-in button on launchpad login + register pages
- Auto-link if email already exists (after email verification)

---

## Workstream 5: Email Verification via OTP

### Requirement
- After registration, send 6-digit code to email
- User enters code to verify email
- No magic links — OTP only

### Current State
- `email_verified` flag on User model
- No email verification flow implemented
- Users are marked verified on registration (auto-verified in dev)

### Plan
- Part of OTP system (workstream 3)
- After register: auto-send verification OTP
- `POST /auth/verify-email` — accepts email + OTP code
- Block investment until email verified

---

## Workstream 6: Email System

### Requirement
- Welcome email after email verification (with next steps: connect wallet, complete KYC)
- Transaction confirmation email when investor buys
- Admin-editable email templates via admin portal
- Structure for future emails

### Current State
- `RESEND_API_KEY` in config (Resend email service)
- No email sending implementation
- No email templates

### Email Inventory (Gap Analysis)

| Email | Trigger | Priority | Status |
|---|---|---|---|
| **OTP Code** | Login/register/verify request | P0 | Missing |
| **Welcome Email** | After email verification | P0 | Missing |
| **KYC Approved** | Sumsub webhook → approved | P1 | Notification exists, no email |
| **KYC Rejected** | Sumsub webhook → rejected | P1 | Notification exists, no email |
| **Investment Confirmation** | After successful contribution | P0 | Missing |
| **Sale Deployed** | Issuer deploys sale on-chain | P2 | Missing |
| **Token Claim Available** | Vesting cliff reached | P1 | Missing |
| **Dividend Distribution** | New dividend epoch | P1 | Missing |
| **Redemption Processed** | Redemption status → shipped/fulfilled | P1 | Missing |
| **Issuer Approved** | Admin activates issuer | P1 | Missing |
| **Issuer Wallet Approved** | Admin approves wallet | P2 | Missing |
| **Sale Approved** | Admin approves sale | P1 | Missing |
| **Password Reset** | Forgot password request | P1 | Partially exists (token, no email) |
| **Account Security Alert** | Failed login attempts, MFA changes | P2 | Missing |
| **Sale Closing Soon** | Sale approaching end date | P2 | Missing |
| **Watchlist Alert** | Saved project opens for investment | P3 | Missing (watchlist not built) |

### Plan

**Backend:**
- `EmailService` with Resend SDK integration (fallback: SMTP or log-only in dev)
- `EmailTemplate` model: key, subject, html_body (admin-editable via platform settings)
- Default templates seeded on first run
- Template rendering with variables: `{{user_name}}`, `{{token_name}}`, `{{amount}}`, etc.

**Admin Portal:**
- Email Templates section in platform settings
- Rich text editor per template (reuse Tiptap component)
- Preview + test send

**P0 emails for launch:**
1. OTP Code
2. Welcome Email (with next steps based on user type)
3. Investment Confirmation

---

## Workstream 7: Admin Login UI

### Requirement
- Better visual design for admin login page
- Issuer login requires OTP verification over email (no password)
- No Google SSO on admin

### Plan
- Redesign admin login page (split layout or centered card with branding)
- Issuer flow: email → OTP → dashboard
- Admin flow: email → OTP → dashboard (or keep password for admin — need to confirm)

---

## Implementation Order

| Phase | Workstreams | Why This Order |
|---|---|---|
| **Phase 1** | File Storage (WS2) | Foundation — needed by gallery and email templates |
| **Phase 2** | Email System (WS6) | Foundation — needed by OTP auth |
| **Phase 3** | OTP Auth + Email Verification (WS3, WS5) | Core change — must be stable before SSO |
| **Phase 4** | Google SSO (WS4) | Builds on auth system |
| **Phase 5** | Sale Media Gallery (WS1) | Uses file storage, independent of auth |
| **Phase 6** | Admin Login UI (WS7) | Final polish |

### Estimated File Count

| Phase | New Files | Modified Files |
|---|---|---|
| Phase 1 (Storage) | 3 (service + 2 backends) | 2 (config, upload endpoint) |
| Phase 2 (Email) | 4 (service, templates model, migration, admin UI) | 3 (config, platform settings, KYC service) |
| Phase 3 (OTP Auth) | 3 (OTP model, migration, service) | 6 (auth endpoints, auth service, login/register pages x2) |
| Phase 4 (Google SSO) | 2 (google auth endpoint, google button component) | 3 (auth service, launchpad login, launchpad register) |
| Phase 5 (Gallery) | 3 (gallery component, media model update, migration) | 4 (project page, sale creation, sale content endpoint) |
| Phase 6 (Admin UI) | 1 (new login page design) | 1 (admin login page) |

---

## Workstream 8: Sale Social Media Links

### Requirement
- Per-sale social links: website, Twitter/X, LinkedIn, Instagram, Facebook, Telegram, Discord, Medium, GitHub
- Shown on project detail page (nicely styled icon row)
- Managed by issuer in sale creation form
- Only show icons for links that are populated

### Current State
- No social link fields on sales

### Plan

**Database (add to migration):**
- Add to `token_sales`: `website_url`, `twitter_url`, `linkedin_url`, `instagram_url`, `facebook_url`, `telegram_url`, `discord_url`
- All `String(500), nullable=True`

**Backend:**
- Add fields to `SaleCreateRequest`, `SaleResponse`, `TokenSale` model

**Admin:**
- "Social Links" section in sale creation form (Step 2: Content)
- Input fields with URL validation + platform icon previews

**Launchpad:**
- Icon row on project page (below hero or in sidebar)
- Only render icons for non-empty links
- Styled social icons (Twitter/X, LinkedIn, etc.)

---

## Design References

### Admin Login (Mizan-style split layout)
- **Left panel**: Gradient background (use Cireta brand colours), Cireta logo, tagline ("Regulated commodity tokenization"), copyright
- **Right panel**: "Welcome back" / "Sign in to your account to continue", email + OTP code fields (no password), Sign in button
- For admin portal only — no Google SSO, invitation-only access note at bottom
- Issuer login: same layout, email → OTP flow

### Sale Media Gallery (Wassa Gold Mine style)
- Large hero area: main image or embedded video with play button overlay
- Thumbnail strip below (3-5 items), mix of images and video thumbnails
- Click thumbnail → swaps into hero area
- Video plays inline (YouTube/Vimeo embed or direct MP4)
- Title + description above gallery

---

## Decisions Made

| # | Question | Decision |
|---|---|---|
| 1 | Admin auth | OTP for everyone — admins, issuers, investors. Fully passwordless. |
| 2 | Existing users | Auto-migrate: next login sends OTP instead of asking password. `hashed_password` stays but is ignored. |
| 3 | OTP delivery | Resend for all emails (OTP, welcome, transactional). Log-only fallback in dev if no API key. |
| 4 | Google SSO | Launchpad only. Auto-registers new investors if email not in system. Not on admin portal. |
| 5 | Videos | YouTube/Vimeo embed URLs for v1. Direct upload deferred to v2. |
| 6 | Email templates | Rich text editor per template (reuse Tiptap). Variables via `{{placeholder}}` syntax. |

## Required Environment Variables

```env
# Resend (Email) — already in .env, just populate
RESEND_API_KEY=re_xxxxx                    # from resend.com/api-keys
SMTP_FROM=noreply@cireta.com               # already set, needs domain verified in Resend

# GCS (File Storage) — leave blank for local fallback in dev
GCS_BUCKET=cireta-uploads
GCS_PROJECT_ID=your-gcp-project-id
GCS_CREDENTIALS_JSON={"type":"service_account",...}
# OR: GCS_CREDENTIALS_FILE=/path/to/service-account.json

# Google OAuth (Launchpad SSO) — leave blank to hide Google button
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
```

### How to Get These

**Resend:** Sign up at resend.com → API Keys → Create key. Verify your domain (cireta.com) under Domains.

**GCS:** GCP Console → Storage → Create bucket (`cireta-uploads`) → IAM → Service account with `Storage Object Admin` → Download JSON key.

**Google OAuth:** GCP Console → APIs & Services → Credentials → Create OAuth 2.0 Client → Web app → Redirect URIs: `http://localhost:4010/api/auth/callback/google` + `https://launchpad.cireta.com/api/auth/callback/google`.
