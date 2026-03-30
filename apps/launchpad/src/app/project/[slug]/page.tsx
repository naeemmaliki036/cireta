"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft, CheckCircle2, Users, ShoppingBag, FolderOpen, Coins,
  FileText, ChevronDown, ChevronUp, Download,
} from "lucide-react";
import { Badge, Spinner, ProgressBar } from "@/components/atoms";
import { cn, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { getProject, getSaleRawBySlug, type Project, type SaleRaw } from "@/lib/api/repositories/projects.repository";
import { getToken, type Token } from "@/lib/api/repositories/tokens";
import { apiGet } from "@/lib/api/client";

/* ---------- types for sale content endpoints ---------- */
interface SaleImage { id: string; url: string; caption?: string; is_banner?: boolean; sort_order?: number }
interface SaleDocument { id: string; name: string; document_type: string; url: string }
interface TeamMember { id: string; name: string; title: string; bio?: string; photo_url?: string }
interface FAQ { id: string; question: string; answer: string }
const SIDEBAR_LINKS = [
  { href: "/explore", label: "Sales", icon: ShoppingBag },
  { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
];

const BASE_TABS = ["Overview", "Sale", "Documents", "Team", "FAQ", "My Position", "Transactions"] as const;
const ALL_TABS = ["Overview", "Sale", "OTC & Bank", "Documents", "Team", "FAQ", "My Position", "Transactions"] as const;
type Tab = (typeof ALL_TABS)[number];

export default function ProjectDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { isAuthenticated } = useAuth();

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

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [proj, raw] = await Promise.all([getProject(slug), getSaleRawBySlug(slug)]);
        setProject(proj); setSaleRaw(raw);
        if (raw.token_id) getToken(raw.token_id).then(setToken).catch(() => {});
        const sid = raw.id;
        apiGet<SaleImage[]>(`/api/v1/sales/${sid}/images`).then(setImages).catch(() => {});
        apiGet<SaleDocument[]>(`/api/v1/sales/${sid}/documents`).then(setDocuments).catch(() => {});
        apiGet<TeamMember[]>(`/api/v1/sales/${sid}/team`).then(setTeam).catch(() => {});
        apiGet<FAQ[]>(`/api/v1/sales/${sid}/faqs`).then(setFaqs).catch(() => {});
      } catch { setError(true); }
      finally { setIsLoading(false); }
    }
    if (slug) load();
  }, [slug]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="xl" /></div>;
  if (error || !project) return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <h1 className="text-2xl font-bold mb-2">Project Not Found</h1>
      <Link href="/explore" className="text-darkAqua font-semibold hover:underline">Back to Sales</Link>
    </div>
  );
  const ap = project.phases?.find((p) => p.is_active) ?? project.phases?.[0] ?? null;
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
  const statusColor: Record<string, string> = { active: "text-green-600", upcoming: "text-blue-600", completed: "text-gray-500", paused: "text-amber-600" };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-48 border-r border-gray-100 flex-col p-4 sticky top-0 h-screen">
        <Link href="/" className="flex items-center mb-8">
          <Image src="/images/logo/cireta-colored.png" alt="Cireta" width={120} height={32} className="h-8 w-auto" />
        </Link>
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
        <header className="sticky top-0 z-20 bg-white border-b border-gray-100 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Link href="/explore" className="hover:text-text">Sales</Link>
              <span>/</span>
              <span className="text-text font-medium truncate">{project.title}</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/verify" className="inline-flex items-center gap-1.5 border border-gray-200 rounded-full px-4 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors">
                <CheckCircle2 className="h-3.5 w-3.5" /> Get Verified
              </Link>
              {!isAuthenticated && (
                <Link href="/register" className="inline-flex items-center gap-1.5 bg-darkBlack text-white rounded-full px-4 py-1.5 text-xs font-medium hover:bg-darkBlack/90 transition-colors">
                  <Users className="h-3.5 w-3.5" /> Register
                </Link>
              )}
            </div>
          </div>
        </header>
        <div className="flex">
          {/* Left column */}
          <main className="flex-1 min-w-0 max-w-4xl">
            {/* Banner + gallery */}
            <div className="relative">
              <div className="relative h-[340px] overflow-hidden">
                <Image src={gallery[selectedImage]?.url ?? bannerImg} alt={project.title} fill className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <Link href="/explore" className="absolute top-4 left-4 inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium z-10">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Link>
                <div className="absolute bottom-4 left-6 z-10">
                  <p className="text-white/60 text-xs mb-1">{project.issuer.name}</p>
                  <h1 className="text-2xl font-bold text-white">{project.title}</h1>
                </div>
              </div>
              {gallery.length > 1 && (
                <div className="flex gap-2 px-6 py-3 overflow-x-auto">
                  {gallery.map((img, i) => (
                    <button key={img.id} onClick={() => setSelectedImage(i)} className={cn("relative w-16 h-12 rounded-lg overflow-hidden border-2 flex-shrink-0", i === selectedImage ? "border-darkAqua" : "border-transparent opacity-60 hover:opacity-100")}>
                      <Image src={img.url} alt={img.caption ?? ""} fill className="object-cover" />
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
            <div className="border-b border-gray-100 px-6">
              <div className="flex gap-1 overflow-x-auto py-2">
                {(saleRaw?.otc_enabled ? ALL_TABS : BASE_TABS).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors", activeTab === tab ? "bg-darkBlack text-white" : "text-gray-500 hover:bg-gray-100 hover:text-text")}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            {/* Tab content */}
            <div className="p-6">
              {activeTab === "Overview" && (
                <div className="space-y-6">
                  {(saleRaw as unknown as Record<string, unknown>)?.full_description ? (
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: (saleRaw as unknown as Record<string, unknown>).full_description as string }} />
                  ) : (
                    <p className="text-gray-600 leading-relaxed">{project.description || "Project details coming soon."}</p>
                  )}
                  <div className="bg-gray-50 rounded-xl p-5">
                    <h3 className="font-bold text-text mb-3 text-sm">Token Details</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[["Name", project.title], ["Ticker", project.tokenSymbol], ["Asset Type", project.assetType], ["Blockchain", "Base L2"]].map(([k, v]) => (
                        <div key={k}><span className="text-gray-500">{k}</span><p className="font-medium capitalize">{v}</p></div>
                      ))}
                      {token?.contract_address && <div className="col-span-2"><span className="text-gray-500">Contract</span><p className="font-medium font-mono text-xs">{token.contract_address}</p></div>}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "Sale" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    {[["Soft Cap", `${formatCurrency(softCap)} USDC`], ["Hard Cap", `${formatCurrency(hardCap)} USDC`], ["Token Price", `${formatCurrency(pricePerToken)} USDC`], ["Start", startTime ? fmtDate(startTime) : "TBD"], ["End", endTime ? fmtDate(endTime) : "TBD"], ["Currency", "USDC"]].map(([k, v]) => (
                      <div key={k} className="bg-gray-50 rounded-xl p-4"><p className="text-gray-500 mb-1">{k}</p><p className="font-bold">{v}</p></div>
                    ))}
                  </div>
                  {project.phases.length > 0 && (
                    <div>
                      <h3 className="font-bold text-text mb-3">Sale Phases</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b border-gray-100 text-left text-gray-500">
                            <th className="pb-2 font-medium">Phase</th><th className="pb-2 font-medium">Price</th><th className="pb-2 font-medium">Allocation</th><th className="pb-2 font-medium">Min/Max</th><th className="pb-2 font-medium">Period</th><th className="pb-2 font-medium">Status</th>
                          </tr></thead>
                          <tbody>
                            {project.phases.map((p) => (
                              <tr key={p.id} className="border-b border-gray-50">
                                <td className="py-3 font-medium">{p.name}</td>
                                <td className="py-3">{formatCurrency(parseFloat(p.price_per_token))}</td>
                                <td className="py-3">{Number(p.allocation).toLocaleString()}</td>
                                <td className="py-3">{formatCurrency(parseFloat(p.min_contribution))} - {formatCurrency(parseFloat(p.max_contribution))}</td>
                                <td className="py-3 text-xs">{fmtDate(new Date(p.start_time))} - {fmtDate(new Date(p.end_time))}</td>
                                <td className="py-3">{p.is_active ? <Badge variant="active" size="sm">Active</Badge> : <span className="text-gray-400">--</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {token && (
                    <div className="bg-gray-50 rounded-xl p-4 text-sm">
                      <h4 className="font-bold mb-2">Vault Token Info</h4>
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

          {/* Right sidebar - funding stats */}
          <aside className="hidden xl:block w-80 border-l border-gray-100 p-5 sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-darkAqua/10 flex items-center justify-center"><Coins className="h-4 w-4 text-darkAqua" /></div>
                <div><p className="font-bold text-sm">{formatCurrency(raised)} USDC</p><p className="text-xs text-gray-500">raised of {formatCurrency(hardCap)}</p></div>
              </div>
              <ProgressBar value={progressPct} className="h-2" />
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", project.status === "active" ? "bg-green-500" : "bg-gray-400")} />
                <span className={cn("text-xs font-semibold capitalize", statusColor[project.status] ?? "text-gray-500")}>{project.status}</span>
              </div>
              <div className="space-y-3 text-sm">
                {[...(endTime ? [["Ends", fmtDate(endTime)]] : []), ["Min. Buy", `${formatCurrency(minContrib)} USDC`], ["Max. Buy", `${formatCurrency(maxContrib)} USDC`], ["Token Price", `${formatCurrency(pricePerToken)} USDC`], ["Currency", "USDC"]].map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="font-medium">{v}</span></div>
                ))}
              </div>
              <button className="w-full bg-darkBlack text-white font-semibold py-3 rounded-xl hover:bg-darkBlack/90 transition-colors">Buy Now</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
