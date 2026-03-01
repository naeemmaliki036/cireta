"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FileText,
  Users,
  Calendar,
  Shield,
  ExternalLink,
  TrendingUp,
  Clock,
} from "lucide-react";
import { Badge, ProgressBar } from "@/components/atoms";
import { PhaseCard, StatCard } from "@/components/molecules";
import { Navbar, Footer, InvestSidebar } from "@/components/organisms";
import { formatCurrency } from "@/lib/utils";

const MOCK_PROJECT = {
  id: "1",
  title: "West African Gold Reserve",
  slug: "west-african-gold",
  description:
    "Tokenized ownership of certified gold reserves in West Africa. Each token represents fractional ownership of physical gold bullion stored in secure vaults, verified through Chainlink Proof of Reserve.",
  imageUrl: "",
  assetType: "Gold",
  tokenSymbol: "WAGR",
  pricePerToken: 100,
  minContribution: 100,
  maxContribution: 50000,
  currentRaised: 2450000,
  targetAmount: 5000000,
  investorCount: 847,
  issuer: {
    name: "Sahara Gold Holdings",
    jurisdiction: "Switzerland",
  },
  phases: [
    {
      phaseNumber: 1,
      name: "Private Sale",
      pricePerToken: 80,
      allocation: 1000000,
      minContribution: 10000,
      maxContribution: 100000,
      startTime: new Date("2024-01-01"),
      endTime: new Date("2024-02-01"),
      isActive: false,
      isCompleted: true,
      soldAmount: 1000000,
    },
    {
      phaseNumber: 2,
      name: "Public Sale",
      pricePerToken: 100,
      allocation: 4000000,
      minContribution: 100,
      maxContribution: 50000,
      startTime: new Date("2024-02-15"),
      endTime: new Date("2024-04-15"),
      isActive: true,
      isCompleted: false,
      soldAmount: 1450000,
    },
  ],
  documents: [
    { name: "Whitepaper", url: "#" },
    { name: "Legal Framework", url: "#" },
    { name: "Audit Report", url: "#" },
  ],
};

export default function ProjectDetailPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const project = MOCK_PROJECT;
  const progress = (project.currentRaised / project.targetAmount) * 100;

  return (
    <div className="min-h-screen bg-box">
      <Navbar variant="light" />

      {/* Hero */}
      <section className="bg-darkBlack pt-24 pb-12 px-4">
        <div className="max-w-inner mx-auto">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Explore
          </Link>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Image */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full lg:w-1/2 aspect-video rounded-3xl overflow-hidden bg-darkAqua flex items-center justify-center"
            >
              {project.imageUrl ? (
                <Image
                  src={project.imageUrl}
                  alt={project.title}
                  width={800}
                  height={450}
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg
                  width="80"
                  height="80"
                  viewBox="0 0 40 40"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M20 2L22.5 17.5L38 20L22.5 22.5L20 38L17.5 22.5L2 20L17.5 17.5L20 2Z"
                    fill="white"
                  />
                </svg>
              )}
            </motion.div>

            {/* Info */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1"
            >
              <div className="flex items-center gap-3 mb-4">
                <Badge variant="glass">{project.assetType}</Badge>
                <Badge variant="active">Active</Badge>
              </div>

              <h1 className="text-xxl font-semibold text-white -tracking-[1.44px] mb-4">
                {project.title}
              </h1>

              <p className="text-white/60 mb-6">
                by {project.issuer.name} • {project.issuer.jurisdiction}
              </p>

              {/* Progress */}
              <div className="bg-white/10 rounded-2xl p-6 mb-6">
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-white/60">Funding Progress</span>
                  <span className="font-semibold text-white">
                    {progress.toFixed(1)}%
                  </span>
                </div>
                <ProgressBar value={progress} size="lg" />
                <div className="flex justify-between text-white mt-3">
                  <div>
                    <p className="text-white/60 text-sm">Raised</p>
                    <p className="text-xl font-bold">
                      {formatCurrency(project.currentRaised)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/60 text-sm">Target</p>
                    <p className="text-xl font-bold">
                      {formatCurrency(project.targetAmount)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-darkAqua">
                    {project.investorCount}
                  </p>
                  <p className="text-white/60 text-sm">Investors</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-darkAqua">
                    {formatCurrency(project.pricePerToken)}
                  </p>
                  <p className="text-white/60 text-sm">Per Token</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-darkAqua">
                    {project.tokenSymbol}
                  </p>
                  <p className="text-white/60 text-sm">Symbol</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-12 px-4">
        <div className="max-w-inner mx-auto">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main Content */}
            <div className="flex-1">
              {/* Tabs */}
              <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
                {["overview", "phases", "documents", "team"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-6 py-3 rounded-xl font-medium capitalize transition-colors whitespace-nowrap ${
                      activeTab === tab
                        ? "bg-darkAqua text-white"
                        : "bg-white text-gray-500 hover:text-text"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeTab === "overview" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div className="bg-white rounded-3xl p-8 border border-darkBlack/10">
                    <h2 className="text-xl font-semibold text-text mb-4">
                      About This Project
                    </h2>
                    <p className="text-gray-600 leading-relaxed">
                      {project.description}
                    </p>
                  </div>

                  <div className="bg-white rounded-3xl p-8 border border-darkBlack/10">
                    <h2 className="text-xl font-semibold text-text mb-6">
                      Key Features
                    </h2>
                    <div className="grid md:grid-cols-2 gap-4">
                      {[
                        {
                          icon: Shield,
                          title: "ERC-3643 Compliant",
                          description: "Fully regulated security token",
                        },
                        {
                          icon: TrendingUp,
                          title: "Chainlink PoR",
                          description: "Real-time proof of reserves",
                        },
                        {
                          icon: Users,
                          title: "KYC Required",
                          description: "Verified investors only",
                        },
                        {
                          icon: Clock,
                          title: "12-Month Vesting",
                          description: "Linear vesting schedule",
                        },
                      ].map((feature) => (
                        <div
                          key={feature.title}
                          className="flex items-start gap-4 p-4 rounded-xl bg-box"
                        >
                          <div className="w-10 h-10 rounded-full bg-darkAqua/10 flex items-center justify-center flex-shrink-0">
                            <feature.icon className="h-5 w-5 text-darkAqua" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-text">
                              {feature.title}
                            </h3>
                            <p className="text-sm text-gray-500">
                              {feature.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === "phases" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  {project.phases.map((phase) => (
                    <PhaseCard key={phase.phaseNumber} {...phase} />
                  ))}
                </motion.div>
              )}

              {activeTab === "documents" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-3xl p-8 border border-darkBlack/10"
                >
                  <h2 className="text-xl font-semibold text-text mb-6">
                    Project Documents
                  </h2>
                  <div className="space-y-3">
                    {project.documents.map((doc) => (
                      <a
                        key={doc.name}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-4 rounded-xl bg-box hover:bg-darkAqua/5 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-darkAqua" />
                          <span className="font-medium">{doc.name}</span>
                        </div>
                        <ExternalLink className="h-4 w-4 text-gray-400" />
                      </a>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === "team" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-3xl p-8 border border-darkBlack/10"
                >
                  <h2 className="text-xl font-semibold text-text mb-6">
                    Issuer Information
                  </h2>
                  <div className="space-y-4">
                    <div className="flex justify-between py-3 border-b border-darkBlack/5">
                      <span className="text-gray-500">Company Name</span>
                      <span className="font-semibold">
                        {project.issuer.name}
                      </span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-darkBlack/5">
                      <span className="text-gray-500">Jurisdiction</span>
                      <span className="font-semibold">
                        {project.issuer.jurisdiction}
                      </span>
                    </div>
                    <div className="flex justify-between py-3">
                      <span className="text-gray-500">Verification Status</span>
                      <Badge variant="success">Verified</Badge>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Invest Sidebar */}
            <div className="w-full lg:w-[400px]">
              <InvestSidebar
                projectName={project.title}
                tokenSymbol={project.tokenSymbol}
                pricePerToken={project.pricePerToken}
                minContribution={project.minContribution}
                maxContribution={project.maxContribution}
                currentRaised={project.currentRaised}
                targetAmount={project.targetAmount}
                isKYCVerified={false}
                kycLevel={0}
                requiredKYCLevel={2}
                isWalletConnected={false}
                onInvest={async () => {}}
                onConnectWallet={() => {}}
                onStartKYC={() => {}}
              />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
