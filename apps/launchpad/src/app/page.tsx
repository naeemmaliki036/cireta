"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Shield, Coins, TrendingUp, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button, Spinner } from "@/components/atoms";
import { ProjectCard } from "@/components/molecules";
import { Navbar, Footer, HeroSection, ComplianceFeatures } from "@/components/organisms";
import { getProjects, type Project } from "@/lib/api/repositories/projects.repository";

const CountUp = dynamic(() => import("react-countup"), { ssr: false, loading: () => <span>0</span> });

const STATS = [
  { value: 2.4, suffix: "B", label: "Assets Tokenized", prefix: "$" },
  { value: 12, suffix: "K+", label: "Investors", prefix: "" },
  { value: 847, suffix: "", label: "Projects", prefix: "" },
  { value: 99.2, suffix: "%", label: "Uptime", prefix: "" },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Complete KYC", description: "Verify your identity through our secure Sumsub integration with ONCHAINID claims.", icon: Shield },
  { step: "02", title: "Browse Projects", description: "Explore tokenized real-world assets from verified institutional issuers.", icon: Coins },
  { step: "03", title: "Invest & Earn", description: "Contribute USDC and receive ERC-3643 security tokens representing ownership.", icon: TrendingUp },
];

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getProjects({ status: "active", size: 6 });
        setProjects(data.items);
      } catch { /* empty */ }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar variant="dark" />
      <HeroSection />

      {/* Stats */}
      <section className="bg-darkAqua py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-inner mx-auto px-4">
          {STATS.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 1 }} whileInView={{ opacity: 1 }}
              viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center text-white">
              <div className="text-1xl font-bold tracking-tight">
                {s.prefix}<CountUp end={s.value} duration={2.5} decimals={s.value % 1 !== 0 ? 1 : 0}
                  enableScrollSpy scrollSpyOnce />{s.suffix}
              </div>
              <div className="text-sm text-white/70 mt-1">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Featured Projects */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-inner mx-auto">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="text-xxl font-semibold text-text tracking-tight">Live Projects</h2>
              <p className="text-gray-500 mt-2">Explore verified tokenized assets from institutional issuers</p>
            </div>
            <Link href="/explore"><Button variant="outline" rightIcon={<ArrowRight className="h-4 w-4" />}>View All</Button></Link>
          </div>
          <div className="grid gap-6 lg:gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {loading ? <div className="col-span-3 flex justify-center py-12"><Spinner /></div>
              : projects.length === 0 ? <p className="col-span-3 text-center text-white/40 py-12">No active sales yet</p>
              : projects.map((p, i) => <ProjectCard key={p.id} {...p} index={i} />)}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-box">
        <div className="max-w-inner mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-xxl font-semibold text-text tracking-tight mb-4">How It Works</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">Start investing in tokenized real-world assets in three simple steps</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <motion.div key={item.step} initial={{ opacity: 1 }} whileInView={{ opacity: 1 }}
                viewport={{ once: true }} whileHover={{ y: -5 }} transition={{ duration: 0.3 }}
                className="bg-white rounded-3xl p-8 border border-darkBlack/10 hover:shadow-card transition-shadow">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-darkAqua/10 flex items-center justify-center">
                    <item.icon className="h-6 w-6 text-darkAqua" />
                  </div>
                  <span className="text-4xl font-bold text-gold">{item.step}</span>
                </div>
                <h3 className="text-xl font-semibold text-text mb-3">{item.title}</h3>
                <p className="text-gray-500">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <ComplianceFeatures />

      {/* CTA */}
      <section className="py-20 px-4 bg-darkAqua">
        <div className="max-w-inner mx-auto text-center">
          <h2 className="text-xxl font-semibold text-white tracking-tight mb-6">Ready to Start Investing?</h2>
          <p className="text-white/70 text-lg mb-10 max-w-2xl mx-auto">
            Join thousands of verified investors accessing tokenized real-world assets on Base L2.
          </p>
          <div className="flex items-center justify-center gap-6">
            <Link href="/register"><Button variant="outlineWhite" size="lg">Create Account</Button></Link>
            <Link href="/explore"><Button variant="outlineWhite" size="lg">Browse Projects</Button></Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
