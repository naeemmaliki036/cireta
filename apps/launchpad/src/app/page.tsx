"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Shield,
  Coins,
  TrendingUp,
  ArrowRight,
  Play,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/atoms";
import { ProjectCard } from "@/components/molecules";
import { Navbar, Footer } from "@/components/organisms";
import CountUp from "react-countup";

const MOCK_PROJECTS = [
  {
    id: "1",
    title: "West African Gold Reserve",
    slug: "west-african-gold",
    imageUrl: "",
    assetType: "Gold",
    fundingRound: "Seed",
    currentRaised: 2450000,
    targetAmount: 5000000,
    investorCount: 847,
  },
  {
    id: "2",
    title: "Chilean Copper Fund",
    slug: "chilean-copper",
    imageUrl: "",
    assetType: "Copper",
    fundingRound: "Series A",
    currentRaised: 8200000,
    targetAmount: 10000000,
    investorCount: 1234,
  },
  {
    id: "3",
    title: "Moroccan Steel Manufacturing",
    slug: "moroccan-steel",
    imageUrl: "",
    assetType: "Futures",
    fundingRound: "Seed",
    currentRaised: 1800000,
    targetAmount: 3500000,
    investorCount: 523,
  },
];

const STATS = [
  { value: 2.4, suffix: "B", label: "Assets Tokenized", prefix: "$" },
  { value: 12, suffix: "K+", label: "Investors", prefix: "" },
  { value: 847, suffix: "", label: "Projects", prefix: "" },
  { value: 99.2, suffix: "%", label: "Uptime", prefix: "" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Complete KYC",
    description:
      "Verify your identity through our secure Sumsub integration with ONCHAINID claims.",
    icon: Shield,
  },
  {
    step: "02",
    title: "Browse Projects",
    description:
      "Explore tokenized real-world assets from verified institutional issuers.",
    icon: Coins,
  },
  {
    step: "03",
    title: "Invest & Earn",
    description:
      "Contribute USDC and receive ERC-3643 security tokens representing ownership.",
    icon: TrendingUp,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Navbar variant="dark" />

      {/* Hero Section - Content visible immediately */}
      <section className="relative bg-darkBlack w-full min-h-screen overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-darkBlack via-darkBlack/90 to-darkAqua/30" />
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-darkAqua/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-gold/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex items-center justify-center flex-col min-h-screen mx-auto max-w-[990px] px-4 text-center text-white pt-32 pb-20">
          {/* Cireta Star - visible immediately */}
          <motion.div
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 1, scale: 1 }}
            whileInView={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            <svg
              width="60"
              height="60"
              viewBox="0 0 40 40"
              className="mb-8"
              fill="none"
            >
              <path
                d="M20 2L22.5 17.5L38 20L22.5 22.5L20 38L17.5 22.5L2 20L17.5 17.5L20 2Z"
                fill="#13636F"
              />
            </svg>
          </motion.div>

          {/* Headline - visible immediately */}
          <h1 className="text-xxl md:text-2xl font-semibold tracking-tight mb-9 animate-fade-in">
            Unlock Global Commodity Investment Through RWA Tokenization
          </h1>

          <p className="text-sm md:text-base font-semibold text-white/75 mb-[60px] max-w-2xl animate-fade-in">
            Fully regulated ERC-3643 security tokens for gold, copper, and
            commodity futures on Base L2. Institutional-grade compliance with
            ONCHAINID.
          </p>

          <div className="flex items-center gap-6 animate-fade-in">
            <Link href="/explore">
              <Button variant="secondary" size="lg">
                Explore Projects
              </Button>
            </Link>
            <Button
              variant="primary"
              size="lg"
              leftIcon={<Play className="h-4 w-4" />}
            >
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-darkAqua py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-inner mx-auto px-4">
          {STATS.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 1, y: 0 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center text-white"
            >
              <div className="text-1xl font-bold tracking-tight">
                {stat.prefix}
                <CountUp end={stat.value} duration={2.5} decimals={stat.value % 1 !== 0 ? 1 : 0} enableScrollSpy scrollSpyOnce />
                {stat.suffix}
              </div>
              <div className="text-sm text-white/70 mt-1">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Featured Projects */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-inner mx-auto">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="text-xxl font-semibold text-text tracking-tight">
                Live Projects
              </h2>
              <p className="text-gray-500 mt-2">
                Explore verified tokenized assets from institutional issuers
              </p>
            </div>
            <Link href="/explore">
              <Button variant="outline" rightIcon={<ArrowRight className="h-4 w-4" />}>
                View All
              </Button>
            </Link>
          </div>

          <div className="grid gap-6 lg:gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {MOCK_PROJECTS.map((project, index) => (
              <ProjectCard key={project.id} {...project} index={index} />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-box">
        <div className="max-w-inner mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-xxl font-semibold text-text tracking-tight mb-4">
              How It Works
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Start investing in tokenized real-world assets in three simple steps
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {HOW_IT_WORKS.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 1, y: 0 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                whileHover={{ y: -5 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-3xl p-8 border border-darkBlack/10 hover:shadow-card transition-shadow"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-darkAqua/10 flex items-center justify-center">
                    <item.icon className="h-6 w-6 text-darkAqua" />
                  </div>
                  <span className="text-4xl font-bold text-gold">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-text mb-3">
                  {item.title}
                </h3>
                <p className="text-gray-500">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-darkBlack text-white">
        <div className="max-w-inner mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-xxl font-semibold tracking-tight mb-6">
                Institutional-Grade
                <span className="text-darkAqua"> Compliance</span>
              </h2>
              <p className="text-white/60 text-lg mb-8">
                Every token on Cireta is a fully compliant ERC-3643 security token
                with built-in transfer restrictions and identity verification.
              </p>

              <div className="space-y-4">
                {[
                  "KYC/AML via Sumsub + ONCHAINID",
                  "Permissioned transfers with compliance modules",
                  "Full audit trail on-chain",
                  "Regulatory reporting capabilities",
                ].map((feature, index) => (
                  <motion.div
                    key={feature}
                    initial={{ opacity: 1, x: 0 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <CheckCircle2 className="h-5 w-5 text-darkAqua flex-shrink-0" />
                    <span className="text-white/80">{feature}</span>
                  </motion.div>
                ))}
              </div>

              <div className="mt-10">
                <Link href="/register">
                  <Button variant="primary" size="lg">
                    Get Started
                  </Button>
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-darkAqua/20 rounded-3xl blur-[60px]" />
              <div className="relative bg-darkBlack/50 border border-white/10 rounded-3xl p-8">
                <div className="grid grid-cols-2 gap-6">
                  {[
                    { label: "Total Value Locked", value: "$2.4B" },
                    { label: "Active Investors", value: "12K+" },
                    { label: "Countries", value: "45+" },
                    { label: "Compliance Rate", value: "100%" },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center p-4">
                      <div className="text-2xl font-bold text-darkAqua mb-1">
                        {stat.value}
                      </div>
                      <div className="text-sm text-white/50">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-darkAqua">
        <div className="max-w-inner mx-auto text-center">
          <h2 className="text-xxl font-semibold text-white tracking-tight mb-6">
            Ready to Start Investing?
          </h2>
          <p className="text-white/70 text-lg mb-10 max-w-2xl mx-auto">
            Join thousands of verified investors accessing tokenized real-world
            assets on Base L2.
          </p>
          <div className="flex items-center justify-center gap-6">
            <Link href="/register">
              <Button variant="secondary" size="lg">
                Create Account
              </Button>
            </Link>
            <Link href="/explore">
              <Button variant="outlineWhite" size="lg">
                Browse Projects
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
