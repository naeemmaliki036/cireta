"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits } from "viem";
import { Button } from "@/components/atoms";
import { Navbar, Footer } from "@/components/organisms";
import {
  InvestAmountStep,
  InvestApproveStep,
  InvestConfirmStep,
  InvestSuccessStep,
  ERC20_APPROVE_ABI,
  type InvestStep,
} from "@/components/organisms/InvestFlow";
import { getProject, getSaleRawBySlug } from "@/lib/api/repositories/projects.repository";
import { contribute } from "@/lib/api/repositories/sales";
import type { Project } from "@/lib/api/repositories/projects.repository";
import { Spinner } from "@/components/atoms";
// Auth token handled by httpOnly cookie via proxy — no manual token needed
import { SALE_ABI } from "@/lib/contracts/saleAbi";
import { getUsdcAddress, getTxUrl } from "@/lib/contracts/addresses";

/**
 * Map common Sale contract revert reasons to user-friendly messages.
 */
const REVERT_MESSAGES: Record<string, string> = {
  "KYC required": "Your wallet is not KYC-verified. Please complete identity verification first.",
  "not whitelisted": "Your wallet is not whitelisted for this sale phase.",
  "below min": "Amount is below the minimum contribution for this phase.",
  "exceeds max": "Amount exceeds the maximum contribution limit.",
  "exceeds hard cap": "This contribution would exceed the sale's hard cap.",
  "phase not started": "This sale phase has not started yet.",
  "phase ended": "This sale phase has ended.",
  "exceeds allocation": "This phase's token allocation is fully subscribed.",
  "exceeds block limit": "Too many contributions in this block. Please try again shortly.",
  "invalid phase": "Invalid sale phase.",
};

function parseRevertReason(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  // Check for known revert reasons in the error message
  for (const [key, value] of Object.entries(REVERT_MESSAGES)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) return value;
  }
  if (msg.includes("User rejected") || msg.includes("user rejected")) {
    return "Transaction was rejected in your wallet.";
  }
  if (msg.includes("insufficient funds")) {
    return "Insufficient USDC balance.";
  }
  return "Transaction failed. Please try again.";
}

const STEPS = ["amount", "approve", "confirm"] as const;

export default function InvestPage() {
  const params = useParams<{ slug: string }>();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { openConnectModal } = useConnectModal();

  const [project, setProject] = useState<Project | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [saleOtcEnabled, setSaleOtcEnabled] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"crypto" | "otc" | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<InvestStep>("amount");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isContributing, setIsContributing] = useState(false);

  const usdcAddress = getUsdcAddress(chainId);

  // Wagmi: USDC approve
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApproving,
  } = useWriteContract();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  // Wagmi: Sale.contribute() on-chain
  const {
    writeContract: writeContribute,
    data: contributeTxHash,
    isPending: isContributePending,
    error: contributeError,
  } = useWriteContract();

  const {
    isSuccess: contributeConfirmed,
    isLoading: isContributeConfirming,
  } = useWaitForTransactionReceipt({
    hash: contributeTxHash,
  });

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
        setSaleOtcEnabled(raw.otc_enabled ?? false);
        // If OTC is not enabled, auto-select crypto
        if (!raw.otc_enabled) setPaymentMethod("crypto");
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

  // When on-chain contribute confirms, record in backend then show success
  useEffect(() => {
    if (!contributeConfirmed || !contributeTxHash || !saleId) return;
    const hash = contributeTxHash;
    setTxHash(hash);

    // Record contribution in backend (non-blocking for UX — tx is already on-chain)
    (async () => {
      try {
        await contribute(saleId, { phase_id: "", amount, tx_hash: hash });
      } catch {
        // Backend recording can be retried later; on-chain tx is the source of truth
      }
      setIsContributing(false);
      setStep("success");
    })();
  }, [contributeConfirmed, contributeTxHash, saleId, amount]);

  // Handle contribute error
  useEffect(() => {
    if (contributeError) {
      setError(parseRevertReason(contributeError));
      setIsContributing(false);
    }
  }, [contributeError]);

  const numericAmount = parseFloat(amount) || 0;
  const activePhase = project?.phases.find((p) => p.is_active) ?? project?.phases[0] ?? null;
  const pricePerToken = activePhase ? parseFloat(activePhase.price_per_token) : 0;
  const tokensToReceive = pricePerToken > 0 ? numericAmount / pricePerToken : 0;
  const _rawAddr = (project as unknown as { contract_address?: string | null })?.contract_address;
  const saleContractAddress: `0x${string}` | null =
    typeof _rawAddr === "string" && /^0x[0-9a-fA-F]{40}$/.test(_rawAddr)
      ? (_rawAddr as `0x${string}`)
      : null;

  // Determine the active phase index (0-based, for on-chain call)
  const activePhaseIndex = project?.phases.findIndex((p) => p.is_active) ?? 0;

  const handleApprove = useCallback(() => {
    if (!saleContractAddress) {
      setError("Sale contract not deployed yet.");
      return;
    }
    setError(null);
    try {
      writeApprove({
        address: usdcAddress,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [saleContractAddress, parseUnits(amount, 6)], // USDC = 6 decimals
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    }
  }, [writeApprove, saleContractAddress, usdcAddress, amount]);

  const handleConfirm = useCallback(() => {
    if (!saleContractAddress || !activePhase) return;
    setError(null);
    setIsContributing(true);
    try {
      writeContribute({
        address: saleContractAddress,
        abi: SALE_ABI,
        functionName: "contribute",
        args: [
          BigInt(activePhaseIndex >= 0 ? activePhaseIndex : 0),
          parseUnits(amount, 6), // USDC = 6 decimals
        ],
      });
    } catch (err) {
      setError(parseRevertReason(err));
      setIsContributing(false);
    }
  }, [writeContribute, saleContractAddress, activePhase, activePhaseIndex, amount]);

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
          <Link href="/projects" className="text-darkAqua underline mt-4 block">Back to Explore</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const confirmLoading = isContributing || isContributePending || isContributeConfirming;

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
          <motion.div key={paymentMethod ?? "choose"} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 border border-darkBlack/10">
            {/* Payment Method Selector — shown when OTC is enabled and method not yet chosen */}
            {saleOtcEnabled && !paymentMethod && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-text text-center">How would you like to invest?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => setPaymentMethod("crypto")}
                    className="p-6 rounded-2xl border-2 border-darkBlack/10 hover:border-darkAqua transition-colors text-left space-y-2"
                  >
                    <span className="text-2xl">&#x1F4B0;</span>
                    <h3 className="font-semibold text-text">On-Chain (USDC)</h3>
                    <p className="text-sm text-gray-500">Pay with USDC from your connected wallet. Instant settlement on Base.</p>
                  </button>
                  <button
                    onClick={() => setPaymentMethod("otc")}
                    className="p-6 rounded-2xl border-2 border-darkBlack/10 hover:border-darkAqua transition-colors text-left space-y-2"
                  >
                    <span className="text-2xl">&#x1F3E6;</span>
                    <h3 className="font-semibold text-text">OTC & Bank Transfer</h3>
                    <p className="text-sm text-gray-500">Pay via wire transfer or OTC allocation. Suitable for larger investments.</p>
                  </button>
                </div>
              </div>
            )}

            {/* OTC Info Card — shown when OTC method is selected */}
            {paymentMethod === "otc" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-text">OTC & Bank Transfer</h2>
                <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100 space-y-3">
                  <p className="text-sm text-gray-700">
                    This sale accepts investments via bank wire transfer and OTC allocation.
                    Review the full instructions on the project page.
                  </p>
                  <a
                    href={`/project/${params.slug}#otc`}
                    onClick={(e) => { e.preventDefault(); window.history.back(); }}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-darkAqua hover:underline"
                  >
                    View OTC & Bank Instructions on Project Page &#x2192;
                  </a>
                </div>
                <div className="p-4 rounded-xl bg-gray-50 text-sm space-y-2">
                  <p className="font-medium text-text">For large allocations ($50,000+)</p>
                  <p className="text-gray-500">Contact our OTC desk directly for preferential pricing and dedicated support.</p>
                  <p className="font-medium text-darkAqua">otc@cireta.com</p>
                </div>
                <button
                  onClick={() => setPaymentMethod(null)}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  &#x2190; Back to payment options
                </button>
              </div>
            )}

            {/* Crypto flow — existing steps */}
            {paymentMethod === "crypto" && step === "amount" && (
              <InvestAmountStep
                project={project} activePhase={activePhase}
                amount={amount} onAmountChange={setAmount}
                onContinue={() => setStep("approve")}
                isConnected={isConnected} onConnect={() => openConnectModal?.()}
              />
            )}
            {paymentMethod === "crypto" && step === "approve" && (
              <InvestApproveStep
                amount={numericAmount} isLoading={isApproving}
                error={error} onApprove={handleApprove}
              />
            )}
            {paymentMethod === "crypto" && step === "confirm" && (
              <InvestConfirmStep
                project={project} amount={numericAmount}
                tokensToReceive={tokensToReceive} isLoading={confirmLoading}
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
              {txHash && (
                <a href={getTxUrl(chainId, txHash)} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full" size="lg">View on BaseScan</Button>
                </a>
              )}
              <Link href="/portfolio"><Button variant="primary" className="w-full" size="lg">View Portfolio</Button></Link>
              <Link href="/projects"><Button variant="outline" className="w-full" size="lg">Explore More</Button></Link>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
