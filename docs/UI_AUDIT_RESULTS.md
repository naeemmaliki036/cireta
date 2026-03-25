# Cireta Platform — UI Audit Results (Phase 1)
> Audit Date: 2026-03-25 04:30 AM Dubai Time
> Auditor: Zyda (AI)
> Method: Browser automation (Playwright via OpenClaw) + DB cross-checks

---

## Summary

| Severity | Count |
|---|---|
| 🔴 Critical | 5 |
| 🟠 High | 4 |
| 🟡 Medium | 6 |
| 🟢 Low | 3 |
| **Total Issues** | **18** |

**Pages tested:** Login, Explore, Token Detail, Portfolio, Admin Login, Admin Dashboard, Tokens, Sales, Investors, Compliance
**E2E API tests:** 85/85 passing ✅

---

## 🔴 CRITICAL Issues

### C1: Compliance Page Crashes (Client-Side Exception)
- **Page:** `/issuer/compliance`
- **Error:** `Application error: a client-side exception has occurred`
- **Console:** Multiple `401 Unauthorized` on `/api/v1/auth/refresh`
- **Impact:** Entire compliance module (freeze/unfreeze/audit logs/recovery) is inaccessible
- **Root Cause:** JWT token expires, refresh fails, no error boundary — page crashes instead of redirecting to login
- **Fix:** Add error boundary + handle 401 gracefully (redirect to login or show "Session expired")

### C2: Quoted Numbers Throughout UI (`"0"` instead of `0`)
- **Pages:** ALL pages with numeric stats — Explore, Portfolio, Admin Dashboard, Sales, Investors
- **Examples:** Investors count `"0"`, Active Sales `"0"`, Total Sales `"1"`, Active Positions `"0"`
- **Impact:** Looks broken/unprofessional. Quotes visible to users.
- **Root Cause:** API returns numbers as strings with quotes, and frontend renders them as-is without parsing
- **Fix:** Either API should return proper integers, or frontend should `parseInt()` / strip quotes

### C3: Charlie's KYC Status Shows "Not Verified" Instead of "Expired"
- **Page:** `/issuer/investors`
- **DB State:** `kyc_status = 'expired'`
- **UI Shows:** "Not Verified"
- **Impact:** Issuers can't distinguish between users who never started KYC vs. users whose KYC expired
- **Root Cause:** KYC badge mapping doesn't handle "expired" status — falls through to default
- **Fix:** Add `expired` case to KYC status mapping in `KYCBadge.tsx`

### C4: Portfolio Shows "Sign in to view" Even When Logged In
- **Page:** `/portfolio`
- **Context:** Alice is logged in (login succeeded, redirected to explore, nav shows logged-in state)
- **Impact:** Users can't see their portfolio despite being authenticated
- **Root Cause:** Auth cookie not propagating to portfolio API calls, or portfolio page uses a different auth mechanism (wallet-based?)
- **Fix:** Ensure JWT cookie is sent with portfolio API requests, or show "Connect Wallet" prompt instead of "Sign in"

### C5: No Visible Logged-In State in Launchpad Nav
- **Page:** All launchpad pages after login
- **Expected:** User name/avatar, dropdown with Account/Settings/Logout
- **Actual:** Only "Connect Wallet" button. No indication user is logged in.
- **Impact:** Users can't log out, access settings, or confirm they're authenticated
- **Fix:** Add user menu to nav bar when authenticated

---

## 🟠 HIGH Issues

### H1: No Error Boundary on Any Page
- **Impact:** Any API error, network issue, or data inconsistency crashes the page with a generic React error
- **Expected:** Graceful error messages, retry buttons, or redirect to login for auth errors
- **Fix:** Add React Error Boundary to layout, handle common HTTP errors (401, 403, 500)

### H2: JWT Refresh Flow Broken
- **Evidence:** Console shows repeated 401 on `/api/v1/auth/refresh`
- **Impact:** Users get logged out silently, pages crash when token expires
- **Fix:** Implement proper refresh token rotation, or show "Session expired" dialog

### H3: Hardcoded Wallet Address `0x1234...5678`
- **Pages:** Portfolio header, Admin header (all pages)
- **Impact:** Misleading — shows fake wallet address regardless of user's actual wallet
- **Fix:** Show actual connected wallet or hide the button until wallet is connected

### H4: Platform Admin Has No Separate Panel
- **Context:** Admin user (admin@cireta.io) sees only the "Cireta Issuer" panel
- **Expected:** Platform-level admin pages (issuers management, platform settings, analytics, user management)
- **Actual:** Admin sees the same issuer panel as issuer users
- **Fix:** Add role-based routing: admin → platform panel, issuer → issuer panel. Or add "Platform" section to sidebar for admin role.

---

## 🟡 MEDIUM Issues

### M1: Status Badges Lowercase
- **Pages:** Token detail ("draft", "commodity"), Sales list ("draft")
- **Expected:** Capitalized ("Draft", "Commodity")
- **Fix:** CSS `text-transform: capitalize` or fix data source

### M2: Token Price Shows $0.00 on Token Detail
- **Page:** `/project/test-gold-token`
- **Context:** Sale has phases with `price_per_token = 1.00`
- **Shows:** "$0.00 / TGLD"
- **Fix:** Pull price from active phase data

### M3: No Pagination on Lists
- **Pages:** Tokens, Sales, Investors
- **Context:** With small data set, pagination isn't visible. Need to test with 20+ items.
- **Fix:** Verify pagination controls appear and work when data exceeds page size

### M4: Missing Display Names
- **Pages:** Investor list shows email + UUID prefix, not display names
- **Impact:** Not user-friendly for issuer to identify investors
- **Fix:** Show `display_name` if available, fallback to email

### M5: "About This Project" Placeholder Content
- **Page:** Token detail "Overview" tab
- **Shows:** "Project details coming soon."
- **Fix:** Pull from token `description` field or indicate it's editable by issuer

### M6: Search Not Tested with Special Characters
- **Pages:** All search boxes (tokens, sales, investors)
- **Risk:** SQL injection or XSS through search input
- **Fix:** Verify parameterized queries and input sanitization

---

## 🟢 LOW Issues

### L1: Footer Links Point to Non-Existent URLs
- **Links:** `docs.cireta.com`, `cireta.com/faqs`, `cireta.com/insights`, `cireta.com/terms-of-service`, `cireta.com/privacy-policy`
- **Impact:** All external links are placeholders
- **Fix:** Either set up the pages or remove/disable the links

### L2: Social Links (Twitter, GitHub, Discord) Are Placeholders
- **Links:** `twitter.com/cireta`, `github.com/cireta`, `discord.gg/cireta`
- **Fix:** Update to actual URLs or remove

### L3: No Favicon / App Icon
- **Impact:** Minor — tab shows default icon
- **Fix:** Add Cireta favicon

---

## Pages Not Yet Tested (Phase 2)

- [ ] Registration flow (new user signup)
- [ ] Forgot password / Reset password
- [ ] MFA setup and verify
- [ ] Token creation form (issuer/tokens/new)
- [ ] Sale creation form (issuer/sales/new)
- [ ] Sale detail / deploy / finalize
- [ ] Investment contribution flow
- [ ] Withdrawals page
- [ ] Settings pages (both launchpad and admin)
- [ ] Platform admin pages (/platform/*)
- [ ] Mobile responsive testing
- [ ] Security tests (CORS, rate limiting, injection)

---

## Recommended Priority

1. **Fix C1 (Compliance crash)** — Entire compliance module is down
2. **Fix C2 (Quoted numbers)** — Affects every page, looks broken
3. **Fix C4 + C5 (Auth state)** — Users can't use portfolio or see they're logged in
4. **Fix H2 (JWT refresh)** — Root cause of multiple issues
5. **Fix H4 (Admin panel)** — Platform admin functionality missing
6. **Fix C3 (KYC expired)** — Data integrity issue for compliance
