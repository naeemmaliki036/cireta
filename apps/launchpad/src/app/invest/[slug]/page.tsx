"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits } from "viem";
import { Button } from "@/components/atoms";
import { Navbar, Footer } from "@/components/organisms";
import {
  InvestAmountStep,
  InvestApproveStep,
  InvestConfirmStep,
  InvestSuccessStep,
  USDC_ADDRESS,
  ERC20_APPROVE_ABI,
  type InvestStep,
} from "@/components/organisms/InvestFlow";
import { getProject, getSaleRawBySlug } from "@/lib/api/repositories/projects.repository";
import { contribute } from "@/lib/api/repositories/sales";
import type { Project } from "@/lib/api/repositories/projects.repository";
import { Spinner } from "@/components/atoms";
import { getAccessToken } from "@/lib/api/client";

const STEPS = ["amount", "approve", "confirm"] as const;

export default function InvestPage() {
  const params = useParams<{ slug: string }>();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [project, setProject] = useState<Project | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<InvestStep>("amount");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Wagmi: USDC approve
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApproving,
  } = useWriteContract();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  // Wagmi: no contract needed for contribute — it's an API call after approval

  // Load project data
  useEffect(() => {
    if (!params.slug) return;
    (async () => {
      try {
        const [proj, raw] = await Promise.all([
          getProject(params.slug),
          getSaleRawBySlug(params.slug),
        ]);
        setProject(proj);
        setSaleId(raw.id);
      } catch {
        setError("Project not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.slug]);

  // When approve tx confirms, advance to confirm step
  useEffect(() => {
    if (approveConfirmed) setStep("confirm");
  }, [approveConfirmed]);

  const numericAmount = parseFloat(amount) || 0;
  const activePhase = project?.phases.find((p) => p.is_active) ?? project?.phases[0] ?? null;
  const pricePerToken = activePhase ? parseFloat(activePhase.price_per_token) : 0;
  const tokensToReceive = pricePerToken > 0 ? numericAmount / pricePerToken : 0;
  const _rawAddr = (project as unknown as { contract_address?: string | null })?.contract_address;
  const saleContractAddress: `0x${string}` = (_rawAddr?.startsWith("0x") ? _rawAddr as `0x${string}` : null) ?? USDC_ADDRESS;

  const handleApprove = useCallback(() => {
    if (!saleContractAddress) return;
    setError(null);
    try {
      writeApprove({
        address: USDC_ADDRESS,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [saleContractAddress, parseUnits(amount, 6)], // USDC = 6 decimals
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    }
  }, [writeApprove, saleContractAddress, amount]);

  const handleConfirm = useCallback(async () => {
    if (!saleId || !activePhase) return;
    setError(null);
    try {
      const token = getAccessToken();
      if (!token) { setError("Please log in first"); return; }
      const res = await contribute(saleId, { phase_id: activePhase.id, amount }, token);
      setTxHash(res.tx_hash);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contribution failed");
    }
  }, [saleId, activePhase, amount]);

  if (loading) {
    return (
      <div className="min-h-screen bg-box flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-box">
        <Navbar variant="light" />
        <div className="pt-32 text-center">
          <p className="text-xl text-darkBlack/50">{error ?? "Project not found"}</p>
          <Link href="/explore" className="text-darkAqua underline mt-4 block">Back to Explore</Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-box">
      <Navbar variant="light" />
      <div className="pt-32 pb-20 px-4">
        <div className="max-w-xl mx-auto">
          {step !== "success" && (
            <Link
              href={`/project/${project.slug}`}
              className="inline-flex items-center gap-2 text-darkBlack/50 hover:text-text transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Project
            </Link>
          )}
          {/* Progress bar */}
          {step !== "success" && (
            <div className="mb-8 flex items-center justify-between relative">
              {STEPS.map((s, i) => (
                <div key={s} className="flex flex-col items-center z-10">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    step === s ? "bg-darkAqua text-white"
                      : i < STEPS.indexOf(step as (typeof STEPS)[number]) ? "bg-green-500 text-white"
                      : "bg-darkBlack/10 text-darkBlack/50"
                  }`}>
                    {i < STEPS.indexOf(step as (typeof STEPS)[number])
                      ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                  </div>
                  <span className="text-xs mt-2 text-darkBlack/50 capitalize">{s}</span>
                </div>
              ))}
              <div className="absolute top-5 left-0 right-0 h-0.5 bg-darkBlack/10 -z-0">
                <div className="h-full bg-green-500 transition-all"
                  style={{ width: `${STEPS.indexOf(step as (typeof STEPS)[number]) * 50}%` }}/>
              </div>
            </div>
          )}
          <motion.div key={step} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 border border-darkBlack/10">
            {step === "amount" && (
              <InvestAmountStep
                project={project} activePhase={activePhase}
                amount={amount} onAmountChange={setAmount}
                onContinue={() => setStep("approve")}
                isConnected={isConnected} onConnect={() => openConnectModal?.()}
              />
            )}
            {step === "approve" && (
              <InvestApproveStep
                amount={numericAmount} isLoading={isApproving}
                error={error} onApprove={handleApprove}
              />
            )}
            {step === "confirm" && (
              <InvestConfirmStep
                project={project} amount={numericAmount}
                tokensToReceive={tokensToReceive} isLoading={false}
                error={error} onConfirm={handleConfirm}
              />
            )}
            {step === "success" && (
              <InvestSuccessStep
                project={project} amount={numericAmount}
                tokensToReceive={tokensToReceive} txHash={txHash}
              />
            )}
          </motion.div>
          {step === "success" && (
            <div className="mt-6 space-y-3 max-w-xl mx-auto">
              <Link href="/portfolio"><Button variant="primary" className="w-full" size="lg">View Portfolio</Button></Link>
              <Link href="/explore"><Button variant="outline" className="w-full" size="lg">Explore More</Button></Link>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
