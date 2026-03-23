# Cireta Design System

> Extracted from CLAUDE.md — the canonical reference for all UI work.
> Study ~/projects/cireta-repo before writing any component.

---

## Brand

Font: Gilroy — ~/projects/cireta-repo/src/assets/fonts/Gilroy-{Bold,Semibold,Medium}.woff2
Colours: #13636F (teal), #ECF3F4 (light bg), #180B2E (dark bg), #C9913D (gold), #0C0C0C (text)
Letter spacing: -0.03em body
Logo: 4-pointed star SVG path "M20 2 L22.5 17.5 L38 20 L22.5 22.5 L20 38 L17.5 22.5 L2 20 L17.5 17.5 Z"
Tailwind config: ~/projects/cireta-repo/tailwind.config.*
Existing components: ~/projects/cireta-repo/src/app/components/

---

## Typography
- Font: Gilroy ONLY — load via @font-face from local woff2 files (same as globals.css)
- Weights: 500 (Medium) | 600 (Semibold) | 700 (Bold)
- letter-spacing: -0.03em on body (Cireta brand rule — critical)
- Heading tracking: -tracking-[1.44px] to -tracking-[1.8px] on large headings
- Font smoothing: -webkit-font-smoothing: antialiased

---

## Tailwind Tokens (copy to launchpad/tailwind.config.ts exactly)

Colors:
  black: "#000"
  darkBlack: "#180B2E"
  white: "#fff"
  text: "#0C0C0C"
  darkAqua: "#13636F"       ← brand teal
  box: "#ECF3F4"            ← card background
  paua: "#202254"
  gold: "#C9913D"

Box shadows:
  nav: "0px 0px 16px 0px rgba(255,255,255,0.06) inset"
  tag: "0px 0px 4px 0px rgba(255,255,255,0.40) inset"
  progress: "20px 0px 0px 0px #13636F inset"
  tooltip: "0px 8px 40px 0px rgba(0,0,0,0.20)"
  aside: "-12px 0px 20px 0px rgba(0,0,0,0.07)"
  bulletIcon: "rgba(19,99,111,0.40) 0px 0px 0px 1px"

Font sizes:
  xsm: "14px", sm: "16px", base: "18px", lg: "20px"
  xl: "22px", xxl: "36px", 1xl: "48px", 2xl: "60px"

Use these tokens always. Never hardcode hex values in components.

---

## Background Patterns
- Dark hero sections: bg-darkBlack with subtle gradient overlay
- Light sections: bg-white or bg-box
- Cards: bg-box with border-[1.5px] border-darkBlack/10 (exactly like ProjectCard)
- Featured/dark cards: bg-darkAqua/[0.08] (semi-transparent teal wash)

## Border Radius Scale
- Cards: rounded-3xl (24px) — see ProjectCard
- Inner card image area: rounded-[20px]
- Buttons: rounded-full (pill shape — see Button.tsx)
- Badges/tags: rounded-[100px]
- Feature cards: rounded-3xl or rounded-[40px] for section containers

---

## Button Component
Copy the exact Button.tsx pattern from cireta-repo:
- Uses framer-motion (motion.button)
- rounded-full, py-2.5 md:py-[18px] px-6 md:px-10
- text-xsm/4 md:text-sm/5 lg:text-base/6
- hover:opacity-80 with duration-300
- Primary CTA: bg-darkAqua text-white
- Secondary: bg-white text-text border border-darkBlack/10
- Outline teal: border border-darkAqua text-darkAqua bg-transparent
- NO generic MUI/shadcn buttons — hand-rolled only

```tsx
// Use framer-motion — import { motion } from "framer-motion"
<motion.button
  className="inline-flex justify-center items-center text-base/6 rounded-full py-[18px] px-10 duration-300 cursor-pointer hover:opacity-80 bg-darkAqua text-white"
  whileTap={{ scale: 0.97 }}
>
  {children}
</motion.button>

// White variant (on dark bg):
className="... bg-white !text-text"

// Outline variant:
className="... border border-darkAqua text-darkAqua bg-transparent"
```

---

## Tag / Badge Pattern (from ProjectCard)
```tsx
<div className="flex items-center justify-center rounded-[100px] py-1.5 px-4 gap-[10px] border-[0.5px] border-white bg-white/20 text-white font-medium text-[14px] shadow-tag backdrop-blur-[10px]">
  {label}
</div>
```
Use backdrop-blur for floating labels over images. shadow-tag defined in tailwind config.

## Progress Bar Pattern (from ProjectCard)
```tsx
<div className="bg-[#b2b7b81a] rounded-[100px] overflow-hidden h-[12px]">
  <div className="h-[12px] bg-darkAqua rounded-[100px]" style={{ width: `${pct}%` }} />
</div>
```

## Card Pattern (from ProjectCard)
```tsx
<Link className="relative group block bg-box p-1 rounded-3xl border-[1.5px] border-darkBlack/10 h-full cursor-pointer overflow-hidden hover:shadow-tooltip transition-shadow duration-300">
  {/* Glass tag top-left */}
  <div className="absolute left-4 top-4 z-[1] flex items-center justify-center rounded-[100px] py-2 px-3.5 border-[0.5px] border-white bg-white/20 text-white text-[14px] font-medium shadow-tag backdrop-blur-[10px]">
    Gold
  </div>
  {/* Media area */}
  <div className="rounded-[20px] h-[300px] md:h-[393px] overflow-hidden">
    <Image src={...} className="w-full h-full object-cover group-hover:scale-105 duration-500" />
  </div>
  {/* Card body */}
  <div className="flex justify-between flex-col pt-4 p-3">
    <h3 className="text-[18px]/[21px] font-medium">{title}</h3>
    {/* Funding round pill */}
    <span className="rounded-[100px] py-1 px-3 border border-darkAqua/30 bg-darkAqua/10 text-darkAqua text-[14px] font-medium capitalize">
      Seed Round
    </span>
    {/* Progress bar */}
    <div className="bg-[#b2b7b81a] rounded-[100px] overflow-hidden h-[12px]">
      <div className="h-[12px] bg-darkAqua rounded-[100px]" style={{ width: `${progress}%` }} />
    </div>
    {/* Stats row */}
    <div className="flex items-center justify-between mt-2.5 text-[16px] font-medium">
      <span>Raised <strong>{formatCurrency(raised)}</strong></span>
      <span>Target <strong>{formatCurrency(target)}</strong></span>
    </div>
  </div>
</Link>
```
Cards scale image on hover with `group-hover:scale-105 duration-500`.

---

## Navigation Pattern (from Header.tsx)
- Transparent on top, gains `shadow-nav` on scroll (isScrolled state)
- shadow-nav: 0px 0px 16px 0px rgba(255,255,255,0.06) inset
- backdrop-blur on scroll
- Logo: 4-pointed star SVG + "Cireta" in Gilroy Bold
- Links: text-white on dark hero, text-text on light pages
- Mobile: hamburger → full-screen aside panel (AsideBar pattern)

```tsx
// Transparent on top, blurred dark on scroll
const [isScrolled, setIsScrolled] = useState(false)
// nav className:
isScrolled
  ? "fixed top-0 w-full z-50 bg-darkBlack/80 backdrop-blur-md shadow-nav border-b border-white/5"
  : "fixed top-0 w-full z-50 bg-transparent"
```

---

## Hero (dark full-bleed)
```tsx
<section className="bg-darkBlack w-full min-h-screen relative overflow-hidden">
  {/* Gradient overlay matching bg-gradientBanner */}
  <div className="absolute inset-0 bg-gradient-to-b from-darkBlack via-darkBlack/90 to-darkAqua/30" />
  <div className="relative z-10 flex items-center justify-center flex-col h-full mx-auto max-w-[990px] px-4 text-center text-white pt-32 pb-20">
    {/* Cireta star */}
    <svg width="60" height="60" viewBox="0 0 40 40" className="mb-8">
      <path d="M20 2 L22.5 17.5 L38 20 L22.5 22.5 L20 38 L17.5 22.5 L2 20 L17.5 17.5 Z" fill="#13636F"/>
    </svg>
    <h1 className="text-2xl/[60px] font-semibold -tracking-[1.8px] mb-9">
      Unlock Global Commodity Investment Through RWA Tokenization
    </h1>
    <p className="text-base font-semibold text-white/75 mb-[60px]">
      Fully regulated ERC-3643 security tokens on Base L2.
    </p>
    <div className="flex items-center gap-6">
      <Button className="bg-white !text-text">Explore Projects</Button>
      <Button className="gap-2.5 !pl-3 bg-darkAqua text-white">
        <PlayIcon /> Watch Demo
      </Button>
    </div>
  </div>
  {/* Decorative blur orbs */}
  <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-darkAqua/20 rounded-full blur-[120px] pointer-events-none" />
</section>
```

---

## Stats bar (HomepageStats pattern)
```tsx
<section className="bg-darkAqua py-12">
  <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-inner mx-auto px-4">
    {[{val:"$2.4B", label:"Assets Tokenized"}, ...].map(s => (
      <div className="text-center text-white">
        <div className="text-1xl font-bold -tracking-[1.44px]">{s.val}</div>
        <div className="text-sm text-white/70 mt-1">{s.label}</div>
      </div>
    ))}
  </div>
</section>
```

---

## Section Layout
- Max content width: max-w-inner (1624px) centered
- Section padding: py-10 to py-20 depending on density
- Grid: grid-cols-2 or grid-cols-3 with gap-16 or gap-8
- Container: use Container component with max-w-inner class

---

## Animations (Framer Motion — mandatory, not optional)
Copy the motion patterns from cireta-repo:
- Cards: whileInView opacity 0→1, y 100→0, type: "spring", duration: 2
- Staggered: delay: (index + 1) * 0.25
- Buttons: already on motion.button
- Page transitions: initial opacity 0, animate opacity 1
- viewport: {{ once: true }} on all scroll animations

```tsx
import { motion } from "framer-motion"

// Card entrance
<motion.div
  initial={{ opacity: 0, y: 40 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ type: "spring", duration: 0.8, delay: index * 0.1 }}
>
```

---

## Dashboard / Portal Specific Rules
The launchpad and admin are app-like (not marketing). Apply this adapted style:

**Sidebar nav:**
- Width: 240px, bg-darkBlack, text-white
- Active item: bg-darkAqua/20 text-darkAqua rounded-xl
- Icons: Lucide React ONLY (not heroicons, not fontawesome)
- No generic sidebar templates — custom built

**Data cards:**
- bg-box rounded-3xl p-6 border border-darkBlack/10
- Metric value: text-2xl font-bold text-darkBlack tracking-tight
- Label: text-xs text-text/60 uppercase tracking-wide
- Trend indicator: green (#16a34a) up / red (#dc2626) down

**Tables:**
- thead: bg-darkAqua text-white text-sm font-semibold
- tbody rows: hover:bg-box transition-colors
- Striped: even rows bg-box/50
- Status pills: use rounded-full px-3 py-1 text-xs font-semibold
  - active: bg-darkAqua/10 text-darkAqua
  - pending: bg-gold/10 text-gold
  - failed/rejected: bg-red-100 text-red-700

**Forms:**
- Input: bg-box border border-darkBlack/10 rounded-xl px-4 py-3 focus:border-darkAqua focus:ring-1 focus:ring-darkAqua outline-none
- Label: text-sm font-semibold text-text mb-1.5
- Error: text-red-600 text-xs mt-1
- No floating labels — labels above inputs always

**Empty states:**
- Centered layout, custom SVG illustration (simple geometric, on-brand)
- Heading + subtext + CTA button
- NOT generic grey box with "No data found"

---

## Icons
Use Lucide React ONLY. Never:
- heroicons
- fontawesome
- react-icons random packs
- emoji as icons
- Generic stock icon sets

Common icons: TrendingUp, Shield, Coins, Wallet, Users, ArrowRight, ChevronDown, CheckCircle2, XCircle, Clock, Lock, Globe, FileText, BarChart3, RefreshCw

---

## Key Screen References
Study these before building each page:
- Home/hero: ~/projects/cireta-repo/src/app/components/homepage/Banner.tsx
- Project card: ~/projects/cireta-repo/src/app/components/card/ProjectCard.tsx
- Asset card: ~/projects/cireta-repo/src/app/components/card/AssetsCard.tsx
- Featured section: ~/projects/cireta-repo/src/app/components/homepage/FeaturedProjects.tsx
- Header: ~/projects/cireta-repo/src/app/components/Header.tsx
- Button: ~/projects/cireta-repo/src/app/components/Button.tsx
- Tailwind config: ~/projects/cireta-repo/tailwind.config.ts

---

## What "Gorgeous" Means Here
1. Every card has real hover states (scale, shadow change, border glow)
2. Progress bars are always teal (#13636F), pill-shaped, with light track
3. Status badges use backdrop-blur on media, solid pill on lists
4. Numbers/metrics are large, bold, darkBlack or darkAqua colored
5. Sections alternate: dark hero → light content → dark feature → light content
6. Framer-motion entrance animations on every card grid (staggered)
7. No grey placeholder boxes. No lorem ipsum in UI code.
8. Images always have object-cover + aspect ratio locked containers
9. Mobile-first — every component must look perfect at 375px AND 1440px
10. Letter spacing -0.03em EVERYWHERE — it defines the brand feel

---

## NO-GO list (never do these)
- NO rounded-md or rounded-lg on cards — use rounded-3xl
- NO gray borders — use border-darkBlack/10 or border-darkAqua/30
- NO generic gradient placeholders for images — use real asset images or darkAqua bg with Cireta logo
- NO Tailwind blue/green/red status pills — use darkAqua/10 with darkAqua text
- NO shadcn/ui components — build from primitives matching Cireta patterns
- NO generic lucide/heroicons — use inline SVGs matching Cireta's icon style
- NO white backgrounds on dark-theme pages — darkBlack or box only
- No Material UI / Ant Design / shadcn default themes
- No Bootstrap grid
- No generic CSS resets beyond Tailwind
- No SVG icon libraries except Lucide
- No inline styles except for dynamic values (progress width, chart bars)
- No fixed pixel font sizes not in the tailwind fontSize scale

---

## Required Pages

launchpad:
  / — Hero (dark, full-bleed) + stats bar + featured project slider (Swiper) + how it works + CTA
  /explore — Project grid (ProjectCard exact pattern) + filter bar by asset type / status
  /project/[slug] — Full detail: hero image, tabs (Overview/Docs/Team), phase timeline, invest sidebar
  /invest/[slug] — Amount input + USDC approval step + confirm tx + success state
  /login — Dark split-screen: Cireta brand left, form right
  /register — Same split pattern
  /verify — KYC stepper: ID → liveness → review (Sumsub embed)
  /portfolio — Holdings grid + vesting progress bars + claimable amounts
  /portfolio/claim/[token] — Cliff countdown + claim button + history
  /portfolio/redeem/[token] — Redemption form (physical/cash) + status tracker
  /account — KYC badge + linked wallets + notification prefs + CSV export

admin:
  /issuer/overview — Stats dashboard: TVL, raised, investors, fees earned
  /issuer/tokens/new — 4-step wizard with progress indicator
  /issuer/tokens/[id] — Token metrics + compliance status
  /issuer/sales/[id] — Phase config + live fundraise progress
  /issuer/investors — Table: wallet, KYC status, invested, tokens allocated + OTC button
  /issuer/compliance — Freeze/unfreeze/recover/forced-transfer actions + audit log
  /issuer/withdrawals — Available to withdraw + withdrawal history
  /platform/issuers — Issuer table + approve/revoke/fee actions
  /platform/compliance — Global compliance controls
  /platform/analytics — TVL chart, fee revenue, KYC funnel

---

## Component Architecture (atomic design)
atoms/: Button (motion), Input, Badge, Avatar, Spinner, ProgressBar, Tag
molecules/: ProjectCard, PhaseCard, StatCard, WalletBadge, KYCBadge, TxRow
organisms/: Navbar, Footer, ProjectGrid, PortfolioTable, CompliancePanel, VestingCard, InvestSidebar
templates/: PageLayout, DashboardLayout, SplitAuthLayout
