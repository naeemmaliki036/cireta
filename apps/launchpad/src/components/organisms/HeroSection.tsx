"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export function HeroSection() {
  return (
    <section className="relative bg-black w-full overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-black/90 to-darkAqua/30" />
      <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-darkAqua/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-darkAqua/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex items-center justify-center flex-col min-h-[75vh] mx-auto max-w-[990px] px-4 text-center text-white pt-28 pb-16">
        <motion.div initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 1, scale: 1 }}
          whileInView={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}>
          <svg width="60" height="60" viewBox="0 0 40 40" className="mb-8" fill="none">
            <path d="M20 2L22.5 17.5L38 20L22.5 22.5L20 38L17.5 22.5L2 20L17.5 17.5L20 2Z" fill="#13636F" />
          </svg>
        </motion.div>

        <h1 className="text-xxl md:text-2xl font-semibold tracking-tight mb-9 animate-fade-in">
          Unlock Global Commodity Investment Through RWA Tokenization
        </h1>

        <p className="text-sm md:text-base font-semibold text-white/75 mb-[60px] max-w-2xl animate-fade-in">
          Fully regulated ERC-3643 security tokens for gold, copper, and commodity futures.
          Institutional-grade compliance with ONCHAINID.
        </p>

        <div className="flex items-center gap-6">
          <Link href="/projects"
            className="inline-flex items-center justify-center rounded-full py-5 px-10 text-base font-semibold bg-[#13636F] text-white hover:bg-[#13636F]/90 transition-all duration-300 shadow-lg">
            Explore Projects
          </Link>
          <button className="inline-flex items-center justify-center gap-2.5 rounded-full py-5 px-10 text-base font-semibold border-2 border-white/60 text-white hover:border-white hover:bg-white/10 transition-all duration-300">
            Watch Demo
          </button>
        </div>
      </div>
    </section>
  );
}
