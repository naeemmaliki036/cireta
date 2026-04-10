"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { Navbar, Footer } from "@/components/organisms";
import { getProjects, type Project } from "@/lib/api/repositories/projects.repository";
import {
  getPlatformStats,
  getPartners,
  getTeamMembers,
  type PlatformStat,
  type Partner,
  type TeamMember,
} from "@/lib/api/repositories/platform.repository";

/* ─── Project card helpers (UNCHANGED) ─── */

function ProjectCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 flex flex-col h-full animate-pulse">
      <div className="h-48 bg-gray-200 flex-shrink-0" />
      <div className="p-4 flex flex-col flex-1 space-y-3">
        <div className="h-3 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
        <div className="mt-auto space-y-3">
          <div>
            <div className="flex justify-between mb-1">
              <div className="h-3 bg-gray-200 rounded w-24" />
              <div className="h-3 bg-gray-200 rounded w-10" />
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <div className="h-2 bg-gray-200 rounded w-12 mb-1" />
              <div className="h-4 bg-gray-200 rounded w-20" />
            </div>
            <div className="h-8 bg-gray-200 rounded-full w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".ogg"];
function isVideoUrl(url: string): boolean {
  try { return VIDEO_EXTENSIONS.some((ext) => new URL(url).pathname.toLowerCase().endsWith(ext)); }
  catch { return false; }
}

function LiveProjectCard({ project: p }: { project: Project }) {
  const [imgError, setImgError] = useState(false);
  const progress = p.targetAmount > 0 ? Math.min(Math.round((p.currentRaised / p.targetAmount) * 100), 100) : 0;
  const hasImage = p.imageUrl && !imgError;
  const isVideo = p.imageUrl && isVideoUrl(p.imageUrl);

  const at = p.assetType.toLowerCase();
  const gradient = at.includes("gold")
    ? "from-[#C9913D] via-[#A87B2F] to-[#8B6914]"
    : at.includes("copper")
    ? "from-[#B87333] via-[#9A5E27] to-[#7D4E1F]"
    : "from-[#13636F] via-[#0f5460] to-[#0a3d45]";

  return (
    <Link href={`/project/${p.slug}`} className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-card transition-shadow flex flex-col h-full cursor-pointer">
      <div className="relative h-48 overflow-hidden flex-shrink-0">
        {hasImage && isVideo ? (
          <video src={p.imageUrl} muted autoPlay loop playsInline className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : hasImage ? (
          <Image src={p.imageUrl} alt={p.title} fill className="object-cover" onError={() => setImgError(true)} />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient}`}>
            <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
          </div>
        )}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
          {(() => {
            const now = Date.now();
            const ap = p.phases.find((ph) => {
              const s = new Date(ph.start_time || 0).getTime();
              const e = new Date(ph.end_time || 0).getTime();
              return now >= s && now < e;
            });
            return ap ? (
              <>
                <span className="inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-darkAqua animate-pulse" />
                  on going
                </span>
                <span className="inline-flex items-center bg-darkAqua/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-[10px] font-semibold text-white">
                  {ap.name}
                </span>
              </>
            ) : p.isComingSoon ? (
              <span className="inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-black/30" />
                coming soon
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium text-black/50">
                <span className="w-1.5 h-1.5 rounded-full bg-black/30" />
                {p.phases.every((ph) => now >= new Date(ph.end_time || 0).getTime()) ? "completed" : "upcoming"}
              </span>
            );
          })()}
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          <h3 className="text-white font-semibold text-sm flex items-center gap-1">
            {p.title} <CheckCircle2 className="h-3.5 w-3.5 text-white/70" />
          </h3>
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <p className="text-xs text-gray-500 line-clamp-2 mb-2">{p.description || "Invest in tokenized real-world assets."}</p>
        {p.phases.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {p.phases.map((ph) => {
              const now = Date.now();
              const s = new Date(ph.start_time || 0).getTime();
              const e = new Date(ph.end_time || 0).getTime();
              const st = now < s ? "upcoming" : now >= e ? "ended" : "active";
              return (
                <span key={ph.id || ph.name} className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                  st === "active" ? "bg-darkAqua/10 text-darkAqua" :
                  st === "ended" ? "bg-black/5 text-black/30 line-through" :
                  "bg-box text-black/40"
                }`}>
                  {ph.name}
                </span>
              );
            })}
          </div>
        )}
        <div className="mt-auto space-y-3">
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Funding progress</span>
              <span>{p.isComingSoon ? "TBD" : `${progress}%`}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-darkAqua rounded-full transition-all" style={{ width: `${p.isComingSoon ? 0 : progress}%` }} />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-[10px] text-gray-400 uppercase">Target</p>
              <p className="text-sm font-bold">{p.isComingSoon ? "TBD" : `${(p.targetAmount / 1_000_000).toFixed(1)}M USDC`}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 btn-cta text-xs px-4 py-2 rounded-full transition-colors">
              View Details <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ─── FAQ data ─── */

const FAQS = [
  {
    q: "What is Cireta?",
    a: "Cireta is a regulated real-world asset (RWA) tokenization launchpad built on Base L2. We enable investors to participate in tokenized gold, copper, and commodity futures through compliant ERC-3643 security tokens with full KYC/AML verification.",
  },
  {
    q: "How are investments structured?",
    a: "Each investment opportunity is structured through a dedicated Special Purpose Vehicle (SPV). The SPV holds the underlying commodity assets, and tokenized shares of the SPV are issued on-chain as ERC-3643 compliant security tokens, giving investors fractional ownership.",
  },
  {
    q: "What commodities can I invest in?",
    a: "Currently, Cireta offers tokenized gold and copper investments sourced from production-stage mines. We are expanding into additional commodity futures and precious metals as regulatory approvals are obtained.",
  },
  {
    q: "Is KYC required?",
    a: "Yes. All investors must complete identity verification (KYC) through our Sumsub-powered verification flow before they can participate in any token sale. This ensures full regulatory compliance and protects all participants on the platform.",
  },
  {
    q: "How do I receive returns?",
    a: "Returns are distributed based on the terms of each specific project. This may include periodic yield distributions in USDC, token appreciation tied to commodity price movements, or physical delivery options depending on the project structure.",
  },
  {
    q: "What blockchain does Cireta use?",
    a: "Cireta is built on Base, a secure and low-cost Layer 2 blockchain built on Ethereum. All token contracts follow the ERC-3643 standard for compliant security tokens, with on-chain identity verification via ONCHAINID.",
  },
  {
    q: "Is there insurance on investments?",
    a: "Yes. All commodity assets backing Cireta tokens carry comprehensive insurance coverage including transit, storage, and market risk protection. Insurance details are disclosed in each project's documentation before investment.",
  },
];

/* ─── How It Works steps ─── */

const STEPS = [
  { num: 0, title: "Browse", desc: "Explore live tokenized commodity projects, each backed by verified physical assets and structured through regulated SPVs." },
  { num: 1, title: "Connect", desc: "Connect your Web3 wallet (MetaMask, Coinbase Wallet, or WalletConnect) to the Base L2 network in one click." },
  { num: 2, title: "Verify", desc: "Complete a quick KYC identity check powered by Sumsub. Most verifications are approved in under 5 minutes." },
  { num: 3, title: "Invest", desc: "Choose your investment amount, approve USDC, and receive ERC-3643 security tokens directly to your wallet." },
];

/* ─── Why Cireta cards ─── */

const WHY_CARDS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-white">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "Comprehensive Insurance",
    desc: "Every commodity asset on Cireta carries full insurance coverage including transit, storage, and market risk protection, ensuring your investment is safeguarded at every stage.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-white">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    title: "Production-Stage Assets",
    desc: "We only list commodities from active, production-stage operations, not speculative exploration. This means real output, real revenue, and lower risk for investors.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-white">
        <rect x="1" y="3" width="15" height="13" rx="2" />
        <path d="M16 8h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4" />
      </svg>
    ),
    title: "Physical Delivery Option",
    desc: "Token holders have the option to redeem their tokens for physical delivery of the underlying commodity, providing a tangible connection to your digital investment.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-white">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    title: "SPV Legal Structure",
    desc: "Each project is isolated in its own Special Purpose Vehicle, providing legal separation of assets. Your investment is ring-fenced and protected from platform-level risks.",
  },
];

/* ─── Press articles ─── */

const PRESS = [
  {
    source: "Coinfomania",
    badge: "Featured",
    date: "March 2026",
    color: "bg-[#1a1a2e]",
    title: "Cireta Launches Tokenized Gold Platform on Base L2",
    excerpt: "Cireta, a new RWA tokenization launchpad, has launched on Coinbase's Base L2, offering investors access to tokenized gold and copper futures through compliant ERC-3643 security tokens.",
    url: "https://coinfomania.com",
  },
  {
    source: "MPOST",
    badge: "Press",
    date: "February 2026",
    color: "bg-[#0d1117]",
    title: "How Cireta is Bridging Physical Commodities and DeFi",
    excerpt: "In an exclusive interview, the Cireta team discusses how their SPV-backed tokenization model brings institutional-grade commodity investments to retail investors through blockchain technology.",
    url: "https://mpost.io",
  },
];

/* ─── Main page component ─── */

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [stats, setStats] = useState<PlatformStat[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getProjects({ size: 4 });
        const sorted = [...data.items].sort((a, b) => (a.isComingSoon ? 1 : 0) - (b.isComingSoon ? 1 : 0));
        setProjects(sorted);
      } catch { /* empty */ }
      finally { setLoadingProjects(false); }
    })();

    getPlatformStats().then(setStats).catch(() => {});
    getPartners().then(setPartners).catch(() => {});
    getTeamMembers().then(setTeam).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar variant="dark" />

      {/* ── 1. Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-black">
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src="/images/hero-bg.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/45 to-black/75" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative z-10 text-center px-4 max-w-4xl mx-auto"
        >
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-6 leading-tight">
            Invest in Real World Assets<br className="hidden md:block" /> Through Tokenization
          </h1>
          <p className="text-lg md:text-xl text-white/70 mb-10 max-w-2xl mx-auto leading-relaxed">
            Access tokenized gold, copper, and infrastructure projects backed by verified physical reserves, institutional insurance, and blockchain-grade transparency.
          </p>
          <div className="flex items-center justify-center">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 bg-white text-black font-semibold px-8 py-3.5 rounded-full hover:bg-white/90 transition-colors text-sm"
            >
              Explore Live Projects <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>

        {/* Partner logo carousel — overlays bottom of hero */}
        {partners.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 z-10 overflow-hidden py-5 bg-gradient-to-t from-black/60 via-black/30 to-transparent backdrop-blur-[2px]">
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-black/40 to-transparent z-10 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-black/40 to-transparent z-10 pointer-events-none" />
              <div className="marquee-track">
                {[...partners, ...partners].map((p, i) => (
                  <div key={`${p.id}-${i}`} className="shrink-0 flex items-center justify-center mx-10" style={{ minWidth: "140px" }}>
                    {p.logo_url ? (
                      <img
                        src={p.logo_url}
                        alt={p.name}
                        className="h-10 md:h-12 w-auto max-w-[160px] object-contain brightness-0 invert opacity-50 hover:opacity-80 transition-opacity"
                      />
                    ) : (
                      <span className="text-white/40 text-base font-semibold tracking-wide whitespace-nowrap">
                        {p.name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 2. Trust Bar ── */}
      {stats.length > 0 && (
        <section className="py-16 px-4 bg-white">
          <div className="max-w-inner mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-y-8">
              {stats.sort((a, b) => a.sort_order - b.sort_order).map((s, i) => (
                <div key={s.key} className="flex items-center">
                  {i > 0 && <div className="hidden md:block w-px h-12 bg-black/10 mx-8" />}
                  <div className="text-center px-4">
                    <p className="text-3xl md:text-4xl font-bold text-darkAqua">{s.value}</p>
                    <p className="text-sm text-black/50 mt-1">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-black/30 mt-8">Figures verified as of Q1 2026</p>
          </div>
        </section>
      )}

      {/* ── 3. Intro Definition ── */}
      <section className="py-16 px-4 bg-box">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-lg md:text-xl text-black/70 leading-relaxed">
            Cireta is a real-world asset tokenization platform that connects verified investors to production-stage gold and copper projects. Every investment is backed by independently certified reserves, 105% credit risk insurance, and physical delivery rights. The platform operates through segregated SPV structures with full KYC/KYB compliance.
          </p>
        </div>
      </section>

      {/* ── 4. Projects (EXISTING CODE) ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-inner mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-darkAqua uppercase tracking-wider mb-2">Live Investment Opportunities</p>
            <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Projects</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Real-time investment opportunities in tokenized commodities — fully regulated, transparent, and backed by verified issuers.
            </p>
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 btn-cta px-6 py-2.5 rounded-full mt-6 text-sm transition-colors"
            >
              Explore All Projects <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {loadingProjects ? (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          ) : projects.length > 0 ? (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {projects.slice(0, 4).map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <LiveProjectCard project={p} />
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-400 py-12">No projects available yet. Check back soon.</p>
          )}

          <p className="text-center text-xs text-black/30 mt-10 max-w-2xl mx-auto">
            Investment in tokenized assets involves risk. Past performance is not indicative of future results.
            Please read each project&apos;s documentation carefully before investing.
          </p>
        </div>
      </section>

      {/* ── 5. Why Cireta ── */}
      <section className="py-20 px-4 bg-box">
        <div className="max-w-inner mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-darkAqua uppercase tracking-wider mb-2">Investor Protection</p>
            <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Why Investors Choose Cireta</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Every layer of the Cireta platform is built to protect investors and ensure transparent, compliant access to real-world commodity assets.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {WHY_CARDS.map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-box rounded-2xl p-8"
              >
                <div className="w-12 h-12 rounded-xl bg-darkAqua flex items-center justify-center mb-6">
                  {card.icon}
                </div>
                <h3 className="text-lg font-bold text-text mb-3">{card.title}</h3>
                <p className="text-sm text-black/50 leading-relaxed">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. Track Record ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-inner mx-auto text-center">
          <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Proven Commodity Delivery Track Record</h2>
          <p className="text-black/50 max-w-2xl mx-auto mb-14">
            Backed by A&M Development Group&apos;s extensive experience in physical commodity sourcing, logistics, and delivery across global markets.
          </p>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { value: "14", unit: "months", label: "Average delivery timeline from mine to market" },
              { value: "3", unit: "months", label: "Fastest commodity delivery cycle achieved" },
              { value: "3", unit: "countries", label: "Active sourcing operations across continents" },
              { value: "99.99%", unit: "", label: "Purity verification rate on delivered gold" },
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-box rounded-2xl p-8 border border-black/5"
              >
                <p className="text-4xl font-bold text-darkAqua">
                  {s.value}
                  {s.unit && <span className="text-lg font-medium text-black/40 ml-1">{s.unit}</span>}
                </p>
                <p className="text-sm text-black/50 mt-2">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. How It Works ── */}
      <section className="py-20 px-4 bg-box" id="how-it-works">
        <div className="max-w-inner mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-darkAqua uppercase tracking-wider mb-2">Getting Started</p>
            <h2 className="text-4xl font-bold text-text tracking-tight mb-4">How Tokenized Commodity Investment Works</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              From browsing tokenized gold and copper projects to making your first blockchain-settled investment, the process is straightforward. No prior crypto experience required.
            </p>
          </div>

          {/* Desktop horizontal timeline */}
          <div className="hidden md:block relative mb-12">
            <div className="absolute top-6 left-[12.5%] right-[12.5%] h-0.5 bg-black/10" />
            <div className="grid grid-cols-4 gap-6">
              {STEPS.map((s, i) => (
                <motion.div
                  key={s.num}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="w-12 h-12 rounded-full bg-darkAqua text-white flex items-center justify-center font-bold text-lg mb-6 relative z-10">
                    {s.num}
                  </div>
                  <h3 className="text-lg font-bold text-text mb-2">{s.title}</h3>
                  <p className="text-sm text-black/50 leading-relaxed">{s.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Mobile vertical list */}
          <div className="md:hidden space-y-8 mb-12">
            {STEPS.map((s) => (
              <div key={s.num} className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-darkAqua text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {s.num}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text mb-1">{s.title}</h3>
                  <p className="text-sm text-black/50 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-box rounded-2xl p-6 text-center max-w-2xl mx-auto">
            <p className="text-sm text-black/60">
              <span className="font-semibold text-text">After investment:</span> Track your portfolio in real-time, receive yield distributions in USDC, and optionally redeem tokens for physical commodity delivery.
            </p>
          </div>
        </div>
      </section>

      {/* ── 8. Leadership ── */}
      {team.length > 0 && (
        <section className="py-20 px-4 bg-white">
          <div className="max-w-inner mx-auto">
            <div className="text-center mb-14">
              <p className="text-sm font-semibold text-darkAqua uppercase tracking-wider mb-2">Who Is Behind Cireta</p>
              <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Leadership &amp; Governance</h2>
              <p className="text-gray-500 max-w-2xl mx-auto">
                Cireta operates under A&amp;M Development Group, an organization with over 189 years of combined legacy across mining, infrastructure, and commodity trade.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
              {team.sort((a, b) => a.sort_order - b.sort_order).map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="bg-box rounded-2xl p-7"
                >
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full overflow-hidden bg-darkAqua flex items-center justify-center shrink-0">
                        {m.photo_url ? (
                          <Image src={m.photo_url} alt={m.name} width={64} height={64} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl font-bold text-white">
                            {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </span>
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-text">{m.name}</h3>
                        <p className="text-sm text-darkAqua font-semibold">{m.title}</p>
                      </div>
                    </div>
                    {m.linkedin_url && (
                      <Link
                        href={m.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 flex items-center justify-center text-darkAqua border border-darkAqua/30 rounded-md hover:bg-darkAqua hover:text-white transition-colors shrink-0"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 21 21" fill="currentColor">
                          <path fillRule="evenodd" clipRule="evenodd" d="M2.2614 0.28125C1.47738 0.28125 0.841797 0.91683 0.841797 1.70086V18.8616C0.841797 19.6457 1.47738 20.2812 2.2614 20.2812H19.4222C20.2062 20.2812 20.8418 19.6457 20.8418 18.8616V1.70086C20.8418 0.916831 20.2062 0.28125 19.4222 0.28125H2.2614ZM5.33088 6.49228C6.28909 6.49228 7.06587 5.71549 7.06587 4.75728C7.06587 3.79906 6.28909 3.02227 5.33088 3.02227C4.37267 3.02227 3.59588 3.79906 3.59588 4.75728C3.59588 5.71549 4.37267 6.49228 5.33088 6.49228ZM8.65484 7.77449H11.5303V9.09175C11.5303 9.09175 12.3106 7.53116 14.4336 7.53116C16.3275 7.53116 17.8964 8.46413 17.8964 11.3079V17.3045H14.9166V12.0345C14.9166 10.357 14.021 10.1725 13.3385 10.1725C11.9222 10.1725 11.6797 11.3941 11.6797 12.2533V17.3045H8.65484V7.77449ZM6.84332 7.7745H3.81844V17.3046H6.84332V7.7745Z" />
                        </svg>
                      </Link>
                    )}
                  </div>
                  {m.bio && <p className="text-sm text-black/50 leading-relaxed">{m.bio}</p>}
                </motion.div>
              ))}
            </div>

            <div className="text-center mt-10">
              <Link href="https://cireta.com/team" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-darkAqua hover:underline">
                Meet the full team →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── 9. Press & Media ── */}
      <section className="py-20 px-4 bg-box">
        <div className="max-w-inner mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-darkAqua uppercase tracking-wider mb-2">In The News</p>
            <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Press & Media</h2>
          </div>

          <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
            {PRESS.map((article, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-card transition-shadow"
              >
                <div className={`${article.color} px-6 py-4`}>
                  <p className="text-white font-bold text-lg">{article.source}</p>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-semibold text-darkAqua bg-box px-2.5 py-1 rounded-full">{article.badge}</span>
                    <span className="text-xs text-black/40">{article.date}</span>
                  </div>
                  <h3 className="text-lg font-bold text-text mb-2">{article.title}</h3>
                  <p className="text-sm text-black/50 leading-relaxed mb-4">{article.excerpt}</p>
                  <Link href={article.url} target="_blank" className="text-sm font-semibold text-darkAqua hover:underline inline-flex items-center gap-1">
                    Read more <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 10. Partners ── */}
      {partners.length > 0 && (
        <section className="py-20 px-4 bg-white">
          <div className="max-w-inner mx-auto">
            <div className="text-center mb-14">
              <p className="text-sm font-semibold text-darkAqua uppercase tracking-wider mb-2">Trusted By</p>
              <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Institutional &amp; Strategic Partners</h2>
            </div>

            <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-10">
              {partners.sort((a, b) => a.sort_order - b.sort_order).map((p) => (
                <div key={p.id} className="flex items-center justify-center" style={{ minWidth: "140px" }}>
                  {p.logo_url ? (
                    <Image src={p.logo_url} alt={p.name} width={140} height={48} className="h-10 md:h-12 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity" />
                  ) : (
                    <span className="text-sm font-semibold text-black/40">{p.name}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 11. Risk Disclosure ── */}
      <section className="py-16 px-4 bg-box">
        <div className="max-w-3xl mx-auto">
          <div className="border border-black/10 rounded-2xl p-8 text-center">
            <p className="text-sm font-bold text-text mb-3">Risk Disclosure</p>
            <p className="text-xs text-black/50 leading-relaxed">
              Investing in tokenized real-world assets involves significant risk, including the potential loss of your
              entire investment. Commodity prices are volatile and influenced by factors beyond our control. Token
              values may fluctuate and are not guaranteed to maintain their initial value. Past performance is not
              indicative of future results. All investments on this platform are subject to the terms and conditions
              of their respective Special Purpose Vehicle (SPV) structures. Please read all project documentation,
              including risk factors, before making any investment decision. This platform does not provide financial
              advice. Consult a qualified financial advisor before investing.
            </p>
          </div>
        </div>
      </section>

      {/* ── 12. FAQ ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-darkAqua uppercase tracking-wider mb-2">Support</p>
            <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Tokenized Commodity Investment FAQ</h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border border-black/10 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-box/50 transition-colors"
                >
                  <span className="font-semibold text-text pr-4">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-black/40 shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4">
                    <p className="text-sm text-black/60 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 13. Final CTA ── */}
      <section className="relative py-24 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-black">
          <video autoPlay muted loop playsInline preload="none" className="absolute inset-0 w-full h-full object-cover opacity-40">
            <source src="/images/hero-bg.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/70" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
            Ready to Invest in Tokenized Assets?
          </h2>
          <p className="text-white/70 mb-10 max-w-xl mx-auto">
            Join a growing community of investors accessing institutional-grade commodity investments through compliant blockchain technology.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 bg-white text-black font-semibold px-8 py-3.5 rounded-full hover:bg-white/90 transition-colors text-sm"
            >
              Visit Launchpad <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="mailto:info@cireta.com"
              className="inline-flex items-center gap-2 border border-white/40 text-white font-semibold px-8 py-3.5 rounded-full hover:bg-white/10 transition-colors text-sm"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      {/* ── 14. Footer ── */}
      <Footer />
    </div>
  );
}
