"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits, formatUnits, zeroAddress } from "viem";
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
import { buy } from "@/lib/api/repositories/sales";
import type { Project } from "@/lib/api/repositories/projects.repository";
import { Spinner } from "@/components/atoms";
// Auth token handled by httpOnly cookie via proxy — no manual token needed
import { SALE_ABI } from "@/lib/contracts/saleAbi";
import { OTC_TOKEN_ABI, SALE_OTC_ABI } from "@/lib/contracts/otcTokenAbi";
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
  const { isConnected, address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const { openConnectModal } = useConnectModal();

  const [project, setProject] = useState<Project | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [saleOtcEnabled, setSaleOtcEnabled] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"crypto" | "otc" | "otc_token" | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<InvestStep>("amount");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isContributing, setIsContributing] = useState(false);

  const usdcAddress = getUsdcAddress(chainId);

  // Derive sale contract address early so hooks can reference it
  const _rawAddr = (project as unknown as { contract_address?: string | null })?.contract_address;
  const saleContractAddress: `0x${string}` | null =
    typeof _rawAddr === "string" && /^0x[0-9a-fA-F]{40}$/.test(_rawAddr)
      ? (_rawAddr as `0x${string}`)
      : null;

  // Read existing USDC allowance — skip approve step if sufficient
  const amountWei = amount ? parseUnits(amount, 6) : BigInt(0);
  const { data: existingAllowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress as `0x${string}`,
    abi: [{ name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
    functionName: "allowance",
    args: connectedAddress && saleContractAddress ? [connectedAddress, saleContractAddress] : undefined,
    query: { enabled: !!connectedAddress && !!saleContractAddress && !!usdcAddress },
  });
  const hasEnoughAllowance = existingAllowance != null && amountWei > 0 && (existingAllowance as bigint) >= amountWei;

  // Wagmi: USDC approve
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApproving,
  } = useWriteContract();

  const { isSuccess: approveConfirmed, isLoading: isApproveConfirming } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  // Wagmi: Sale.buy() on-chain
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

  // Wagmi: OTC token approve
  const {
    writeContract: writeOtcApprove,
    data: otcApproveTxHash,
    isPending: isOtcApproving,
  } = useWriteContract();

  const { isSuccess: otcApproveConfirmed } = useWaitForTransactionReceipt({
    hash: otcApproveTxHash,
  });

  // Wagmi: Sale.buyOTC() on-chain
  const {
    writeContract: writeBuyOtc,
    data: buyOtcTxHash,
    isPending: isBuyOtcPending,
    error: buyOtcError,
  } = useWriteContract();

  const {
    isSuccess: buyOtcConfirmed,
    isLoading: isBuyOtcConfirming,
  } = useWaitForTransactionReceipt({
    hash: buyOtcTxHash,
  });

  // Read OTC token address from sale contract
  const { data: onChainOtcToken } = useReadContract({
    address: saleContractAddress ?? undefined,
    abi: SALE_OTC_ABI,
    functionName: "otcToken",
    query: { enabled: !!saleContractAddress },
  });

  const otcTokenAddress: `0x${string}` | null =
    typeof onChainOtcToken === "string" && onChainOtcToken !== zeroAddress
      ? (onChainOtcToken as `0x${string}`)
      : null;

  // Read OTC token balance of connected wallet
  const { data: otcBalance, refetch: refetchOtcBalance } = useReadContract({
    address: otcTokenAddress ?? undefined,
    abi: OTC_TOKEN_ABI,
    functionName: "balanceOf",
    args: connectedAddress ? [connectedAddress] : undefined,
    query: { enabled: !!otcTokenAddress && !!connectedAddress },
  });

  // Read OTC token decimals
  const { data: otcDecimals } = useReadContract({
    address: otcTokenAddress ?? undefined,
    abi: OTC_TOKEN_ABI,
    functionName: "decimals",
    query: { enabled: !!otcTokenAddress },
  });

  // Read OTC token symbol
  const { data: otcSymbol } = useReadContract({
    address: otcTokenAddress ?? undefined,
    abi: OTC_TOKEN_ABI,
    functionName: "symbol",
    query: { enabled: !!otcTokenAddress },
  });

  const otcTokenDecimals = typeof otcDecimals === "number" ? otcDecimals : 18;
  const otcTokenSymbol = typeof otcSymbol === "string" ? otcSymbol : "cOTC";
  const otcBalanceFormatted = otcBalance
    ? Number(formatUnits(otcBalance as bigint, otcTokenDecimals))
    : 0;
  const hasOtcBalance = otcBalanceFormatted > 0;

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

  // Log approval lifecycle
  useEffect(() => {
    if (approveTxHash) console.log("[invest] Approve tx submitted:", approveTxHash);
  }, [approveTxHash]);
  useEffect(() => {
    if (isApproveConfirming) console.log("[invest] Approve tx confirming...");
  }, [isApproveConfirming]);

  // When approve tx confirms, advance to confirm step
  useEffect(() => {
    if (approveConfirmed) {
      console.log("[invest] Approve confirmed — advancing to confirm step");
      refetchAllowance();
      setStep("confirm");
    }
  }, [approveConfirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  // When on-chain contribute confirms, record in backend then show success
  useEffect(() => {
    if (!contributeConfirmed || !contributeTxHash || !saleId) return;
    const hash = contributeTxHash;
    setTxHash(hash);

    // Record contribution in backend (non-blocking for UX — tx is already on-chain)
    (async () => {
      try {
        await buy(saleId, { phase_id: "", amount, tx_hash: hash });
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

  // OTC: When OTC approve tx confirms, advance to confirm step
  useEffect(() => {
    if (otcApproveConfirmed && paymentMethod === "otc_token") setStep("confirm");
  }, [otcApproveConfirmed, paymentMethod]);

  // OTC: When buyOTC confirms, record in backend then show success
  useEffect(() => {
    if (!buyOtcConfirmed || !buyOtcTxHash || !saleId) return;
    const hash = buyOtcTxHash;
    setTxHash(hash);
    (async () => {
      try {
        await buy(saleId, { phase_id: "", amount, tx_hash: hash });
      } catch { /* on-chain is source of truth */ }
      setIsContributing(false);
      refetchOtcBalance();
      setStep("success");
    })();
  }, [buyOtcConfirmed, buyOtcTxHash, saleId, amount, refetchOtcBalance]);

  // OTC: Handle buyOTC error
  useEffect(() => {
    if (buyOtcError) {
      setError(parseRevertReason(buyOtcError));
      setIsContributing(false);
    }
  }, [buyOtcError]);

  const numericAmount = parseFloat(amount) || 0;
  const activePhase = project?.phases.find((p) => p.is_active) ?? project?.phases[0] ?? null;
  const pricePerToken = activePhase ? parseFloat(activePhase.price_per_token) : 0;
  const tokensToReceive = pricePerToken > 0 ? numericAmount / pricePerToken : 0;

  // Determine the active phase index (0-based, for on-chain call)
  const activePhaseIndex = project?.phases.findIndex((p) => p.is_active) ?? 0;

  const handleApprove = useCallback(() => {
    if (!saleContractAddress) {
      setError("Sale contract not deployed yet.");
      return;
    }
    setError(null);
    const approveAmount = parseUnits(amount, 6);
    console.log("[invest] Approve USDC:", {
      usdc: usdcAddress,
      spender: saleContractAddress,
      amount: approveAmount.toString(),
      existingAllowance: existingAllowance?.toString(),
    });
    try {
      writeApprove({
        address: usdcAddress,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [saleContractAddress, approveAmount],
      });
    } catch (err) {
      console.error("[invest] Approve error:", err);
      setError(err instanceof Error ? err.message : "Approval failed");
    }
  }, [writeApprove, saleContractAddress, usdcAddress, amount, existingAllowance]);

  const handleConfirm = useCallback(() => {
    if (!saleContractAddress || !activePhase) return;
    setError(null);
    setIsContributing(true);
    const buyAmount = parseUnits(amount, 6);
    console.log("[invest] Buy:", {
      sale: saleContractAddress,
      phaseIndex: activePhaseIndex >= 0 ? activePhaseIndex : 0,
      amount: buyAmount.toString(),
      tokensToReceive,
    });
    try {
      writeContribute({
        address: saleContractAddress,
        abi: SALE_ABI,
        functionName: "buy",
        args: [
          BigInt(activePhaseIndex >= 0 ? activePhaseIndex : 0),
          buyAmount,
        ],
        gas: BigInt(500_000),
      });
    } catch (err) {
      console.error("[invest] Buy error:", err);
      setError(parseRevertReason(err));
      setIsContributing(false);
    }
  }, [writeContribute, saleContractAddress, activePhase, activePhaseIndex, amount, tokensToReceive]);

  // OTC Token: Approve OTC tokens for spending by sale contract
  const handleOtcApprove = useCallback(() => {
    if (!saleContractAddress || !otcTokenAddress) {
      setError("Sale or OTC token contract not available.");
      return;
    }
    setError(null);
    try {
      writeOtcApprove({
        address: otcTokenAddress,
        abi: OTC_TOKEN_ABI,
        functionName: "approve",
        args: [saleContractAddress, parseUnits(amount, otcTokenDecimals)],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTC approval failed");
    }
  }, [writeOtcApprove, saleContractAddress, otcTokenAddress, amount, otcTokenDecimals]);

  // OTC Token: Call sale.buyOTC()
  const handleOtcConfirm = useCallback(() => {
    if (!saleContractAddress || !activePhase) return;
    setError(null);
    setIsContributing(true);
    try {
      writeBuyOtc({
        address: saleContractAddress,
        abi: SALE_OTC_ABI,
        functionName: "buyOTC",
        args: [
          BigInt(activePhaseIndex >= 0 ? activePhaseIndex : 0),
          parseUnits(amount, otcTokenDecimals),
        ],
        gas: BigInt(500_000),
      });
    } catch (err) {
      setError(parseRevertReason(err));
      setIsContributing(false);
    }
  }, [writeBuyOtc, saleContractAddress, activePhase, activePhaseIndex, amount, otcTokenDecimals]);

  const otcConfirmLoading = isContributing || isBuyOtcPending || isBuyOtcConfirming;

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
                <div className={`grid grid-cols-1 ${hasOtcBalance ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-4`}>
                  <button
                    onClick={() => setPaymentMethod("crypto")}
                    className="p-6 rounded-2xl border-2 border-darkBlack/10 hover:border-darkAqua transition-colors text-left space-y-2"
                  >
                    <span className="text-2xl">&#x1F4B0;</span>
                    <h3 className="font-semibold text-text">On-Chain (USDC)</h3>
                    <p className="text-sm text-gray-500">Pay with USDC from your connected wallet. Instant settlement on Base.</p>
                  </button>
                  {hasOtcBalance && (
                    <button
                      onClick={() => setPaymentMethod("otc_token")}
                      className="p-6 rounded-2xl border-2 border-darkAqua/30 hover:border-darkAqua transition-colors text-left space-y-2 bg-darkAqua/5"
                    >
                      <span className="text-2xl">&#x1F3AB;</span>
                      <h3 className="font-semibold text-text">OTC Token ({otcTokenSymbol})</h3>
                      <p className="text-sm text-gray-500">
                        Use your {otcTokenSymbol} balance: {otcBalanceFormatted.toLocaleString()} tokens available.
                      </p>
                    </button>
                  )}
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

            {/* OTC Token flow — amount step */}
            {paymentMethod === "otc_token" && step === "amount" && (
              <>
                <h1 className="text-2xl font-semibold text-text mb-2">Invest with {otcTokenSymbol}</h1>
                <p className="text-darkBlack/50 mb-4">
                  Use your OTC tokens to invest in {project.title}
                </p>
                <div className="bg-darkAqua/5 rounded-xl p-4 mb-6 border border-darkAqua/20">
                  <div className="flex justify-between text-sm">
                    <span className="text-darkBlack/50">Your {otcTokenSymbol} Balance</span>
                    <span className="font-semibold text-darkAqua">{otcBalanceFormatted.toLocaleString()} {otcTokenSymbol}</span>
                  </div>
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-text mb-2">Amount ({otcTokenSymbol})</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      max={otcBalanceFormatted}
                      className="input-field text-2xl font-semibold pr-20"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-darkBlack/40 font-semibold">{otcTokenSymbol}</span>
                  </div>
                  <button
                    onClick={() => setAmount(otcBalanceFormatted.toString())}
                    className="mt-2 text-sm text-darkAqua hover:underline"
                  >
                    Use max balance
                  </button>
                </div>
                {numericAmount > otcBalanceFormatted && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 mb-4 text-sm text-red-600">
                    Amount exceeds your {otcTokenSymbol} balance.
                  </div>
                )}
                {numericAmount > 0 && numericAmount <= otcBalanceFormatted && (
                  <div className="bg-box rounded-xl p-4 space-y-3 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-darkBlack/50">You Pay</span>
                      <span className="font-semibold">{numericAmount.toLocaleString()} {otcTokenSymbol}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-darkBlack/50">You Receive</span>
                      <span className="font-semibold">{tokensToReceive.toLocaleString(undefined, { maximumFractionDigits: 4 })} {project.tokenSymbol}</span>
                    </div>
                  </div>
                )}
                <Button
                  variant="primary" className="w-full" size="lg"
                  disabled={numericAmount <= 0 || numericAmount > otcBalanceFormatted || !activePhase}
                  onClick={() => setStep("approve")}
                >
                  Continue
                </Button>
                <button
                  onClick={() => { setPaymentMethod(null); setAmount(""); setStep("amount"); }}
                  className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline block mx-auto"
                >
                  Back to payment options
                </button>
              </>
            )}

            {/* OTC Token flow — approve step */}
            {paymentMethod === "otc_token" && step === "approve" && (
              <>
                <h1 className="text-2xl font-semibold text-text mb-2">Approve {otcTokenSymbol}</h1>
                <p className="text-darkBlack/50 mb-8">Allow the sale contract to spend your {otcTokenSymbol} tokens</p>
                <div className="bg-box rounded-xl p-6 mb-6 text-center">
                  <p className="font-semibold text-text mb-2">Approve {numericAmount.toLocaleString()} {otcTokenSymbol}</p>
                  <p className="text-sm text-darkBlack/50">This is a one-time approval for this investment</p>
                </div>
                <div className="p-4 rounded-xl bg-gold/10 border border-gold/30 flex gap-3 mb-6">
                  <p className="text-sm text-darkBlack/60">You will need to confirm this transaction in your wallet.</p>
                </div>
                {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
                <Button variant="primary" className="w-full" size="lg" onClick={handleOtcApprove} isLoading={isOtcApproving}>
                  {isOtcApproving ? "Approving..." : `Approve ${otcTokenSymbol}`}
                </Button>
              </>
            )}

            {/* OTC Token flow — confirm step */}
            {paymentMethod === "otc_token" && step === "confirm" && (
              <>
                <h1 className="text-2xl font-semibold text-text mb-2">Confirm OTC Investment</h1>
                <p className="text-darkBlack/50 mb-8">Review and confirm your investment details</p>
                <div className="bg-box rounded-xl p-6 space-y-4 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-darkBlack/50">Project</span>
                    <span className="font-semibold">{project.title}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-darkBlack/50">Payment</span>
                    <span className="font-semibold">{numericAmount.toLocaleString()} {otcTokenSymbol}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-darkBlack/50">Tokens</span>
                    <span className="font-semibold">{tokensToReceive.toLocaleString()} {project.tokenSymbol}</span>
                  </div>
                  <div className="pt-4 border-t border-darkBlack/10">
                    <div className="flex justify-between text-sm">
                      <span className="text-darkBlack/50">Network Fee</span>
                      <span className="font-semibold">~$0.10</span>
                    </div>
                  </div>
                </div>
                {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
                <Button variant="primary" className="w-full" size="lg" onClick={handleOtcConfirm} isLoading={otcConfirmLoading}>
                  {otcConfirmLoading ? "Confirming..." : "Confirm Investment"}
                </Button>
              </>
            )}

            {/* Crypto flow — existing steps */}
            {paymentMethod === "crypto" && step === "amount" && (
              <InvestAmountStep
                project={project} activePhase={activePhase}
                amount={amount} onAmountChange={setAmount}
                onContinue={() => { refetchAllowance().then(({ data: a }) => { if (a != null && parseUnits(amount || "0", 6) > 0 && (a as bigint) >= parseUnits(amount || "0", 6)) { setStep("confirm"); } else { setStep("approve"); } }); }}
                isConnected={isConnected} onConnect={() => openConnectModal?.()}
              />
            )}
            {paymentMethod === "crypto" && step === "approve" && (
              <InvestApproveStep
                amount={numericAmount} isLoading={isApproving || isApproveConfirming}
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
