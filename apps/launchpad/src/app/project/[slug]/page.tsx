"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft, ShoppingBag, FolderOpen, Coins, Bell, Play,
  FileText, ChevronDown, ChevronUp, Download, Clock,
} from "lucide-react";
import { Badge, Spinner, ProgressBar, Button } from "@/components/atoms";
import { Navbar, Footer } from "@/components/organisms";
import { cn, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/useAuth";
import { getProject, getSaleRawBySlug, type Project, type SaleRaw } from "@/lib/api/repositories/projects.repository";
import { getToken, type Token } from "@/lib/api/repositories/tokens";
import { apiGet, apiPost, apiFetch } from "@/lib/api/client";

/* ---------- types for sale content endpoints ---------- */
interface SaleImage { id: string; url: string; caption?: string; is_banner?: boolean; sort_order?: number; media_type?: "image" | "video"; video_url?: string }
interface SaleDocument { id: string; name: string; document_type: string; url: string }
interface TeamMember { id: string; name: string; title: string; bio?: string; photo_url?: string }
interface FAQ { id: string; question: string; answer: string }

function getEmbedUrl(url: string): string | null {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&showinfo=0&disablekb=1&fs=0&iv_load_policy=3&loop=1&playlist=${ytMatch[1]}`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&muted=1&controls=0&loop=1&title=0&byline=0&portrait=0`;
  return null;
}

function getPhaseStatus(phase: { start_time: string; end_time: string; is_active?: boolean }): "active" | "upcoming" | "ended" {
  const now = Date.now();
  const start = new Date(phase.start_time).getTime();
  const end = new Date(phase.end_time).getTime();
  if (now < start) return "upcoming";
  if (now >= end) return "ended";
  return "active";
}

function getTimeRemaining(endTime: string): string {
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h remaining`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return hours > 0 ? `${hours}h ${mins}m remaining` : `${mins}m remaining`;
}

function getTimeUntilStart(startTime: string): string {
  const diff = new Date(startTime).getTime() - Date.now();
  if (diff <= 0) return "";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `Starts in ${days}d ${hours}h`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return hours > 0 ? `Starts in ${hours}h ${mins}m` : `Starts in ${mins}m`;
}

const SIDEBAR_LINKS = [
  { href: "/explore", label: "Sales", icon: ShoppingBag },
  { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
];

const BASE_TABS = ["Overview", "Token & Sale", "Documents", "Team", "FAQ", "My Position", "Transactions"] as const;
const ALL_TABS = ["Overview", "Token & Sale", "OTC & Bank", "Documents", "Team", "FAQ", "My Position", "Transactions"] as const;
type Tab = (typeof ALL_TABS)[number];

export default function ProjectDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [project, setProject] = useState<Project | null>(null);
  const [saleRaw, setSaleRaw] = useState<SaleRaw | null>(null);
  const [token, setToken] = useState<Token | null>(null);
  const [images, setImages] = useState<SaleImage[]>([]);
  const [documents, setDocuments] = useState<SaleDocument[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [proj, raw] = await Promise.all([getProject(slug), getSaleRawBySlug(slug)]);
        setProject(proj); setSaleRaw(raw);
        if (raw.token_id) getToken(raw.token_id).then(setToken).catch(() => {});
        const sid = raw.id;
        apiFetch<SaleImage[]>(`/api/v1/sales/${sid}/images`, { skipAuthRedirect: true }).then(setImages).catch(() => {});
        apiFetch<SaleDocument[]>(`/api/v1/sales/${sid}/documents`, { skipAuthRedirect: true }).then(setDocuments).catch(() => {});
        apiFetch<TeamMember[]>(`/api/v1/sales/${sid}/team`, { skipAuthRedirect: true }).then(setTeam).catch(() => {});
        apiFetch<FAQ[]>(`/api/v1/sales/${sid}/faqs`, { skipAuthRedirect: true }).then(setFaqs).catch(() => {});
        // Subscriber count (public)
        apiFetch<{ count: number }>(`/api/v1/sales/${sid}/subscriber-count`, { skipAuthRedirect: true }).then((r) => setSubscriberCount(r.count)).catch(() => {});
        // Check if current user is subscribed (may 401 if not logged in — that's fine)
        apiFetch<{ subscribed: boolean }>(`/api/v1/sales/${sid}/is-subscribed`, { skipAuthRedirect: true }).then((r) => setSubscribed(r.subscribed)).catch(() => {});
      } catch { setError(true); }
      finally { setIsLoading(false); }
    }
    if (slug) load();
  }, [slug]);

  const handleSubscribe = async () => {
    if (!saleRaw) return;
    setSubscribing(true);
    try {
      const email = isAuthenticated ? undefined : subscribeEmail || undefined;
      await apiPost(`/api/v1/sales/${saleRaw.id}/subscribe`, { email });
      setSubscribed(true);
      setSubscriberCount((c) => c + 1);
      setShowEmailInput(false);
    } catch { /* already subscribed or error */ }
    finally { setSubscribing(false); }
  };

  const handleUnsubscribe = async () => {
    if (!saleRaw) return;
    try {
      await apiFetch(`/api/v1/sales/${saleRaw.id}/unsubscribe`, { method: "DELETE" });
      setSubscribed(false);
      setSubscriberCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="xl" /></div>;
  if (error || !project) return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <h1 className="text-2xl font-bold mb-2">Project Not Found</h1>
      <Link href="/projects" className="text-darkAqua font-semibold hover:underline">Back to Sales</Link>
    </div>
  );
  // Time-based active phase: find the phase whose window contains "now"
  const _now = new Date();
  const ap = project.phases?.find((p) => {
    const start = new Date(p.start_time).getTime();
    const end = new Date(p.end_time).getTime();
    return _now.getTime() >= start && _now.getTime() < end;
  }) ?? project.phases?.[0] ?? null;
  const pricePerToken = ap ? parseFloat(ap.price_per_token) : 0;
  const minContrib = ap ? parseFloat(ap.min_contribution) : 0;
  const maxContrib = ap ? parseFloat(ap.max_contribution) : 0;
  const startTime = ap?.start_time ? new Date(ap.start_time) : null;
  const endTime = ap?.end_time ? new Date(ap.end_time) : null;
  const hardCap = parseFloat(saleRaw?.hard_cap ?? String(project.targetAmount));
  const softCap = parseFloat(saleRaw?.soft_cap ?? "0");
  const raised = project.currentRaised;
  const progressPct = hardCap > 0 ? Math.min((raised / hardCap) * 100, 100) : 0;
  const bannerImg = images.find((i) => i.is_banner)?.url ?? (project.imageUrl || "/images/projects/gold-ghana.png");
  const gallery = images.length > 0 ? images.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : [];
  const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  const fmtUsdc = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M` : n.toLocaleString();
  const statusColor: Record<string, string> = { active: "text-green-600", upcoming: "text-blue-600", completed: "text-gray-500", paused: "text-amber-600" };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar variant="light" />

      <div className="flex pt-16 flex-1">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-44 border-r border-gray-100 flex-col p-4 sticky top-16 h-[calc(100vh-4rem)]">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 px-2">Investor</p>
          <nav className="space-y-1">
            {SIDEBAR_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-text transition-colors">
                <link.icon className="h-4 w-4" />{link.label}
              </Link>
            ))}
          </nav>
        </aside>
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <header className="sticky top-16 z-20 bg-white border-b border-gray-100 px-6 py-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Link href="/projects" className="hover:text-text">Sales</Link>
              <span>/</span>
              <span className="text-text font-medium truncate">{project.title}</span>
            </div>
          </header>
          <main className="flex-1 min-w-0">
            {/* Banner + overlaid sale widget */}
            <div className="relative">
              <div className="relative h-[420px] overflow-hidden" style={{ backgroundColor: "#13636F" }}>
                {gallery[selectedImage]?.media_type === "video" ? (
                  (() => {
                    const videoSrc = gallery[selectedImage].video_url || gallery[selectedImage].url;
                    const embedUrl = gallery[selectedImage].video_url ? getEmbedUrl(gallery[selectedImage].video_url) : null;
                    return embedUrl ? (
                      <iframe src={embedUrl} className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media" allowFullScreen />
                    ) : (
                      <video src={videoSrc} className="absolute inset-0 w-full h-full object-cover" autoPlay muted loop playsInline />
                    );
                  })()
                ) : (
                  <Image src={gallery[selectedImage]?.url ?? bannerImg} alt={project.title} fill className="object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#13636F]/80 via-[#13636F]/30 to-[#13636F]/10 pointer-events-none" />
                <Link href="/projects" className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium z-10">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Link>
                <div className="absolute bottom-6 left-6 right-[380px] z-10">
                  <p className="text-white/60 text-xs mb-1">{project.issuer.name}</p>
                  <h1 className="text-2xl font-bold text-white mb-2">{project.title}</h1>
                  {project.description && <p className="text-white/80 text-sm line-clamp-2">{project.description}</p>}
                </div>
                {/* Sale widget overlaid on banner */}
                <div className="absolute top-4 right-4 w-[340px] bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg p-5 z-10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-darkAqua/10 flex items-center justify-center"><Coins className="h-4 w-4 text-darkAqua" /></div>
                      <div>
                        <p className="font-bold text-sm">USDC</p>
                        <p className="text-xs text-gray-500">
                          {project.isComingSoon
                            ? "Details announced at launch"
                            : raised > 0
                              ? `${fmtUsdc(raised)} raised out of ${fmtUsdc(hardCap)} USDC`
                              : `Target: ${fmtUsdc(hardCap)} USDC`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={cn("w-2 h-2 rounded-full", project.status === "active" ? "bg-green-500" : project.isComingSoon ? "bg-amber-400" : "bg-gray-400")} />
                      <span className={cn("text-xs font-semibold capitalize", project.isComingSoon ? "text-amber-600" : statusColor[project.status] ?? "text-gray-500")}>
                        {project.isComingSoon ? "Coming Soon" : project.status}
                      </span>
                    </div>
                  </div>
                  {/* Active phase badge */}
                  {!project.isComingSoon && ap && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 bg-darkAqua/10 text-darkAqua text-xs font-semibold px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-darkAqua" />
                          {ap.name}
                        </span>
                        {getPhaseStatus(ap) === "active" && endTime && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 font-medium">
                            <Clock className="h-3 w-3" />
                            {getTimeRemaining(ap.end_time)}
                          </span>
                        )}
                      </div>
                      {/* Between-phases messaging */}
                      {getPhaseStatus(ap) !== "active" && (() => {
                        const nextPhase = project.phases.find((ph) => new Date(ph.start_time).getTime() > Date.now());
                        if (!nextPhase) return null;
                        return (
                          <p className="text-xs text-blue-600 font-medium mt-1.5 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Next phase ({nextPhase.name}) {getTimeUntilStart(nextPhase.start_time).toLowerCase()}
                          </p>
                        );
                      })()}
                    </div>
                  )}
                  {!project.isComingSoon && <ProgressBar value={progressPct} className="h-1.5 mb-4" />}
                  <div className="space-y-2.5 text-sm mb-4">
                    {!project.isComingSoon && endTime && <div className="flex justify-between"><span className="text-gray-500">Ends</span><span className="font-medium">{fmtDate(endTime)}</span></div>}
                    <div className="flex justify-between"><span className="text-gray-500">Min. Buy</span><span className="font-medium">{project.isComingSoon ? "TBD" : `${minContrib.toLocaleString()} USDC`}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Max. Allocation</span><span className="font-medium">{project.isComingSoon ? "TBD" : maxContrib > 0 ? `${maxContrib.toLocaleString()} USDC` : "No Limit"}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Token Price</span><span className="font-medium">{pricePerToken > 0 ? `${pricePerToken.toLocaleString()} USDC` : "TBD"}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Accepted currency</span><span className="font-medium">USDC</span></div>
                  </div>
                  {project.isComingSoon ? (
                    <div className="space-y-2">
                      {subscribed ? (
                        <div>
                          <button className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 cursor-default">
                            <Bell className="h-4 w-4" /> Subscribed
                          </button>
                          <button onClick={handleUnsubscribe} className="w-full text-xs text-gray-400 hover:text-gray-600 mt-1.5 transition-colors">
                            Unsubscribe
                          </button>
                        </div>
                      ) : isAuthenticated ? (
                        <button onClick={handleSubscribe} disabled={subscribing}
                          className="w-full btn-cta py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                          <Bell className="h-4 w-4" /> {subscribing ? "Subscribing..." : "Notify Me"}
                        </button>
                      ) : !showEmailInput ? (
                        <button onClick={() => setShowEmailInput(true)}
                          className="w-full btn-cta py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                          <Bell className="h-4 w-4" /> Notify Me
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <input type="email" value={subscribeEmail} onChange={(e) => setSubscribeEmail(e.target.value)}
                            placeholder="Enter your email" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30" />
                          <button onClick={handleSubscribe} disabled={subscribing || !subscribeEmail.includes("@")}
                            className="w-full btn-cta py-3 rounded-xl transition-colors disabled:opacity-60">
                            {subscribing ? "Subscribing..." : "Subscribe"}
                          </button>
                        </div>
                      )}
                      {subscriberCount > 0 && (
                        <p className="text-center text-xs text-gray-400">{subscriberCount} investor{subscriberCount !== 1 ? "s" : ""} interested</p>
                      )}
                    </div>
                  ) : isAuthenticated ? (
                    <Link href={`/invest/${project.slug}`} className="block w-full btn-cta py-3 rounded-xl transition-colors text-center">Buy Now</Link>
                  ) : (
                    <button onClick={() => setShowLoginDialog(true)} className="w-full btn-cta py-3 rounded-xl transition-colors">Buy Now</button>
                  )}
                </div>
              </div>
              {gallery.length > 1 && (
                <div className="flex gap-3 px-6 py-4 overflow-x-auto">
                  {gallery.map((img, i) => (
                    <button key={img.id} onClick={() => setSelectedImage(i)} className={cn("relative w-28 h-20 rounded-xl overflow-hidden border-2 flex-shrink-0 transition-all", i === selectedImage ? "border-darkAqua ring-2 ring-darkAqua/30" : "border-zinc-200 opacity-70 hover:opacity-100")}>
                      {img.media_type === "video" ? (
                        <>
                          <video src={img.url} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Play className="h-5 w-5 text-white fill-white" />
                          </div>
                        </>
                      ) : (
                        <Image src={img.url} alt={img.caption ?? ""} fill className="object-cover" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Social Links */}
            {saleRaw && (saleRaw.website_url || saleRaw.twitter_url || saleRaw.linkedin_url || saleRaw.telegram_url || saleRaw.discord_url || saleRaw.instagram_url || saleRaw.facebook_url) && (
              <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100">
                {saleRaw.website_url && <a href={saleRaw.website_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-text transition-colors" title="Website"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg></a>}
                {saleRaw.twitter_url && <a href={saleRaw.twitter_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-text transition-colors" title="X / Twitter"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>}
                {saleRaw.linkedin_url && <a href={saleRaw.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-text transition-colors" title="LinkedIn"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>}
                {saleRaw.telegram_url && <a href={saleRaw.telegram_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-text transition-colors" title="Telegram"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg></a>}
                {saleRaw.discord_url && <a href={saleRaw.discord_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-text transition-colors" title="Discord"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z"/></svg></a>}
                {saleRaw.instagram_url && <a href={saleRaw.instagram_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-text transition-colors" title="Instagram"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg></a>}
                {saleRaw.facebook_url && <a href={saleRaw.facebook_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-text transition-colors" title="Facebook"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>}
              </div>
            )}
            {/* Tabs */}
            <div className="border-b border-gray-100 mx-6">
              <div className="flex gap-6 overflow-x-auto py-3">
                {(saleRaw?.otc_enabled ? ALL_TABS : BASE_TABS).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-5 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors", activeTab === tab ? "text-white" : "text-gray-500 hover:bg-gray-100 hover:text-text")} style={activeTab === tab ? { backgroundColor: "#13636F" } : undefined}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            {/* Tab content */}
            <div className="p-6 mr-6">
              {activeTab === "Overview" && (
                <div className="space-y-6">
                  {(saleRaw as unknown as Record<string, unknown>)?.full_description ? (
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: (saleRaw as unknown as Record<string, unknown>).full_description as string }} />
                  ) : (
                    <p className="text-gray-600 leading-relaxed">{project.description || "Project details coming soon."}</p>
                  )}
                </div>
              )}

              {activeTab === "Token & Sale" && (
                <div className="space-y-6">
                  {/* Token Details */}
                  <div className="bg-gray-50 rounded-xl p-5">
                    <h3 className="font-bold text-text mb-3 text-sm">Token Details</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        ["Name", project.title],
                        ["Ticker", project.tokenSymbol || "TBD"],
                        ["Asset Type", project.assetType],
                        ["Blockchain", "Base"],
                      ].map(([k, v]) => (
                        <div key={k}><span className="text-gray-500">{k}</span><p className="font-medium capitalize">{v}</p></div>
                      ))}
                      {token?.contract_address && <div className="col-span-2"><span className="text-gray-500">Contract</span><p className="font-medium font-mono text-xs">{token.contract_address}</p></div>}
                    </div>
                  </div>

                  {/* Sale Details */}
                  <h3 className="font-bold text-text text-sm">Sale Details</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    {[
                      ["Soft Cap", project.isComingSoon ? "TBD" : `${fmtUsdc(softCap)} USDC`],
                      ["Hard Cap", project.isComingSoon ? "TBD" : `${fmtUsdc(hardCap)} USDC`],
                      ["Token Price", pricePerToken > 0 ? `${pricePerToken.toLocaleString()} USDC` : "TBD"],
                      ["Start", startTime ? fmtDate(startTime) : "TBD"],
                      ["End", endTime ? fmtDate(endTime) : "TBD"],
                      ["Currency", "USDC"],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-gray-50 rounded-xl p-4"><p className="text-gray-500 mb-1">{k}</p><p className="font-bold">{v}</p></div>
                    ))}
                  </div>

                  {project.phases.length > 0 && (
                    <div>
                      <h3 className="font-bold text-text mb-4">Sale Phases</h3>
                      <div className="space-y-4">
                        {project.phases.map((phase) => {
                          const status = getPhaseStatus(phase);
                          const allocation = Number(phase.allocation);
                          const phaseSoldPct = 0; // TODO: wire per-phase sold data when API supports it
                          const phaseSold = Math.round(allocation * phaseSoldPct / 100);
                          return (
                            <div
                              key={phase.id}
                              className={cn(
                                "rounded-2xl border p-5 transition-all",
                                status === "active"
                                  ? "border-darkAqua/30 bg-darkAqua/[0.03] shadow-sm"
                                  : "border-gray-100 bg-gray-50/50"
                              )}
                            >
                              {/* Header row */}
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2.5">
                                  <span className={cn(
                                    "w-3 h-3 rounded-full border-2 flex-shrink-0",
                                    status === "active" ? "bg-darkAqua border-darkAqua" : status === "upcoming" ? "bg-white border-blue-400" : "bg-gray-300 border-gray-300"
                                  )} />
                                  <span className="font-semibold text-sm text-text">
                                    Phase {phase.phase_number}: {phase.name}
                                  </span>
                                  {phase.whitelist_only && (
                                    <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Whitelist</span>
                                  )}
                                </div>
                                <Badge
                                  variant={status === "active" ? "active" : status === "upcoming" ? "default" : "outline"}
                                  size="sm"
                                  className={cn(
                                    status === "upcoming" && "bg-blue-50 text-blue-600 border-blue-200",
                                    status === "ended" && "bg-gray-100 text-gray-500 border-gray-200"
                                  )}
                                >
                                  {status === "active" ? "Active" : status === "upcoming" ? "Upcoming" : "Ended"}
                                </Badge>
                              </div>

                              {/* Details grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                                <div>
                                  <p className="text-gray-500 text-xs mb-0.5">Price</p>
                                  <p className="font-semibold">{formatCurrency(parseFloat(phase.price_per_token))}/token</p>
                                </div>
                                <div>
                                  <p className="text-gray-500 text-xs mb-0.5">Allocation</p>
                                  <p className="font-semibold">{allocation.toLocaleString()}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500 text-xs mb-0.5">Min Buy</p>
                                  <p className="font-semibold">{formatCurrency(parseFloat(phase.min_contribution))}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500 text-xs mb-0.5">Max. Allocation</p>
                                  <p className="font-semibold">{formatCurrency(parseFloat(phase.max_contribution))}</p>
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="mb-3">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                  <span>{phaseSoldPct}% sold ({phaseSold.toLocaleString()}/{allocation.toLocaleString()})</span>
                                </div>
                                <ProgressBar value={phaseSoldPct} size="sm" animated={status === "active"} />
                              </div>

                              {/* Date range + countdown */}
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>
                                  {status === "upcoming" ? "Starts" : "Started"}: {fmtDate(new Date(phase.start_time))}
                                  {" — "}
                                  Ends: {fmtDate(new Date(phase.end_time))}
                                </span>
                                {status === "active" && (
                                  <span className="inline-flex items-center gap-1 text-darkAqua font-medium">
                                    <Clock className="h-3 w-3" />
                                    {getTimeRemaining(phase.end_time)}
                                  </span>
                                )}
                                {status === "upcoming" && (
                                  <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                                    <Clock className="h-3 w-3" />
                                    {getTimeUntilStart(phase.start_time)}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {token && (
                    <div className="bg-gray-50 rounded-xl p-4 text-sm">
                      <h4 className="font-bold mb-2">On-Chain Info</h4>
                      <p><span className="text-gray-500">Total Supply:</span> <span className="font-medium">{Number(token.total_supply).toLocaleString()}</span></p>
                      <p><span className="text-gray-500">Decimals:</span> <span className="font-medium">{token.decimals}</span></p>
                      {token.is_paused && <p className="text-amber-600 font-medium mt-1">Token transfers paused</p>}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "OTC & Bank" && saleRaw?.otc_enabled && (
                <div className="prose prose-sm max-w-none">
                  {saleRaw.otc_content ? (
                    <div dangerouslySetInnerHTML={{ __html: saleRaw.otc_content }} />
                  ) : (
                    <p className="text-gray-400 text-center py-8">OTC & Bank Transfer instructions coming soon.</p>
                  )}
                </div>
              )}

              {activeTab === "Documents" && (
                <div className="space-y-3">
                  {documents.length === 0 && <p className="text-gray-400 text-center py-8">No documents available yet.</p>}
                  {documents.map((d) => (
                    <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-darkAqua" />
                        <div><p className="font-medium text-sm">{d.name}</p><p className="text-xs text-gray-400 capitalize">{d.document_type}</p></div>
                      </div>
                      <Download className="h-4 w-4 text-gray-400" />
                    </a>
                  ))}
                </div>
              )}
              {activeTab === "Team" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {team.length === 0 && <p className="text-gray-400 text-center py-8 col-span-2">Team information coming soon.</p>}
                  {team.map((m) => (
                    <div key={m.id} className="flex gap-4 p-4 rounded-xl bg-gray-50">
                      <div className="w-14 h-14 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                        {m.photo_url ? <Image src={m.photo_url} alt={m.name} width={56} height={56} className="object-cover w-full h-full" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg font-bold">{m.name[0]}</div>}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm">{m.name}</p>
                        <p className="text-xs text-darkAqua mb-1">{m.title}</p>
                        {m.bio && <p className="text-xs text-gray-500 line-clamp-3">{m.bio}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === "FAQ" && (
                <div className="space-y-2">
                  {faqs.length === 0 && <p className="text-gray-400 text-center py-8">No FAQs available yet.</p>}
                  {faqs.map((f) => (
                    <div key={f.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      <button onClick={() => setOpenFaq(openFaq === f.id ? null : f.id)} className="w-full flex items-center justify-between px-5 py-4 text-left">
                        <span className="font-medium text-sm">{f.question}</span>
                        {openFaq === f.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </button>
                      {openFaq === f.id && <div className="px-5 pb-4 text-sm text-gray-600">{f.answer}</div>}
                    </div>
                  ))}
                </div>
              )}
              {(activeTab === "My Position" || activeTab === "Transactions") && (
                <div className="bg-gray-50 rounded-xl p-10 text-center"><p className="text-gray-400 font-medium">Coming soon</p></div>
              )}
            </div>
          </main>

        </div>
      </div>
      <Footer />

      {/* Login/Register Dialog */}
      {showLoginDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowLoginDialog(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text mb-2">Sign in to invest</h3>
            <p className="text-sm text-gray-500 mb-6">
              You need to be signed in and KYC-verified to purchase tokens. Create an account or sign in to continue.
            </p>
            <div className="space-y-3">
              <Link href={`/login?redirect=/invest/${project.slug}`} className="block w-full btn-cta py-3 rounded-xl transition-colors text-center">
                Sign In
              </Link>
              <Link href={`/register?redirect=/invest/${project.slug}`} className="block w-full bg-white text-black font-semibold py-3 rounded-xl border border-black/20 hover:bg-gray-50 transition-colors text-center">
                Create Account
              </Link>
              <button onClick={() => setShowLoginDialog(false)} className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors py-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
