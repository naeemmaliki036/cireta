"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Radio, Sparkles, Bookmark, CheckCircle2, Users, TrendingUp,
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

const SIDEBAR_LINKS = [
  { href: "/projects", label: "Sales", icon: ShoppingBag },
  { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
];

function ActiveProjectCard({ project }: { project: Project }) {
  const image = project.imageUrl || "/images/projects/gold-ghana.png";
  const raised = project.currentRaised || 0;
  const hardCap = project.targetAmount || 1;
  const progress = hardCap > 0 ? Math.round((raised / hardCap) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-card transition-shadow">
      <div className="relative h-72 overflow-hidden rounded-2xl m-3">
        <Image src={image} alt={project.title} fill className="object-cover rounded-2xl" />
        <div className="absolute top-4 left-4">
          <span className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-darkAqua animate-pulse" />
            on going
          </span>
        </div>
        <button className="absolute top-4 right-4 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-colors">
          <Bookmark className="h-4.5 w-4.5 text-gray-600" />
        </button>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-5">
          <h3 className="text-white font-semibold text-base flex items-center gap-1.5">
            {project.title} <CheckCircle2 className="h-4 w-4 text-white/70" />
          </h3>
        </div>
      </div>
      <div className="px-5 pb-5 pt-2 space-y-4">
        <p className="text-sm text-gray-500 line-clamp-2">{project.description || "Invest in verified tokenized real-world assets backed by institutional issuers."}</p>
        <div className="flex items-center gap-5 text-sm">
          <span className="flex items-center gap-1.5 text-gray-600"><Users className="h-4 w-4" /> 1,000 Investors</span>
          <span className="flex items-center gap-1.5 text-gray-600"><TrendingUp className="h-4 w-4" /> 15-20% ROI</span>
        </div>
        <div>
          <div className="flex justify-between text-sm text-gray-500 mb-1.5">
            <span>Funding progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-darkAqua rounded-full" style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Invest From</p>
            <p className="text-lg font-bold">{(raised / 1_000_000).toFixed(1)}M USDC</p>
          </div>
          <Link href={`/project/${project.slug}`} className="inline-flex items-center gap-2 bg-darkBlack text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-darkBlack/90 transition-colors">
            Invest <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ComingSoonCard({ image, title }: { image: string; title: string }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-card transition-shadow">
      <div className="relative h-64 overflow-hidden rounded-2xl m-3">
        <Image src={image} alt={title} fill className="object-cover rounded-2xl" />
        <div className="absolute top-4 left-4">
          <span className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            Coming soon
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-5">
          <h3 className="text-white font-semibold text-base">{title}</h3>
        </div>
      </div>
      <div className="px-5 pb-5 pt-2 space-y-4">
        <p className="text-sm text-gray-500 line-clamp-2">Wassa Gold offers a unique chance to buy certified Ghanaian gold reserves at up to 30% below...</p>
        <button className="w-full inline-flex items-center justify-center gap-2 bg-darkBlack text-white text-sm font-semibold px-5 py-3 rounded-full hover:bg-darkBlack/90 transition-colors">
          <Bell className="h-4 w-4" />
          Notify me
        </button>
      </div>
    </div>
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

  const activeProjects = projects.filter((p) => !p.isComingSoon);
  const comingSoonProjects = projects.filter((p) => p.isComingSoon);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar variant="light" />

      <div className="flex pt-16 flex-1">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-44 border-r border-gray-100 flex-col p-4 sticky top-16 h-[calc(100vh-4rem)]">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 px-2">Investor</p>
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
              <span className="text-sm font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                {activeProjects.length} available
              </span>
            </div>
            <p className="text-sm text-gray-500 ml-9 mb-8">Live investment opportunities ready for funding</p>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {[1, 2].map((i) => (
                  <div key={i} className="h-[520px] bg-gray-50 rounded-2xl animate-pulse" />
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
              <span className="text-sm font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                {comingSoonProjects.length} Projects
              </span>
            </div>
            <p className="text-sm text-gray-500 ml-9 mb-8">Upcoming opportunities - be the first to know when to launch</p>

            {comingSoonProjects.length === 0 ? (
              <p className="text-gray-400 text-sm ml-9">No upcoming projects at the moment.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {comingSoonProjects.map((p) => (
                  <ComingSoonCard key={p.id} image={p.imageUrl || "/images/projects/gold-ghana.png"} title={p.title} />
                ))}
              </div>
            )}
          </section>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
