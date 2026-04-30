"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Bell, CheckCircle2, ChevronDown, Gift, Shield, Repeat, X } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Navbar, Footer } from "@/components/organisms";
import { SaleStatusBadge } from "@/components/atoms/SaleStatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api/client";

/* ─── localStorage helpers for anonymous subscriptions ─── */
const SUB_KEY = "cireta_sale_subs";
function getLocalSubs(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SUB_KEY) || "{}"); } catch { return {}; }
}
function setLocalSub(saleId: string, email: string) {
  const subs = getLocalSubs();
  subs[saleId] = email;
  localStorage.setItem(SUB_KEY, JSON.stringify(subs));
}
function removeLocalSub(saleId: string) {
  const subs = getLocalSubs();
  delete subs[saleId];
  localStorage.setItem(SUB_KEY, JSON.stringify(subs));
}
import { getProjects, type Project } from "@/lib/api/repositories/projects.repository";
import { useOnChainSaleStats } from "@/lib/hooks/useOnChainSaleStats";
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
  const [subscribed, setSubscribed] = useState(false);
  const [justSubscribed, setJustSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [subEmail, setSubEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const { isAuthenticated } = useAuth();

  // Check subscription status on mount
  useEffect(() => {
    if (isAuthenticated) {
      apiFetch<{ subscribed: boolean }>(`/api/v1/sales/${p.id}/is-subscribed`, { skipAuthRedirect: true })
        .then((r) => setSubscribed(r.subscribed))
        .catch(() => {});
    } else {
      // Check localStorage for anonymous subscriptions
      const localSubs = getLocalSubs();
      if (localSubs[p.id]) setSubscribed(true);
    }
  }, [p.id, isAuthenticated]);

  const doSubscribe = useCallback(async (email?: string) => {
    setSubLoading(true);
    try {
      await apiFetch(`/api/v1/sales/${p.id}/subscribe`, {
        method: "POST",
        body: email ? { email } : {},
        skipAuthRedirect: true,
      });
      setSubscribed(true);
      setJustSubscribed(true);
      if (email) setLocalSub(p.id, email);
      setShowEmailInput(false);
    } catch {
      setSubscribed(true);
      setJustSubscribed(true);
      if (email) setLocalSub(p.id, email);
      setShowEmailInput(false);
    } finally {
      setSubLoading(false);
    }
  }, [p.id]);

  const doUnsubscribe = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSubLoading(true);
    try {
      if (isAuthenticated) {
        await apiFetch(`/api/v1/sales/${p.id}/unsubscribe`, { method: "DELETE" });
      }
      setSubscribed(false);
      removeLocalSub(p.id);
    } catch {
      // Ignore errors — just remove locally
      setSubscribed(false);
      removeLocalSub(p.id);
    } finally {
      setSubLoading(false);
    }
  }, [p.id, isAuthenticated]);

  const handleSubscribeClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (subLoading) return;
    if (isAuthenticated) {
      doSubscribe();
    } else {
      setShowEmailInput(true);
    }
  }, [isAuthenticated, subLoading, doSubscribe]);

  const handleEmailSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const email = subEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email");
      return;
    }
    setEmailError("");
    doSubscribe(email);
  }, [subEmail, doSubscribe]);
  // On-chain sale stats — overrides the DB-derived numbers when the sale
  // contract is deployed so the homepage card never shows stale totals.
  const onChain = useOnChainSaleStats(
    (p.contract_address ?? null) as `0x${string}` | null,
    0,
  );
  const effectiveRaised = onChain.ready ? onChain.totalRaised : p.currentRaised;
  const effectiveTarget = onChain.ready && onChain.hardCap > 0 ? onChain.hardCap : p.targetAmount;
  const progressRaw = effectiveTarget > 0
    ? (effectiveRaised / effectiveTarget) * 100
    : 0;
  // Only show 100% if raised truly equals/exceeds target — avoid float rounding to 100
  const progress = effectiveRaised >= effectiveTarget ? 100 : Math.min(parseFloat(progressRaw.toFixed(2)), 99.99);
  const hasImage = p.imageUrl && !imgError;
  const isVideo = p.imageUrl && isVideoUrl(p.imageUrl);

  const at = p.assetType.toLowerCase();
  const gradient = at.includes("gold")
    ? "from-[#C9913D] via-[#A87B2F] to-[#8B6914]"
    : at.includes("copper")
    ? "from-[#B87333] via-[#9A5E27] to-[#7D4E1F]"
    : "from-[#13636F] via-[#0f5460] to-[#0a3d45]";

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-card transition-shadow flex flex-col h-full">
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
          <SaleStatusBadge
            variant="card"
            status={p.status}
            phases={p.phases}
            isComingSoon={p.isComingSoon}
          />
          {(() => {
            // When a phase is currently selling, show its name as a
            // secondary chip alongside the unified status badge.
            const now = Date.now();
            const ap = p.phases.find((ph) => {
              const s = new Date(ph.start_time || 0).getTime();
              const e = new Date(ph.end_time || 0).getTime();
              return now >= s && now < e;
            });
            return ap ? (
              <span className="inline-flex items-center bg-darkAqua/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-[10px] font-semibold text-white">
                {ap.name}
              </span>
            ) : null;
          })()}
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          <h3 className="text-white font-semibold text-[16px] flex items-center gap-1">
            {p.title} <CheckCircle2 className="h-3.5 w-3.5 text-white/70" />
          </h3>
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <p className="text-[12px] text-gray-500 leading-relaxed line-clamp-2 min-h-[2lh] mb-2">{p.description || "Buy tokenized real-world assets."}</p>
        {p.phases.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {p.phases.map((ph) => {
              const now = Date.now();
              const s = new Date(ph.start_time || 0).getTime();
              const e = new Date(ph.end_time || 0).getTime();
              const st = now < s ? "upcoming" : now >= e ? "ended" : "active";
              return (
                <span key={ph.id || ph.name} className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded ${
                  st === "active" ? "bg-darkAqua/10 text-darkAqua" :
                  st === "ended" ? "bg-green-50 text-green-600" :
                  "bg-box text-black/40"
                }`}>
                  {st === "ended" && <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M4 6l1.5 1.5L8 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  {st === "active" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                  {ph.name}
                </span>
              );
            })}
          </div>
        )}
        <div className="mt-auto space-y-3">
          {(() => {
            const now = Date.now();
            const isOngoing = p.phases.some((ph) => {
              const s = new Date(ph.start_time || 0).getTime();
              const e = new Date(ph.end_time || 0).getTime();
              return now >= s && now < e;
            });
            const showProgress = isOngoing && effectiveRaised > 0;
            if (showProgress) return (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Funding progress</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-darkAqua rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            );
            if (subscribed) {
              if (justSubscribed) return (
                <div className="flex items-center justify-between w-full rounded-lg px-3 py-2.5 bg-green-50 border border-green-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <span className="text-[11px] text-green-600 font-medium">Subscribed — We&apos;ll notify you</span>
                  </div>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setJustSubscribed(false); }} className="text-black/30 hover:text-black/50 transition-colors p-0.5" title="Dismiss">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
              return (
                <div className="flex items-center justify-between w-full rounded-lg px-3 py-2.5 bg-box">
                  <div className="flex items-center gap-2">
                    <Bell className="h-3.5 w-3.5 text-darkAqua shrink-0" />
                    <span className="text-[11px] text-black/50">Subscribed for updates</span>
                  </div>
                  <button onClick={doUnsubscribe} disabled={subLoading} className="text-[10px] text-black/30 hover:text-red-400 transition-colors" title="Unsubscribe">
                    Unsubscribe
                  </button>
                </div>
              );
            }
            if (showEmailInput) return (
              <div onClick={(e) => e.stopPropagation()}>
                <form onSubmit={handleEmailSubmit} className="flex items-center gap-1.5 w-full rounded-lg bg-box p-1.5">
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={subEmail}
                    onChange={(e) => { setSubEmail(e.target.value); setEmailError(""); }}
                    autoFocus
                    className={`flex-1 min-w-0 bg-white rounded-md px-2.5 py-1.5 text-[11px] border outline-none focus:border-darkAqua ${emailError ? "border-red-300" : "border-black/10"}`}
                  />
                  <button
                    type="submit"
                    disabled={subLoading}
                    className="shrink-0 bg-darkAqua text-white text-[11px] font-medium px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {subLoading ? (
                      <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>
                    ) : "Subscribe"}
                  </button>
                  <button type="button" onClick={() => { setShowEmailInput(false); setEmailError(""); }} className="shrink-0 text-black/30 hover:text-black/60 p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </form>
                {emailError && <p className="text-[10px] text-red-400 mt-1 px-1.5">{emailError}</p>}
              </div>
            );
            return (
              <button
                onClick={handleSubscribeClick}
                disabled={subLoading}
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2.5 bg-box hover:bg-darkAqua/5 transition-colors"
              >
                {subLoading ? (
                  <svg className="animate-spin h-3.5 w-3.5 text-darkAqua shrink-0" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>
                ) : (
                  <Bell className="h-3.5 w-3.5 text-darkAqua shrink-0" />
                )}
                <span className="text-[11px] text-black/50">{p.isComingSoon ? "Subscribe for launch updates" : "Get notified when funding opens"}</span>
              </button>
            );
          })()}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[10px] text-gray-400 uppercase">Target</p>
                <p className="text-[12px] font-bold">{p.isComingSoon ? "TBD" : effectiveTarget >= 1_000_000 ? `${parseFloat((effectiveTarget / 1_000_000).toFixed(2))}M USDC` : effectiveTarget >= 1_000 ? `${parseFloat((effectiveTarget / 1_000).toFixed(1))}K USDC` : `${effectiveTarget.toLocaleString()} USDC`}</p>
              </div>
              {!p.isComingSoon && effectiveRaised > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase">Raised</p>
                  <p className="text-[12px] font-bold text-darkAqua">{effectiveRaised >= 1_000_000 ? `${parseFloat((effectiveRaised / 1_000_000).toFixed(2))}M USDC` : effectiveRaised >= 10_000 ? `${parseFloat((effectiveRaised / 1_000).toFixed(1))}K USDC` : `${effectiveRaised.toLocaleString()} USDC`}</p>
                </div>
              )}
            </div>
            <Link href={`/project/${p.slug}`} className="inline-flex items-center gap-1.5 btn-cta text-xs px-4 py-2 rounded-full transition-colors">
              View Details <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── FAQ data ─── */

const FAQS = [
  {
    q: "What is Cireta?",
    a: "Cireta is a tokenized commodity purchase platform. It connects verified buyers to production-stage gold, copper, and mineral projects through blockchain-based tokens with physical delivery rights and credit risk insurance. The platform is operated by A&M Cireta Holdings LTD.",
  },
  {
    q: "What is the minimum purchase?",
    a: "Minimum purchase varies by project, funding round, and token structure. Seed rounds for institutional allocations carry higher thresholds, while fractional token structures allow smaller positions on select projects. Check individual project pages for current round availability, entry requirements, and token denomination details.",
  },
  {
    q: "How is my purchase protected?",
    a: "Every project includes 105% credit risk insurance backed by reinsurers including Swiss Re, Munich Re, and Lloyd\u2019s. Projects are structured through segregated SPVs with independent trust accounts, isolating each purchase from platform-level risk.",
  },
  {
    q: "Can I take physical delivery of my commodities?",
    a: "Yes. After a 12-month vesting period, gold buyers can take physical delivery. Copper tokens include FOB delivery terms for international shipping. You can also choose to settle in USDC or continue holding your token position.",
  },
  {
    q: "Is Cireta regulated?",
    a: "Cireta operates through A&M Cireta Holdings LTD, registered with RAKICC in the UAE. Each project is structured as a licensed SPV with full KYC/KYB compliance, blockchain-based settlement, and independent trust accounts.",
  },
  {
    q: "What blockchain does Cireta use?",
    a: "Cireta uses blockchain technology for token issuance and settlement. Smart contracts handle compliance checks, ownership transfer, and delivery tracking. Tokens are issued on-chain immediately upon purchase and remain fully transferable.",
  },
  {
    q: "What are the risks of tokenized commodity purchase?",
    a: "Risks include commodity price fluctuation, mining operational delays, regulatory changes, and limited token liquidity during vesting periods. Cireta mitigates delivery risk through 105% credit risk insurance, but market risk remains. Always review the project white paper and consult an independent financial advisor before buying.",
  },
];

/* ─── How It Works steps ─── */

const STEPS = [
  { num: 1, title: "Browse", desc: "Explore live projects and download white papers. No account required to review project details and tokenomics." },
  { num: 2, title: "Connect", desc: "Sign up securely to start your purchase journey. Create your account in minutes." },
  { num: 3, title: "Verify", desc: "Complete a few simple KYC/KYB steps to get yourself verified as an eligible buyer." },
  { num: 4, title: "Buy", desc: "Choose from a range of tokenized commodity projects and buy with USDC. Tokens are issued on-chain immediately." },
];

function useTimelineAnimation(ref: React.RefObject<HTMLDivElement | null>, fillRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    const fill = fillRef.current;
    if (!el || !fill) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            timers.forEach(clearTimeout);
            timers.length = 0;
            fill.classList.remove("animate");
            const circles = el.querySelectorAll(".step-circle");
            circles.forEach((c) => c.classList.remove("reached"));
            void fill.offsetWidth;
            fill.classList.add("animate");
            circles.forEach((circle, i) => {
              timers.push(setTimeout(() => circle.classList.add("reached"), 500 + i * 750));
            });
          }
        });
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => { observer.disconnect(); timers.forEach(clearTimeout); };
  }, [ref, fillRef]);
}

function HowItWorksSection() {
  const timelineRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const mobileTimelineRef = useRef<HTMLDivElement>(null);
  const mobileFillRef = useRef<HTMLDivElement>(null);

  useTimelineAnimation(timelineRef, fillRef);
  useTimelineAnimation(mobileTimelineRef, mobileFillRef);

  return (
    <section className="py-16 md:py-24 lg:py-[120px] px-4 md:px-8 bg-white" id="how-it-works">
      <div className="max-w-inner mx-auto">
        <div className="text-center mb-16 max-w-[768px] xl:max-w-[1020px] mx-auto">
          <motion.span
            className="text-xs font-semibold uppercase tracking-widest text-black/40 block"
            initial={{ opacity: 0, x: -20, filter: "blur(4px)" }}
            whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            Getting Started
          </motion.span>
          <motion.h2
            className="font-semibold text-text -tracking-[0.96px] mt-2"
            style={{ fontSize: "clamp(1.875rem, 1.1852rem + 2.94314vw, 3rem)", lineHeight: "clamp(32px, 1.1852rem + 2.94314vw, 3.25rem)" }}
            initial={{ opacity: 0, y: 30, scale: 0.97, filter: "blur(6px)" }}
            whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          >
            How Tokenized Commodity Purchase Works
          </motion.h2>
          <motion.p
            className="-tracking-[0.36px] opacity-75 mt-4"
            style={{ fontSize: "clamp(16px, 2vw, 18px)", lineHeight: "clamp(20px, 2.2vw, 28px)" }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          >
            From browsing tokenized gold and copper projects to making your first blockchain-settled purchase, the process is straightforward. No prior crypto experience required.
          </motion.p>
        </div>

        {/* Desktop horizontal timeline */}
        <div ref={timelineRef} className="steps-timeline hidden md:flex justify-between mt-14 px-5 mb-12">
          <div className="timeline-track" />
          <div ref={fillRef} className="timeline-fill" />
          {STEPS.map((s) => (
            <div key={s.num} className="text-center relative z-[2] flex-1">
              <div className="step-circle w-[60px] h-[60px] rounded-full bg-white border-[3px] border-box flex items-center justify-center mx-auto mb-4 text-[20px] font-bold text-darkAqua">
                {s.num}
              </div>
              <h3 className="text-[17px] font-bold text-text mb-2">{s.title}</h3>
              <p className="text-[14px] text-black/50 leading-[1.6] max-w-[200px] mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Mobile vertical timeline */}
        <div ref={mobileTimelineRef} className="steps-timeline md:hidden flex flex-col gap-8 pl-12 relative mb-12">
          <div className="timeline-track" />
          <div ref={mobileFillRef} className="timeline-fill" />
          {STEPS.map((s) => (
            <div key={s.num} className="relative z-[2]">
              <div className="step-circle absolute -left-12 w-[40px] h-[40px] rounded-full bg-white border-[3px] border-box flex items-center justify-center text-sm font-bold text-darkAqua">
                {s.num}
              </div>
              <div className="pl-2">
                <h3 className="text-lg font-bold text-text mb-1">{s.title}</h3>
                <p className="text-sm text-black/50 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <motion.div
          className="mt-16 md:mt-20 max-w-[700px] mx-auto bg-white rounded-2xl border border-black/10 overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.04)]"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-stretch">
            <div className="w-1 bg-darkAqua shrink-0" />
            <div className="p-6 md:p-8 flex-1">
              <h4 className="text-[17px] font-bold text-text mb-4">After Investing</h4>
              <p className="text-[15px] text-black/50 leading-[1.7] mb-5">
                Following your 12-month vesting period, you can take <a href="https://www.cireta.com/tokenized-gold" className="text-darkAqua font-medium hover:underline">physical delivery</a> of your commodity, settle in USDC, or continue holding your position. Your tokens remain fully transferable on-chain.
              </p>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 bg-box rounded-lg px-3 py-2">
                  <Gift className="w-3.5 h-3.5 text-darkAqua" />
                  <span className="text-xs font-medium text-black/60">Physical Delivery</span>
                </div>
                <div className="flex items-center gap-2 bg-box rounded-lg px-3 py-2">
                  <Shield className="w-3.5 h-3.5 text-darkAqua" />
                  <span className="text-xs font-medium text-black/60">Cash Out Anytime</span>
                </div>
                <div className="flex items-center gap-2 bg-box rounded-lg px-3 py-2">
                  <Repeat className="w-3.5 h-3.5 text-darkAqua" />
                  <span className="text-xs font-medium text-black/60">Fully Transferable</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Why Cireta cards ─── */

const WHY_CARDS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-white">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "105% Credit Risk Insurance",
    desc: "Your capital is insured against delivery failure. Coverage is provided by MayFair and SIC Ghana, backed by reinsurers including Swiss Re, Munich Re, and Lloyd\u2019s.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-white">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      </svg>
    ),
    title: "Production-Stage Assets",
    desc: "Every project is operational or in verified production, not speculative. Gold reserves are certified to NI43-101 and JORC international standards.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-white">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
    title: "Physical Delivery Rights",
    desc: "Tokens represent economic rights to real commodities. Gold delivery is available after a 12-month vesting period. Copper is priced FOB with international shipping terms.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-white">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
      </svg>
    ),
    title: "Segregated SPV Structure",
    desc: "Each project is ring-fenced in its own legal entity with independent trust accounts. Your purchase is isolated from platform-level risk through KYC/KYB-compliant frameworks.",
  },
];

/* ─── Press articles ─── */

const PRESS = [
  {
    source: "Coinfomania",
    badge: "Press",
    date: "Jan 23, 2026",
    color: "bg-[#1a1a2e]",
    image: null as string | null,
    title: "Institutional Approaches to Commodity Tokenization in Real-World Assets: A Case Study Involving Cireta",
    excerpt: "Cireta describes itself as an RWA tokenization platform supporting gold and copper projects with verified reserves and institutional insurance...",
    url: "https://coinfomania.com/institutional-approaches-to-commodity-tokenization-in-real-world-assets-a-case-study-involving-cireta/",
  },
  {
    source: "MPOST",
    badge: "Press",
    date: "Jan 6, 2026",
    color: "bg-[#2d1b69]",
    image: "https://cdn.cireta.com/cireta-home/press/mpost_card.webp",
    title: "Cireta\u2019s Global Debut Puts Real Gold On-Chain With Delivery Rights",
    excerpt: "Cireta has launched globally with Wassa Gold, a tokenized gold project providing fractional ownership backed by physical delivery rights...",
    url: "https://mpost.io/ciretas-global-debut-puts-real-gold-on-chain-with-delivery-rights/",
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
        const data = await getProjects({ size: 12 });
        const now = Date.now();
        const rank = (p: Project) => {
          if (p.isComingSoon) return 2; // coming soon — last
          const hasActivePhase = p.phases.some((ph) => {
            const s = new Date(ph.start_time || 0).getTime();
            const e = new Date(ph.end_time || 0).getTime();
            return now >= s && now < e;
          });
          return hasActivePhase ? 0 : 1; // ongoing first, then upcoming
        };
        const sorted = [...data.items].sort((a, b) => rank(a) - rank(b));
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
        <div className="absolute inset-0">
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            poster="https://cdn.cireta.com/cireta-home/hero-poster.jpg"
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src="https://cdn.cireta.com/cireta-home/hero-vd.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/60" />
        </div>

        <div className="relative z-10 max-w-[780px] mx-auto flex items-center flex-col text-center px-4">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
            className="text-[36px]/[40px] md:text-[52px]/[56px] lg:text-[64px]/[68px] font-bold text-white -tracking-[1.8px] mb-4 md:mb-6"
          >
            Buy Real World Assets<br className="hidden md:block" /> Through Tokenization
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.45 }}
            className="text-[20px] font-normal leading-8 -tracking-[0.36px] max-w-[600px] text-white/90"
          >
            Access tokenized gold, copper, and infrastructure projects backed by verified physical reserves, institutional insurance, and blockchain-grade transparency.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.6 }}
            className="flex items-center gap-4 mt-8"
          >
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 h-12 px-8 rounded-full bg-white text-darkAqua text-sm md:text-base font-semibold hover:bg-white/90 transition-colors duration-200"
            >
              Explore Projects <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>

        {/* Partner logo carousel — overlays bottom of hero */}
        {partners.length > 0 && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 py-6 md:py-8 bg-gradient-to-t from-black/40 to-transparent overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
          >
            <div className="marquee-track">
              {[...partners, ...partners].map((p, i) => (
                <div key={`${p.id}-${i}`} className="shrink-0 mx-6 md:mx-10 flex items-center">
                  {p.logo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={p.logo_url}
                      alt={p.name}
                      className="h-12 md:h-16 w-auto object-contain brightness-0 invert"
                    />
                  ) : (
                    <span className="text-white/40 text-base font-semibold tracking-wide whitespace-nowrap">
                      {p.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </section>

      {/* ── 2. Platform at a Glance ── */}
      <section className="py-16 md:py-20 lg:py-[100px] px-4 md:px-8 bg-white">
        <div className="max-w-inner mx-auto">
          <div className="mb-12 overflow-hidden">
            <div className="space-y-4 max-w-[768px] xl:max-w-[1020px] mx-auto text-center">
              <motion.span
                className="text-xs font-semibold uppercase tracking-widest text-black/40 block"
                initial={{ opacity: 0, x: -20, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                Platform at a Glance
              </motion.span>
              <motion.h2
                className="font-semibold -tracking-[0.96px] mt-2"
                style={{ fontSize: "clamp(1.875rem, 1.1852rem + 2.94314vw, 3rem)", lineHeight: "clamp(32px, 1.1852rem + 2.94314vw, 3.25rem)" }}
                initial={{ opacity: 0, y: 30, scale: 0.97, filter: "blur(6px)" }}
                whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              >
                Capital. Trust. Execution.
              </motion.h2>
              <motion.p
                className="-tracking-[0.36px] opacity-75"
                style={{ fontSize: "clamp(16px, 2vw, 18px)", lineHeight: "clamp(20px, 2.2vw, 28px)" }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              >
                Cireta connects investors with blockchain-secured commodity and infrastructure projects through a compliance-first platform. Our tokenized gold and copper offerings are backed by verified reserves, institutional insurance, and SPV-protected legal structures designed to safeguard every investment.
              </motion.p>
            </div>
          </div>
          {stats.length > 0 && (
            <div className={`grid grid-cols-1 gap-4 md:gap-6 ${stats.length === 1 ? "sm:grid-cols-1 max-w-sm mx-auto" : stats.length === 2 ? "sm:grid-cols-2 max-w-2xl mx-auto" : stats.length === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
              {stats.sort((a, b) => a.sort_order - b.sort_order).map((stat, i) => (
                <motion.div
                  key={stat.key}
                  className="bg-white rounded-2xl border border-black/10 p-6 md:p-8 text-center transition-shadow duration-300 hover:shadow-lg"
                  initial={{ opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 200, damping: 20, delay: i * 0.12 }}
                >
                  <p className="text-[40px]/[44px] md:text-[56px]/[60px] font-bold text-darkAqua tracking-tight">
                    {stat.value}
                  </p>
                  <p className="text-sm md:text-base text-black/40 mt-2 font-medium">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── 4. Projects (EXISTING CODE) ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-inner mx-auto">
          <div className="text-center mb-12 max-w-[768px] xl:max-w-[1020px] mx-auto">
            <p className="text-xs font-semibold text-black/40 uppercase tracking-widest mb-4">Live Purchase Opportunities</p>
            <h2 className="font-semibold text-text -tracking-[0.96px] mb-4" style={{ fontSize: "clamp(1.875rem, 1.1852rem + 2.94314vw, 3rem)", lineHeight: "clamp(32px, 1.1852rem + 2.94314vw, 3.25rem)" }}>Projects</h2>
            <p className="-tracking-[0.36px] opacity-75 max-w-[768px] mx-auto" style={{ fontSize: "clamp(16px, 2vw, 18px)", lineHeight: "clamp(20px, 2.2vw, 28px)" }}>
              Browse active tokenized gold, copper, and mineral projects currently open for purchase. Each is backed by independently verified physical reserves, structured through segregated SPVs, and protected by credit risk insurance.
            </p>
            <Link
              href="/projects"
              className="inline-flex justify-center items-center text-xsm md:text-sm lg:text-base rounded-full btn-cta py-[18px] px-10 mt-8 gap-2.5 transition-colors duration-300"
            >
              See Full Portfolio <ArrowRight className="h-4 w-4" />
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
                  {...(i === 0 ? { "data-tour-id": "first-project-card" } : {})}
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
            Purchase involves risk, including possible loss of capital. Past performance is not indicative of future results.
            Review each project&apos;s white paper and <a href="https://www.cireta.com/compliance" className="text-darkAqua hover:underline">risk disclosures</a> before buying.
          </p>
        </div>
      </section>

      {/* ── 5. Why Cireta ── */}
      <section className="py-20 px-4 bg-box">
        <div className="max-w-inner mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-darkAqua uppercase tracking-wider mb-2">Buyer Protection</p>
            <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Why Buyers Choose Cireta</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Every tokenized commodity project on this platform is structured to protect buyer capital. From <a href="https://www.cireta.com/compliance" className="text-darkAqua hover:underline">NI43-101 certified reserves</a> and insured delivery to ring-fenced legal entities that isolate your position from platform-level risk.
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

          <div className="text-center mt-10">
            <a href="https://www.cireta.com/compliance" className="text-sm font-semibold text-darkAqua hover:underline">
              View our compliance framework &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* ── 6. Track Record ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-inner mx-auto text-center">
          <p className="text-sm font-semibold text-darkAqua uppercase tracking-wider mb-2">Real Production. Real Results.</p>
          <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Proven Commodity Delivery Track Record</h2>
          <p className="text-black/50 max-w-2xl mx-auto mb-14">
            Cireta&apos;s tokenized commodity model was first deployed with copper from Kolwezi, DRC. Over 14 months of continuous production and 3 months of verified international deliveries. Shipments on time, on spec, on budget. That working system is now scaling to Tanzania and Ghana.
          </p>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { value: "14", unit: "months", label: "Continuous copper production in Kolwezi, DRC" },
              { value: "3", unit: "months", label: "Verified international commodity deliveries" },
              { value: "3", unit: "countries", label: "Active or scaling operations: DRC, Tanzania, Ghana" },
              { value: "99.99%", unit: "", label: "Copper cathode purity, production grade verified" },
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
      <HowItWorksSection />

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
      <section className="py-16 md:py-20 lg:py-[100px] px-4 md:px-8 bg-white">
        <div className="max-w-inner mx-auto">
          <div className="mb-12 max-w-[768px] xl:max-w-[1020px] mx-auto text-center">
            <motion.span
              className="text-xs font-semibold uppercase tracking-widest text-black/40 block"
              initial={{ opacity: 0, x: -20, filter: "blur(4px)" }}
              whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              In The News
            </motion.span>
            <motion.h2
              className="font-semibold text-text -tracking-[0.96px] mt-2"
              style={{ fontSize: "clamp(1.875rem, 1.1852rem + 2.94314vw, 3rem)", lineHeight: "clamp(32px, 1.1852rem + 2.94314vw, 3.25rem)" }}
              initial={{ opacity: 0, y: 30, scale: 0.97, filter: "blur(6px)" }}
              whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            >
              Press & Media
            </motion.h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {PRESS.map((article, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40, scale: 0.96 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: i * 0.15 }}
              >
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-2xl overflow-hidden h-full bg-box hover:shadow-card transition-shadow duration-300"
                >
                  {/* Image / Color header */}
                  <div className={`relative h-[200px] md:h-[260px] overflow-hidden ${article.color}`}>
                    {article.image ? (
                      <Image
                        src={article.image}
                        alt={article.source}
                        fill
                        className="object-cover hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white/90 text-2xl md:text-3xl font-bold tracking-tight">{article.source}</span>
                      </div>
                    )}
                  </div>
                  {/* Content */}
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-semibold text-darkAqua bg-white px-2.5 py-1 rounded-full border border-black/5">{article.badge}</span>
                      <span className="text-xs text-black/40">{article.date}</span>
                    </div>
                    <h3 className="text-base md:text-lg font-semibold text-text -tracking-[0.4px] mb-2 line-clamp-2">{article.title}</h3>
                    <p className="text-sm text-black/50 leading-relaxed line-clamp-3 mb-4">{article.excerpt}</p>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-darkAqua">
                      Read more <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 10. Partners ── */}
      {partners.length > 0 && (
        <section className="py-16 md:py-20 lg:py-[100px] px-4 md:px-8 bg-white">
          <div className="max-w-inner mx-auto">
            <div className="text-center mb-12 max-w-[768px] xl:max-w-[1020px] mx-auto">
              <motion.span
                className="text-xs font-semibold uppercase tracking-widest text-black/40 block"
                initial={{ opacity: 0, x: -20, filter: "blur(4px)" }}
                whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                Trusted By
              </motion.span>
              <motion.h2
                className="font-semibold text-text -tracking-[0.96px] mt-2"
                style={{ fontSize: "clamp(1.875rem, 1.1852rem + 2.94314vw, 3rem)", lineHeight: "clamp(32px, 1.1852rem + 2.94314vw, 3.25rem)" }}
                initial={{ opacity: 0, y: 30, scale: 0.97, filter: "blur(6px)" }}
                whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              >
                Institutional &amp; Strategic Partners
              </motion.h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6">
              {partners.sort((a, b) => a.sort_order - b.sort_order).map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 200, damping: 20, delay: i * 0.05 }}
                  className="bg-white rounded-2xl border border-black/10 p-6 flex items-center justify-center h-24 md:h-28 transition-shadow duration-300 hover:shadow-lg group"
                >
                  {p.logo_url ? (
                    <Image
                      src={p.logo_url}
                      alt={p.name}
                      width={140}
                      height={48}
                      className="max-h-10 md:max-h-12 w-auto object-contain opacity-60 group-hover:opacity-100 transition-opacity duration-300"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-black/30 group-hover:text-black/60 transition-colors">{p.name}</span>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 11. Risks and Considerations ── */}
      <section className="py-14 px-4 bg-white">
        <div className="max-w-[760px] mx-auto">
          <div className="border border-[#F3D6D6] rounded-xl p-7 bg-[#FDF7F7]">
            <p className="text-base font-bold text-text mb-3">Risks and Considerations</p>
            <p className="text-sm text-gray-500 leading-[1.7]">
              Tokenized commodity purchases carry risks including commodity price fluctuation, operational delays in mining production, regulatory changes across jurisdictions, and token liquidity limitations during vesting periods. All projects on this platform include 105% credit risk insurance against delivery failure, but this does not eliminate market risk or guarantee returns. Buyers should review individual project white papers and consult independent financial advisors before participating. Full risk disclosures are available on each <a href="https://www.cireta.com/compliance" className="text-darkAqua font-medium hover:underline">project compliance page</a>.
            </p>
          </div>
        </div>
      </section>

      {/* ── 12. FAQ ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold text-darkAqua uppercase tracking-wider mb-2">Support</p>
            <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Tokenized Commodity Purchase FAQ</h2>
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
      <section className="relative w-full h-full overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full">
          <motion.video
            initial={{ scale: 1 }}
            whileInView={{ scale: 1.05, transition: { type: "spring", duration: 2, delay: 0.1 } }}
            viewport={{ once: false }}
            autoPlay muted loop playsInline
            className="w-full h-full object-cover"
          >
            <source src="https://cdn.cireta.com/cireta-home/bottom-vd.mp4" type="video/mp4" />
          </motion.video>
        </div>
        <div className="flex items-center justify-center relative min-h-[50vh] md:min-h-[60vh] h-full w-full py-16 md:py-20 px-4">
          <div className="max-w-[700px] mx-auto text-center flex flex-col items-center">
            <motion.h2
              className="text-[36px]/[40px] md:text-[48px]/[52px] font-bold -tracking-[1.44px] mb-4 md:mb-5 text-white"
              initial={{ opacity: 0, y: 30, scale: 0.97, filter: "blur(8px)" }}
              whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              Ready to Buy Tokenized Assets?
            </motion.h2>
            <motion.p
              className="text-sm/6 md:text-base/7 font-medium -tracking-[0.18px] text-white/85 max-w-[560px]"
              initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            >
              Access gold, copper, and infrastructure projects through blockchain-secured tokens on the Cireta Launchpad.
            </motion.p>
            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8"
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.3 }}
            >
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 h-12 px-8 rounded-full bg-white text-darkAqua text-sm md:text-base font-semibold hover:bg-white/90 transition-colors duration-200"
              >
                View Projects <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="https://www.cireta.com/contact-us"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-12 px-8 rounded-full border border-white/40 text-white text-sm md:text-base font-medium hover:bg-white/10 transition-colors duration-200"
              >
                Contact Us
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── 14. Footer ── */}
      <Footer />
    </div>
  );
}
