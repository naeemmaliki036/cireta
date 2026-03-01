"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowLeft, FileText, Users, Shield, ExternalLink, TrendingUp, Clock } from "lucide-react";
import { Badge, ProgressBar, Spinner } from "@/components/atoms";
import { PhaseCard } from "@/components/molecules";
import { Navbar, Footer, InvestSidebar } from "@/components/organisms";
import { formatCurrency } from "@/lib/utils";
import { getProject, type Project } from "@/lib/api/repositories/projects.repository";

export default function ProjectDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try { setProject(await getProject(slug)); }
      catch { setError(true); }
      finally { setIsLoading(false); }
    }
    if (slug) load();
  }, [slug]);

  if (isLoading) return <div className="min-h-screen bg-box flex items-center justify-center"><Spinner size="xl" /></div>;
  if (error || !project) return <NotFound />;

  const progress = project.targetAmount > 0 ? (project.currentRaised / project.targetAmount) * 100 : 0;
  const activePhase = project.phases?.find((p) => p.is_active);
  const pricePerToken = activePhase ? parseFloat(activePhase.price_per_token) : 0;
  const minContrib = activePhase ? parseFloat(activePhase.min_contribution) : 0;
  const maxContrib = activePhase ? parseFloat(activePhase.max_contribution) : 0;

  return (
    <div className="min-h-screen bg-box">
      <Navbar variant="light" />
      <HeroSection project={project} progress={progress} pricePerToken={pricePerToken} />
      <ContentSection project={project} activeTab={activeTab} setActiveTab={setActiveTab}
        pricePerToken={pricePerToken} minContrib={minContrib} maxContrib={maxContrib} />
      <Footer />
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen bg-box">
      <Navbar variant="light" />
      <div className="flex flex-col items-center justify-center py-40">
        <h1 className="text-2xl font-bold text-text mb-2">Project Not Found</h1>
        <Link href="/explore" className="text-darkAqua font-semibold hover:underline">Back to Explore</Link>
      </div>
    </div>
  );
}

function HeroSection({ project, progress, pricePerToken }: { project: Project; progress: number; pricePerToken: number }) {
  return (
    <section className="bg-darkBlack pt-24 pb-12 px-4">
      <div className="max-w-inner mx-auto">
        <Link href="/explore" className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" />Back to Explore
        </Link>
        <div className="flex flex-col lg:flex-row gap-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            className="w-full lg:w-1/2 aspect-video rounded-3xl overflow-hidden bg-darkAqua flex items-center justify-center">
            {project.imageUrl ? <Image src={project.imageUrl} alt={project.title} width={800} height={450} className="w-full h-full object-cover" /> : (
              <svg width="80" height="80" viewBox="0 0 40 40" fill="none"><path d="M20 2L22.5 17.5L38 20L22.5 22.5L20 38L17.5 22.5L2 20L17.5 17.5L20 2Z" fill="white" /></svg>
            )}
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <Badge variant="glass">{project.assetType}</Badge>
              <Badge variant="active">{project.status}</Badge>
            </div>
            <h1 className="text-xxl font-semibold text-white -tracking-[1.44px] mb-4">{project.title}</h1>
            <p className="text-white/60 mb-6">by {project.issuer.name}</p>
            <div className="bg-white/10 rounded-2xl p-6 mb-6">
              <div className="flex justify-between text-sm mb-3">
                <span className="text-white/60">Funding Progress</span>
                <span className="font-semibold text-white">{progress.toFixed(1)}%</span>
              </div>
              <ProgressBar value={progress} size="lg" />
              <div className="flex justify-between text-white mt-3">
                <div><p className="text-white/60 text-sm">Raised</p><p className="text-xl font-bold">{formatCurrency(project.currentRaised)}</p></div>
                <div className="text-right"><p className="text-white/60 text-sm">Target</p><p className="text-xl font-bold">{formatCurrency(project.targetAmount)}</p></div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white/10 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-darkAqua">{project.investorCount}</p><p className="text-white/60 text-sm">Investors</p></div>
              <div className="bg-white/10 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-darkAqua">{formatCurrency(pricePerToken)}</p><p className="text-white/60 text-sm">Per Token</p></div>
              <div className="bg-white/10 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-darkAqua">{project.tokenSymbol}</p><p className="text-white/60 text-sm">Symbol</p></div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ContentSection({ project, activeTab, setActiveTab, pricePerToken, minContrib, maxContrib }: {
  project: Project; activeTab: string; setActiveTab: (t: string) => void;
  pricePerToken: number; minContrib: number; maxContrib: number;
}) {
  const tabs = ["overview", "phases", "documents", "team"];
  return (
    <section className="py-12 px-4">
      <div className="max-w-inner mx-auto flex flex-col lg:flex-row gap-8">
        <div className="flex-1">
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
            {tabs.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 rounded-xl font-medium capitalize transition-colors whitespace-nowrap ${activeTab === tab ? "bg-darkAqua text-white" : "bg-white text-gray-500 hover:text-text"}`}>
                {tab}
              </button>
            ))}
          </div>
          {activeTab === "overview" && <OverviewTab project={project} />}
          {activeTab === "phases" && <PhasesTab project={project} />}
          {activeTab === "documents" && <DocumentsTab />}
          {activeTab === "team" && <TeamTab project={project} />}
        </div>
        <div className="w-full lg:w-[400px]">
          <InvestSidebar projectName={project.title} tokenSymbol={project.tokenSymbol}
            pricePerToken={pricePerToken} minContribution={minContrib} maxContribution={maxContrib}
            currentRaised={project.currentRaised} targetAmount={project.targetAmount}
            isKYCVerified={false} kycLevel={0} requiredKYCLevel={2}
            isWalletConnected={false} onInvest={async () => {}} onConnectWallet={() => {}} onStartKYC={() => {}} />
        </div>
      </div>
    </section>
  );
}

function OverviewTab({ project }: { project: Project }) {
  const features = [
    { icon: Shield, title: "ERC-3643 Compliant", desc: "Fully regulated security token" },
    { icon: TrendingUp, title: "Chainlink PoR", desc: "Real-time proof of reserves" },
    { icon: Users, title: "KYC Required", desc: "Verified investors only" },
    { icon: Clock, title: "Vesting Schedule", desc: "Linear token vesting" },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="bg-white rounded-3xl p-8 border border-darkBlack/10">
        <h2 className="text-xl font-semibold text-text mb-4">About This Project</h2>
        <p className="text-gray-600 leading-relaxed">{project.description || "Project details coming soon."}</p>
      </div>
      <div className="bg-white rounded-3xl p-8 border border-darkBlack/10">
        <h2 className="text-xl font-semibold text-text mb-6">Key Features</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {features.map((f) => (
            <div key={f.title} className="flex items-start gap-4 p-4 rounded-xl bg-box">
              <div className="w-10 h-10 rounded-full bg-darkAqua/10 flex items-center justify-center shrink-0">
                <f.icon className="h-5 w-5 text-darkAqua" />
              </div>
              <div><h3 className="font-semibold text-text">{f.title}</h3><p className="text-sm text-gray-500">{f.desc}</p></div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function PhasesTab({ project }: { project: Project }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {project.phases.map((p) => (
        <PhaseCard key={p.phase_number} phaseNumber={p.phase_number} name={p.name}
          pricePerToken={parseFloat(p.price_per_token)} allocation={parseFloat(p.allocation)}
          minContribution={parseFloat(p.min_contribution)} maxContribution={parseFloat(p.max_contribution)}
          startTime={new Date(p.start_time)} endTime={new Date(p.end_time)}
          isActive={p.is_active} isCompleted={!p.is_active} soldAmount={0} />
      ))}
    </motion.div>
  );
}

function DocumentsTab() {
  const docs = [{ name: "Whitepaper", url: "#" }, { name: "Legal Framework", url: "#" }, { name: "Audit Report", url: "#" }];
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-8 border border-darkBlack/10">
      <h2 className="text-xl font-semibold text-text mb-6">Project Documents</h2>
      <div className="space-y-3">
        {docs.map((d) => (
          <a key={d.name} href={d.url} className="flex items-center justify-between p-4 rounded-xl bg-box hover:bg-darkAqua/5 transition-colors">
            <div className="flex items-center gap-3"><FileText className="h-5 w-5 text-darkAqua" /><span className="font-medium">{d.name}</span></div>
            <ExternalLink className="h-4 w-4 text-gray-400" />
          </a>
        ))}
      </div>
    </motion.div>
  );
}

function TeamTab({ project }: { project: Project }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-8 border border-darkBlack/10">
      <h2 className="text-xl font-semibold text-text mb-6">Issuer Information</h2>
      <div className="space-y-4">
        <div className="flex justify-between py-3 border-b border-darkBlack/5">
          <span className="text-gray-500">Company Name</span><span className="font-semibold">{project.issuer.name}</span>
        </div>
        <div className="flex justify-between py-3"><span className="text-gray-500">Verification Status</span><Badge variant="success">Verified</Badge></div>
      </div>
    </motion.div>
  );
}
