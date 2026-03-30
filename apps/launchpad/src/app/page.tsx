"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Star, HeartHandshake, ShieldCheck, Users, TrendingUp, Bookmark, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Navbar, Footer } from "@/components/organisms";
import { getProjects, type Project } from "@/lib/api/repositories/projects.repository";

const PLACEHOLDER_PROJECTS = [
  { image: "/images/projects/gold-ghana.png", title: "Wassa Gold Mine in Ghana", description: "Wassa Gold offers a unique chance to buy certified Ghanaian gold reserves at up to 30%...", investors: 1000, roi: "11-22%", progress: 68, investFrom: "6.5M USDC" },
  { image: "/images/projects/copper-tanzania.png", title: "Copper Cathode from Tanzania", description: "Wassa Gold offers a unique chance to buy certified Ghanaian gold reserves at up to 30%...", investors: 1257, roi: "15-20%", progress: 74, investFrom: "2.5M USDC" },
  { image: "/images/projects/gold-drc.png", title: "Gold From DRC", description: "Wassa Gold offers a unique chance to buy certified Ghanaian gold reserves at up to 30%...", investors: 1257, roi: "15-20%", progress: 74, investFrom: "8.5M USDC" },
  { image: "/images/projects/copper-drc.png", title: "Copper Cathode from DRC", description: "Wassa Gold offers a unique chance to buy certified Ghanaian gold reserves at up to 30%...", investors: 1257, roi: "15-20%", progress: 74, investFrom: "2.5M USDC" },
];

const FEATURES = [
  { icon: Star, title: "Highly Curated Portfolio", description: "Browse our highly curated selection of high-value commodities\u2014each verified and backed by A&M Development Group\u2019s 189+ years of expertise." },
  { icon: HeartHandshake, title: "White-Glove Support", description: "From selection to final delivery, our team is with you every step\u2014handling logistics, legal documentation, and updates with concierge-level care." },
  { icon: ShieldCheck, title: "Fully Verified Partnerships", description: "We work with leading banks, auditors, and legal firms to ensure every transaction is transparent, compliant, and verifiable\u2014so you can invest with complete confidence." },
];

function ProjectCard({ image, title, description, investors, roi, progress, investFrom }: typeof PLACEHOLDER_PROJECTS[0]) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-card transition-shadow">
      {/* Image */}
      <div className="relative h-48 overflow-hidden">
        <Image src={image} alt={title} fill className="object-cover" />
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-darkAqua animate-pulse" />
            on going
          </span>
        </div>
        <button className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-colors">
          <Bookmark className="h-4 w-4 text-gray-600" />
        </button>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          <h3 className="text-white font-semibold text-sm flex items-center gap-1">
            {title} <CheckCircle2 className="h-3.5 w-3.5 text-white/70" />
          </h3>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <p className="text-xs text-gray-500 line-clamp-2">{description}</p>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1 text-gray-600">
            <Users className="h-3 w-3" /> {investors.toLocaleString()} Investors
          </span>
          <span className="flex items-center gap-1 text-gray-600">
            <TrendingUp className="h-3 w-3" /> {roi} ROI
          </span>
        </div>

        {/* Progress */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Funding progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-darkAqua rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Bottom */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-[10px] text-gray-400 uppercase">Invest From</p>
            <p className="text-sm font-bold">{investFrom}</p>
          </div>
          <Link href="/projects" className="inline-flex items-center gap-1.5 bg-darkBlack text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-darkBlack/90 transition-colors">
            Invest <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await getProjects({ size: 4 });
        setProjects(data.items);
      } catch { /* use placeholders */ }
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
            className="absolute inset-0 w-full h-full object-cover opacity-50"
          >
            <source src="/images/hero-bg.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-darkBlack/40 via-darkAqua/10 to-darkBlack/70" />
        </div>

        {/* Star watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
          <svg width="400" height="400" viewBox="0 0 40 40" fill="none">
            <path d="M20 2L22.5 17.5L38 20L22.5 22.5L20 38L17.5 22.5L2 20L17.5 17.5L20 2Z" fill="#13636F" />
          </svg>
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

          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {PLACEHOLDER_PROJECTS.map((p, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <ProjectCard {...p} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What Makes Us Different ── */}
      <section className="py-20 px-4 bg-white">
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
                className="bg-box rounded-2xl p-8 hover:shadow-card transition-shadow"
              >
                <div className="w-10 h-10 rounded-lg bg-darkBlack flex items-center justify-center mb-20">
                  <f.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-text mb-3">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Jump on Board ── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-inner mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-text tracking-tight mb-4">Jump on board. It&apos;s simple.</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              We blend strategy with creativity to craft designs that deliver real impact. Our focus is on purposeful experiences that drive results and stand out with clarity.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              { step: "Connect ~ 1", desc: "Sign up easily and securely to start your investment journey" },
              { step: "Verify ~ 2", desc: "Follow a few simple steps to get yourself verified" },
              { step: "Invest ~ 3", desc: "Choose from a variety of tokenized assets and invest with just a click" },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-box rounded-2xl p-6 min-h-[280px] flex flex-col"
              >
                <h3 className="text-lg font-bold text-text mb-2">{s.step}</h3>
                <p className="text-sm text-gray-500">{s.desc}</p>
                <div className="flex-1" />
                {/* Placeholder for UI preview */}
                <div className="mt-6 h-24 bg-white rounded-xl border border-gray-200" />
              </motion.div>
            ))}
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
