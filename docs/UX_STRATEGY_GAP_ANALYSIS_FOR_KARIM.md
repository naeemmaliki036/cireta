# UX Strategy Audit — Gaps & Critical Analysis

**Date:** 2026-03-30
**Source:** UX Strategy Redesign Document (March 2026)
**Audited Against:** Current Cireta codebase

---

## What's Already Solid (No Work Needed)

| Requirement | Status | Evidence |
|---|---|---|
| Guest browsing — no signup wall | **Done** | Middleware only guards `/portfolio`, `/invest`, `/account`. Public can browse all projects. |
| KYC delayed until investment intent | **Done** | KYC check at invest time, not at registration |
| Wallet connection optional until crypto payment | **Done** | Only shown when investor picks crypto path in invest flow |
| Project page structure | **Done** | Has investment calculator, team, FAQs, documents, phases timeline, gallery |
| Multi-step investment flow | **Done** | Amount → Approval → Confirm → Success with progress bar |
| Portfolio dashboard | **Done** | Total value, P&L, holdings table, vesting, transactions |
| Physical redemption flow | **Done** | Cash settlement + physical delivery with address collection |
| Single KYC unlocks all assets | **Done** | `kyc_level >= 2` gates all sales, no per-deal re-verification |
| Notification system | **Done** | In-app + email, user-configurable preferences |
| Mobile responsive | **Done** | Responsive throughout |

---

## Critical Gaps (Missing Entirely)

| # | Requirement | Impact | Backend | Frontend |
|---|---|---|---|---|
| **1** | **Fiat payment (bank/wire/card)** | **Blocks 70%+ of target audience** (commodity investors don't have USDC). Currently crypto-only. | No fiat endpoints, no payment status machine | No bank transfer UI, no card payment, no fiat on-ramp |
| **2** | **Fiat progress tracker** | Without it, bank transfer users sit in anxiety. The doc calls this "the dead zone." | No intermediate states (submitted → processing → confirmed → issued) | No status tracker component |
| **3** | **OTC checkout flow** | Backend has `POST /sales/{id}/otc` but it's issuer-side only. No investor-facing "Large Allocation" path. | OTC endpoint exists but is admin/issuer-facing | QuickTourModal mentions "OTC & Bank" but no actual UI flow |
| **4** | **Watchlist / Save project** | Doc says "Save requires email only" — currently the bookmark button doesn't persist. | No watchlist model or endpoints | Button exists but does nothing |
| **5** | **SPV / Custodian / Insurance trust visuals** | The doc says "Visual trust modules outperform document archives 10:1 for conversion." Currently zero visual trust elements. | No SPV, custodian, or insurance data fields per project | No SPV diagram, no audit badge, no custodian display, no insurance banner |
| **6** | **Referral program** | Doc says show at confirmation screen. Not built at all. | No referral model | No referral UI |
| **7** | **Re-engagement email sequences** | Doc identifies this as the highest-value re-conversion segment. | No email automation | No "Notify me when this closes" |
| **8** | **Secondary market / P2P** | Tier 3 in the doc, but no infrastructure at all. | No transfer or matching endpoints | Nothing |

---

## Partially Built (Needs Work)

| # | Requirement | What Exists | What's Missing |
|---|---|---|---|
| **9** | **KYC tier labels** | `kyc_level` numeric (0, 2, 4) in data model | No "Explorer / Watchlist / Verified / Accredited / Institutional" labels in UI. No differentiated feature access per tier. |
| **10** | **Landing page trust badges** | "What Makes Us Different" section exists below fold | Doc says 3 trust badges **above the fold** (regulated, audited, custodian). Currently no regulatory/audit/custodian badges in hero. |
| **11** | **Landing page headline** | "Build Unshakeable Wealth" | Doc recommends "Own Real Assets. Gold. Copper. Infrastructure." — more specific, less generic. Sub-headline should mention $500 minimum + physical redemption. |
| **12** | **"Invest → Own → Earn → Redeem" mental model** | Redemption exists, vesting exists | No visual timeline on landing page or project pages showing this 4-step model |
| **13** | **Dividend/distribution tracking** | Model exists, endpoint exists | Frontend shows "Coming soon" placeholder |
| **14** | **Google SSO / social auth** | Email+password only | Doc mentions "Email + password (or Google SSO)" for registration |
| **15** | **OTC relationship management** | OTC tx_hash prefix handled in backend | No "dedicated RM will contact you" flow, no WhatsApp/email contact, no premium tier feel |
| **16** | **Investment calculator on project page** | Price per token and min/max shown | No "enter amount → see projected return, distributions, exit value" interactive calculator |

---

## Contradictions / Risks in the Strategy Doc

| Issue | Analysis |
|---|---|
| **"Custodial by default" vs current architecture** | The doc says "Cireta holds custody by default" with wallet as optional. But the current smart contract architecture (ERC-3643, on-chain identity, compliance modules) is built for **non-custodial** token holding. If custodial is the default, you need a custodial wallet service (like Fireblocks) wrapping the on-chain tokens. This is a **major architectural decision** not addressed. |
| **"$500 minimum" in hero** | Current sale schema uses per-sale `min_contribution`. If you hard-code $500 in marketing but some sales have higher minimums, this creates trust issues. Should be dynamic. |
| **"Accredited investor" tier at >$50K** | US accredited investor rules are specific (income/net worth thresholds). Simply gating at $50K doesn't meet SEC requirements. Need actual accreditation verification (income proof, CPA letter). |
| **Physical redemption as "hero feature"** | Currently only exists in portfolio as a post-investment option. Not mentioned anywhere in the marketing/landing page. The doc is right that this is the strongest differentiator — but it's completely invisible to pre-investment users. |
| **KYC "usually approved in under 30 minutes"** | The dev-bypass makes testing instant, but Sumsub processing time varies. Need to manage expectations — show "typically 5-30 minutes" and have a "we'll email you" fallback. |

---

## Priority Matrix

### Ship-blocking (must fix before any real user touches this)
1. Fiat payment integration (bank transfer at minimum)
2. Fiat progress tracker
3. Trust badges above the fold (regulated, audited, custodian)
4. Physical redemption visible in marketing/hero
5. Custodial vs non-custodial architecture decision

### High-conversion impact (next sprint)
6. Interactive investment calculator
7. OTC investor-facing flow
8. Watchlist persistence
9. SPV/custodian visual trust elements
10. KYC tier labels

### Nice-to-have (later)
11. Google SSO
12. Referral program
13. Email re-engagement sequences
14. Secondary market

---

## Bottom Line

The platform has strong bones — the compliance layer, smart contracts, KYC integration, and core investment flow are all working. The biggest gap is **the entire fiat path** (payment, tracking, OTC). For the target audience (commodity investors, family offices, institutional), this is the primary payment method. Without it, the platform is built for crypto-native users only — which contradicts the whole strategy.

The second biggest gap is **visual trust** — the doc correctly identifies that PDFs don't build trust, but the codebase has zero visual trust elements (SPV diagrams, audit badges, custodian logos, insurance banners). These are cheap to build and have outsized conversion impact.

---

*OTC & Bank Transfer implementation details: see [IMP_OTC_BANK_TRANSFER.md](IMP_OTC_BANK_TRANSFER.md)*
