"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Radio, Sparkles, CheckCircle2, TrendingUp,
  ArrowRight, Bell, ShoppingBag, FolderOpen,
} from "lucide-react";
import { Navbar, Footer } from "@/components/organisms";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  getProjects,
  type Project,
} from "@/lib/api/repositories/projects.repository";

// Coming Soon projects now fetched from API (APPROVED_COMING_SOON status)

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".ogg"];

function isVideoUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

function PlaceholderCover({ title, assetType }: { title: string; assetType: string }) {
  const at = assetType.toLowerCase();
  const gradient = at.includes("gold")
    ? "from-[#C9913D] via-[#A87B2F] to-[#8B6914]"
    : at.includes("copper")
    ? "from-[#B87333] via-[#9A5E27] to-[#7D4E1F]"
    : at.includes("steel") || at.includes("iron")
    ? "from-[#6B7280] via-[#4B5563] to-[#374151]"
    : "from-[#13636F] via-[#0f5460] to-[#0a3d45]";

  return (
    <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`}>
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
      <div className="absolute bottom-4 left-4 right-4">
        <p className="text-white/50 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Cireta RWA</p>
        <p className="text-white/80 text-sm font-semibold truncate">{title}</p>
      </div>
    </div>
  );
}

function ProjectMedia({ src, alt, fill, className, assetType }: { src: string; alt: string; fill?: boolean; className?: string; assetType?: string }) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return <PlaceholderCover title={alt} assetType={assetType ?? "commodity"} />;
  }

  if (isVideoUrl(src)) {
    return (
      <video
        src={src}
        muted
        autoPlay
        loop
        playsInline
        className={cn(className, fill && "absolute inset-0 w-full h-full")}
        style={fill ? { objectFit: "cover" } : undefined}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      className={className}
      onError={() => setError(true)}
    />
  );
}

const SIDEBAR_LINKS = [
  { href: "/projects", label: "Sales", icon: ShoppingBag },
  { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
];

function ActiveProjectCard({ project }: { project: Project }) {
  const raised = project.currentRaised || 0;
  const hardCap = project.targetAmount || 1;
  const progress = hardCap > 0 ? Math.round((raised / hardCap) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-card transition-shadow">
      <div className="relative h-72 overflow-hidden rounded-2xl m-3">
        <ProjectMedia src={project.imageUrl} alt={project.title} fill className="object-cover rounded-2xl" assetType={project.assetType} />
        <div className="absolute top-4 left-4 flex items-center gap-2">
          {(() => {
            const now = Date.now();
            const ap = project.phases.find((p) => {
              const s = new Date(p.start_time || 0).getTime();
              const e = new Date(p.end_time || 0).getTime();
              return now >= s && now < e;
            });
            return ap ? (
              <>
                <span className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-medium">
                  <span className="w-2 h-2 rounded-full bg-darkAqua animate-pulse" />
                  on going
                </span>
                <span className="inline-flex items-center bg-darkAqua/90 backdrop-blur-sm rounded-full px-3 py-1.5 text-xs font-semibold text-white">
                  {ap.name}
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-medium text-black/50">
                <span className="w-2 h-2 rounded-full bg-black/30" />
                {project.phases.every((p) => now >= new Date(p.end_time || 0).getTime()) ? "Completed" : "Upcoming"}
              </span>
            );
          })()}
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-5">
          <h3 className="text-white font-semibold text-base flex items-center gap-1.5">
            {project.title} <CheckCircle2 className="h-4 w-4 text-white/70" />
          </h3>
        </div>
      </div>
      <div className="px-5 pb-5 pt-2 space-y-4">
        <p className="text-sm text-gray-500 line-clamp-2">{project.description || "Buy verified tokenized real-world assets backed by institutional issuers."}</p>
        {project.phases.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {project.phases.map((p) => {
              const now = Date.now();
              const start = new Date(p.start_time || 0).getTime();
              const end = new Date(p.end_time || 0).getTime();
              const status = now < start ? "upcoming" : now >= end ? "ended" : "active";
              const minBuy = parseFloat(p.min_contribution);
              return (
                <div key={p.id || p.name} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border ${
                  status === "active" ? "bg-darkAqua/10 border-darkAqua/20 text-darkAqua" :
                  status === "ended" ? "bg-black/5 border-black/10 text-black/40" :
                  "bg-box border-black/10 text-black/50"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    status === "active" ? "bg-darkAqua animate-pulse" : status === "ended" ? "bg-black/30" : "bg-black/20"
                  }`} />
                  <span className="font-medium">{p.name}</span>
                  {status === "active" && minBuy > 0 && <span className="text-darkAqua/60">· Min ${minBuy >= 1000 ? `${(minBuy/1000).toFixed(0)}K` : minBuy.toLocaleString()}</span>}
                  {status === "ended" && <span>· Ended</span>}
                  {status === "upcoming" && <span>· Coming Soon</span>}
                </div>
              );
            })}
          </div>
        )}
        {raised > 0 && <div>
          <div className="flex justify-between text-sm text-gray-500 mb-1.5">
            <span>Funding progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-darkAqua rounded-full" style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        </div>}
        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Target</p>
            <p className="text-lg font-bold">{hardCap >= 1_000_000 ? `${(hardCap / 1_000_000).toFixed(hardCap % 1_000_000 === 0 ? 0 : 1)}M USDC` : `${hardCap.toLocaleString()} USDC`}</p>
          </div>
          <Link href={`/project/${project.slug}`} className="inline-flex items-center gap-2 btn-cta text-sm px-5 py-2.5 rounded-full transition-colors">
            View Details <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ComingSoonCard({ project }: { project: Project }) {
  return (
    <Link href={`/project/${project.slug}`} className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-card transition-shadow flex flex-col h-full">
      <div className="relative h-64 overflow-hidden rounded-2xl m-3">
        <ProjectMedia src={project.imageUrl} alt={project.title} fill className="object-cover rounded-2xl" assetType={project.assetType} />
        <div className="absolute top-4 left-4">
          <span className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-medium">
            Coming soon
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-5">
          <h3 className="text-white font-semibold text-base">{project.title}</h3>
        </div>
      </div>
      <div className="px-5 pb-5 pt-2 flex flex-col flex-1">
        <p className="text-sm text-gray-500 line-clamp-2 flex-1">{project.description || "Upcoming purchase opportunity — details coming soon."}</p>
        <span className="w-full inline-flex items-center justify-center gap-2 btn-cta text-sm px-5 py-3 rounded-full transition-colors mt-4">
          View Details <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

export default function ExplorePage() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getProjects({ size: 20 });
        setProjects(data.items);
      } catch { /* use empty */ }
      finally { setLoading(false); }
    })();
  }, []);

  const now = Date.now();
  const activeProjects = projects
    .filter((p) => !p.isComingSoon && p.status !== "completed")
    .sort((a, b) => {
      const hasActive = (p: typeof a) => p.phases.some((ph) => {
        const s = new Date(ph.start_time || 0).getTime();
        const e = new Date(ph.end_time || 0).getTime();
        return now >= s && now < e;
      });
      return (hasActive(a) ? 0 : 1) - (hasActive(b) ? 0 : 1);
    });
  const comingSoonProjects = projects.filter((p) => p.isComingSoon);
  const completedProjects = projects.filter((p) => p.status === "completed");

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar variant="light" />

      <div className="flex pt-16 flex-1">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-44 border-r border-gray-100 flex-col p-4 sticky top-16 h-[calc(100vh-4rem)]">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 px-2">Buyer</p>
          <nav className="space-y-1">
            {SIDEBAR_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive ? "bg-gray-100 text-text" : "text-gray-500 hover:bg-gray-50 hover:text-text"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <main className="p-6">
          {/* Active Opportunities */}
          <section className="mb-14">
            <div className="flex items-center gap-3 mb-1">
              <Radio className="h-6 w-6 text-darkAqua" />
              <h2 className="text-2xl font-bold text-text">Active Opportunities</h2>
            </div>
            <p className="text-sm text-gray-500 ml-9 mb-8">Live purchase opportunities ready for funding</p>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {[1, 2].map((i) => (
                  <div key={i} className="rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                    <div className="h-56 bg-gray-100" />
                    <div className="p-5 space-y-3">
                      <div className="h-4 bg-gray-100 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 rounded w-1/2" />
                      <div className="h-2 bg-gray-100 rounded-full w-full mt-4" />
                      <div className="flex justify-between pt-2">
                        <div className="h-8 bg-gray-100 rounded w-24" />
                        <div className="h-8 bg-gray-100 rounded-full w-20" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : activeProjects.length === 0 ? (
              <p className="text-gray-400 text-sm ml-9">No active opportunities at the moment.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {activeProjects.map((p) => (
                  <ActiveProjectCard key={p.id} project={p} />
                ))}
              </div>
            )}
          </section>

          {/* Coming Soon */}
          <section>
            <div className="flex items-center gap-3 mb-1">
              <Sparkles className="h-6 w-6 text-gray-400" />
              <h2 className="text-2xl font-bold text-text">Coming Soon</h2>
            </div>
            <p className="text-sm text-gray-500 ml-9 mb-8">Upcoming opportunities - be the first to know when to launch</p>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                    <div className="h-44 bg-gray-100" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-gray-100 rounded w-2/3" />
                      <div className="h-3 bg-gray-100 rounded w-1/2" />
                      <div className="h-8 bg-gray-100 rounded-xl w-full mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : comingSoonProjects.length === 0 ? (
              <p className="text-gray-400 text-sm ml-9">No upcoming projects at the moment.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {comingSoonProjects.map((p) => (
                  <ComingSoonCard key={p.id} project={p} />
                ))}
              </div>
            )}
          </section>

          {/* Completed Sales */}
          {!loading && completedProjects.length > 0 && (
            <section className="mt-14">
              <div className="flex items-center gap-3 mb-1">
                <CheckCircle2 className="h-6 w-6 text-gray-400" />
                <h2 className="text-2xl font-bold text-text">Completed</h2>
                <span className="text-sm font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                  {completedProjects.length} Sale{completedProjects.length !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-sm text-gray-500 ml-9 mb-8">Previously funded projects</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {completedProjects.map((p) => (
                  <ComingSoonCard key={p.id} project={p} />
                ))}
              </div>
            </section>
          )}
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
