# Admin Portal UI Overhaul Plan

## Design Language (from MIZANOS reference)
- Clean, minimal, no heavy gradients or rounded-3xl
- **Cards**: `rounded-xl border border-zinc-200` (not `rounded-3xl`)
- **Spacing**: Tighter — `p-5` cards, `gap-4` grids, `p-6` main content
- **Colors**: Neutral `zinc-*` palette consistently (drop custom `darkBlack`, `darkAqua`, `gold` for content areas)
- **Typography**: Smaller, tighter — `text-sm` labels, `text-2xl` stat numbers
- **No framer-motion animations** on cards/sections (remove staggered delays)

## 1. Left Navigation Sidebar
- Reduce padding/spacing — tighter nav items (`py-2` instead of `py-3`)
- Simpler active state — left border indicator + subtle bg instead of colored border box
- Group links with section labels: **PLATFORM** (Overview, Tokens, Sales, Compliance) / **MANAGE** (Issuers, Users)
- Keep dark background but simplify — no rounded-xl on nav items, use `rounded-lg`
- Bottom section (Admin Accounts, Settings, Log Out) stays, just tighter
- Smaller logo area

## 2. Settings Page — Tabs
- Horizontal tab bar: General | OTC Template | Compliance (placeholder) | Notifications (placeholder)
- Active tab: dark text + 2px underline in brand color, inactive = gray
- Content renders conditionally per tab
- Placeholder tabs show "Coming soon" message

## 3. Overview Dashboard
- Remove gradient banner — replace with simple stat row
- Stats in horizontal row: compact cards with icon + number + label
- Quick Actions: simpler link-style cards, no hover shadows
- All `rounded-xl`, consistent `border-zinc-200`

## 4. Users Page
- Stats as inline horizontal badges/pills at top instead of big cards
- Search + filters on same row, no wrapping card
- Remove framer-motion wrappers

## 5. Issuers Page
- Stats as inline pills
- Search + filter inline
- Remove framer-motion
- Consistent `rounded-xl` borders

## 6. Compliance Page
- Inline stat pills instead of stat cards
- `rounded-xl border-zinc-200` consistently
- Remove `darkBlack/10` references

## 7. Tokens & Sales Pages
- Ensure `rounded-xl` not `rounded-2xl`/`rounded-3xl`
- Consistent border color (`border-zinc-200`)
- Remove any motion animation wrappers

## Files to modify
1. `PlatformAdminLayout.tsx` — sidebar redesign
2. `overview/page.tsx` — dashboard cleanup
3. `users/page.tsx` — inline stats, remove motion
4. `issuers/page.tsx` — inline stats, remove motion
5. `compliance/page.tsx` — align styling
6. `settings/page.tsx` — add tabs
7. `tokens/page.tsx` — minor cleanup
8. `sales/page.tsx` — minor cleanup
9. `analytics/page.tsx` — fix rounded-3xl
