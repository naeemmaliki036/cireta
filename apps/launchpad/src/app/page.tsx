"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Star, HeartHandshake, ShieldCheck, Users, TrendingUp, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Navbar, Footer } from "@/components/organisms";
import { getProjects, type Project } from "@/lib/api/repositories/projects.repository";


const FEATURES = [
  { icon: Star, title: "Highly Curated Portfolio", description: "Browse our highly curated selection of high-value commodities\u2014each verified and backed by A&M Development Group\u2019s 189+ years of expertise." },
  { icon: HeartHandshake, title: "White-Glove Support", description: "From selection to final delivery, our team is with you every step\u2014handling logistics, legal documentation, and updates with concierge-level care." },
  { icon: ShieldCheck, title: "Fully Verified Partnerships", description: "We work with leading banks, auditors, and legal firms to ensure every transaction is transparent, compliant, and verifiable\u2014so you can invest with complete confidence." },
];

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
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium">
            <span className={`w-1.5 h-1.5 rounded-full ${p.isComingSoon ? "bg-amber-400" : "bg-darkAqua animate-pulse"}`} />
            {p.isComingSoon ? "coming soon" : "on going"}
          </span>
          {!p.isComingSoon && p.fundingRound && (
            <span className="inline-flex items-center bg-darkAqua/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-[10px] font-semibold text-white">
              {p.fundingRound}
            </span>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          <h3 className="text-white font-semibold text-sm flex items-center gap-1">
            {p.title} <CheckCircle2 className="h-3.5 w-3.5 text-white/70" />
          </h3>
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <p className="text-xs text-gray-500 line-clamp-2 mb-3">{p.description || "Invest in tokenized real-world assets."}</p>
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
            <span className="inline-flex items-center gap-1.5 bg-darkBlack text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-darkBlack/90 transition-colors">
              View Details <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getProjects({ size: 4 });
        setProjects(data.items);
      } catch { /* empty */ }
      finally { setLoadingProjects(false); }
    })();
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar variant="dark" />

      {/* ── Hero ── */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        {/* Video Background */}
        <div className="absolute inset-0 bg-darkBlack">
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            className="absolute inset-0 w-full h-full object-cover opacity-50"
          >
            <source src="/images/hero-bg.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-darkBlack/40 via-darkAqua/10 to-darkBlack/70" />
        </div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative z-10 text-center px-4"
        >
          <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight mb-6">
            Build Unshakeable Wealth
          </h1>
          <p className="text-lg md:text-xl text-white/70 mb-10">
            Invest in Assets that stand the test of time!
          </p>
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 bg-white text-darkBlack font-semibold px-8 py-3.5 rounded-full hover:bg-white/90 transition-colors text-sm"
          >
            Explore Projects <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </section>

      {/* ── Our Projects ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-inner mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Our Projects</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              We take pride in crafting digital products that combine strategy, creativity, and precision. Each project reflects our focus on delivering user-centered design and impactful experiences that drive real results for businesses and users alike.
            </p>
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 bg-darkBlack text-white font-semibold px-6 py-2.5 rounded-full mt-6 text-sm hover:bg-darkBlack/90 transition-colors"
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
        </div>
      </section>

      {/* ── More Projects (if more than 4) ── */}
      {projects.length > 4 && (
        <section className="py-20 px-4 bg-box">
          <div className="max-w-inner mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-text tracking-tight mb-4">More Opportunities</h2>
              <p className="text-gray-500 max-w-2xl mx-auto">
                Real-time investment opportunities in tokenized commodities — fully regulated, transparent, and backed by verified issuers.
              </p>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 bg-darkBlack text-white font-semibold px-6 py-2.5 rounded-full mt-6 text-sm hover:bg-darkBlack/90 transition-colors"
              >
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {projects.slice(4, 8).map((p, i) => (
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
          </div>
        </section>
      )}

      {/* ── What Makes Us Different ── */}
      <section className="py-20 px-4 bg-box">
        <div className="max-w-inner mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-text tracking-tight mb-4">What Makes Us Different?</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              We blend strategy with creativity to craft designs that deliver real impact. Our focus is on purposeful experiences that drive results and stand out with clarity.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative bg-white rounded-2xl p-8 border border-gray-100 hover:shadow-card hover:border-darkAqua/20 transition-all group overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-darkAqua to-darkAqua/40 scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                <div className="w-12 h-12 rounded-xl bg-darkAqua/10 flex items-center justify-center mb-6">
                  <f.icon className="h-6 w-6 text-darkAqua" />
                </div>
                <h3 className="text-lg font-bold text-text mb-3">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 px-4 bg-white" id="how-it-works">
        <div className="max-w-inner mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Jump on board. It&apos;s simple.</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Three straightforward steps to start investing in tokenized real-world assets backed by verified issuers.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                num: "01",
                title: "Sign Up",
                desc: "Create your account in seconds with just your email. No passwords needed — we use secure one-time codes.",
                icon: Users,
                iconBg: "bg-darkAqua/10",
                iconColor: "text-darkAqua",
              },
              {
                num: "02",
                title: "Verify",
                desc: "Complete a quick identity check (KYC) to comply with regulations. It usually takes under 5 minutes.",
                icon: ShieldCheck,
                iconBg: "bg-emerald-50",
                iconColor: "text-emerald-600",
              },
              {
                num: "03",
                title: "Invest",
                desc: "Browse curated commodity-backed tokens and invest on-chain with crypto or via bank transfer.",
                icon: TrendingUp,
                iconBg: "bg-amber-50",
                iconColor: "text-amber-600",
              },
            ].map((s, i) => (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="relative bg-white rounded-2xl p-8 border border-gray-100 group hover:shadow-card hover:border-gray-200 transition-all overflow-hidden"
              >
                <span className="absolute top-5 right-6 text-6xl font-black text-gray-50 group-hover:text-darkAqua/5 transition-colors select-none">{s.num}</span>
                <div className={`w-12 h-12 rounded-xl ${s.iconBg} flex items-center justify-center mb-6`}>
                  <s.icon className={`h-6 w-6 ${s.iconColor}`} />
                </div>
                <h3 className="text-xl font-bold text-text mb-3">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-darkBlack text-white font-semibold px-8 py-3 rounded-full text-sm hover:bg-darkBlack/90 transition-colors"
            >
              Get Started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Funding The Future ── */}
      <section className="relative py-32 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-darkBlack">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          >
            <source src="/images/hero-bg.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-darkAqua/30 via-darkBlack/60 to-darkBlack/90" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">Funding The Future</h2>
            <p className="text-white/60 leading-relaxed">
              If you are interested in tokenizing your assets and exploring the benefits of this innovative technology, please contact us to discuss your specific needs. Our team can provide guidance on the tokenization process, platform selection and regulatory considerations.
            </p>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
