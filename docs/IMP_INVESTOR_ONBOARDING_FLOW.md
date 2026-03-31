# Investor Onboarding Flow

**Date:** 2026-03-31
**Status:** Implementation

---

## Overview

After registration (OTP or Google), investors land on the projects page. A prominent CTA guides them through a multi-step onboarding to complete their profile before they can invest.

## Top-right CTA

When user is logged in but hasn't completed onboarding, show a prominent **amber/gold pulsing button**: "Complete Setup" (replaces "Get Verified"). Disappears once all steps are done.

## Onboarding Screen (`/onboarding`)

### Step 0: Investor Type (permanent, cannot be changed)

```
┌─────────────────────────────────────────────────┐
│  How will you be investing?                     │
│                                                 │
│  ┌──────────────────┐  ┌──────────────────┐    │
│  │  👤 Individual   │  │  🏢 Corporate    │    │
│  │                  │  │                  │    │
│  │  Personal        │  │  Company or      │    │
│  │  investment      │  │  entity          │    │
│  │  account         │  │  investment      │    │
│  └──────────────────┘  └──────────────────┘    │
│                                                 │
│  ⚠️ This selection is permanent and determines  │
│  your verification path (KYC for individuals,   │
│  KYB for corporates). Contact support@cireta.com│
│  if you need to change this later.              │
│                                                 │
│  [Continue →]                                   │
└─────────────────────────────────────────────────┘
```

### Step 1: Personal Details

**Individual:**
- Full name
- Date of birth
- Nationality
- Country of residence

**Corporate:**
- Company name
- Registration number
- Jurisdiction
- Authorized representative name

### Step 2: Connect Wallet (optional, can skip)

```
┌─────────────────────────────────────────────────┐
│  Connect Your Wallet                            │
│                                                 │
│  Link a wallet for on-chain investments.        │
│  You can also do this later from settings.      │
│                                                 │
│  [Connect Wallet]     [Skip for now →]          │
└─────────────────────────────────────────────────┘
```

### Step 3: Identity Verification (KYC/KYB)

- Individual → Sumsub KYC widget (ID + selfie)
- Corporate → Sumsub KYB widget (company docs + beneficial ownership)
- Shows estimated time: "Usually 5-10 minutes"
- Dev mode: "Skip Verification (Dev Only)" button using `/kyc/dev-approve`

### Completion Screen

```
┌─────────────────────────────────────────────────┐
│  ✅ You're all set!                             │
│                                                 │
│  Your account is ready. Start exploring         │
│  investment opportunities.                      │
│                                                 │
│  [Browse Projects →]                            │
└─────────────────────────────────────────────────┘
```

## Progress Tracking

- Each step shows a progress bar (Step 1 of 4)
- Steps already completed show green checkmarks
- User can navigate back to previous steps
- Skipped steps (wallet) show as "optional — complete later"
- Navbar CTA updates based on completion: "Complete Setup (2/4)"

## Data Model

- `investor_type`: "individual" | "corporate" on User model (new field, nullable until set)
- `date_of_birth`: Date field on User model
- `nationality`: String field on User model
- `country_of_residence`: String field on User model (separate from country_code)
- `company_name`: String field on User model (for corporate)
- `company_registration_number`: String field on User model (for corporate)
- `company_jurisdiction`: String field on User model (for corporate)
- `onboarding_completed`: Boolean on User model

## Contact Page (`/contact`)

- Support email: support@cireta.com
- Response time: "Within 24 hours"
- For urgent matters: "Email with subject line URGENT"
- Office address placeholder
- Link from investor type warning message

## Implementation

### Backend
- Migration: add investor onboarding fields to users table
- `POST /auth/onboarding/type` — set investor type (one-time, irreversible)
- `POST /auth/onboarding/details` — save personal/corporate details
- `GET /auth/onboarding/status` — returns completion state of each step

### Frontend
- `/onboarding` page with 4-step wizard
- Navbar CTA: "Complete Setup" when incomplete
- `/contact` page
- Progress persistence across sessions
