"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAccount, useBalance, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits, formatUnits, zeroAddress } from "viem";
import { Button } from "@/components/atoms";
import { Navbar, Footer } from "@/components/organisms";
import {
  InvestAmountStep,
  InvestApproveStep,
  InvestConfirmStep,
  InvestSuccessStep,
  ComplianceAcknowledgment,
  ERC20_APPROVE_ABI,
  type InvestStep,
} from "@/components/organisms/BuyFlow";
import { getProject, getSaleRawBySlug } from "@/lib/api/repositories/projects.repository";
import { buy } from "@/lib/api/repositories/sales";
import type { Project } from "@/lib/api/repositories/projects.repository";
import { Spinner } from "@/components/atoms";
// Auth token handled by httpOnly cookie via proxy — no manual token needed
import { SALE_ABI } from "@/lib/contracts/saleAbi";
import { OTC_TOKEN_ABI, SALE_OTC_ABI } from "@/lib/contracts/otcTokenAbi";
import { getUsdcAddress } from "@/lib/contracts/addresses";
import { parseRevertReason } from "@/lib/contracts/revertReasons";
import { useAuth } from "@/contexts/AuthContext";
import { useWeb3 } from "@/contexts/Web3Context";
import { formatCurrency } from "@/lib/utils";

// Steps shown in the progress bar (success is rendered separately).
const STEPS_BAR = ["amount", "approve", "confirm"] as const;

export default function InvestPage() {
  const params = useParams<{ slug: string }>();
  const { isConnected, address: connectedAddress } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  // Expected chain from env — required, no default. Misconfiguration must fail loudly.
  if (!process.env.NEXT_PUBLIC_CHAIN_ID) {
    throw new Error("NEXT_PUBLIC_CHAIN_ID is not set. Configure it in the launchpad environment.");
  }
  const expectedChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
  if (!Number.isFinite(expectedChainId) || expectedChainId <= 0) {
    throw new Error(`NEXT_PUBLIC_CHAIN_ID is invalid: "${process.env.NEXT_PUBLIC_CHAIN_ID}"`);
  }
  const isWrongChain = isConnected && chainId !== expectedChainId;
  const expectedChainName =
    expectedChainId === 8453 ? "Base"
    : expectedChainId === 84532 ? "Base Sepolia"
    : expectedChainId === 11155111 ? "Ethereum Sepolia"
    : expectedChainId === 1 ? "Ethereum Mainnet"
    : `Chain ${expectedChainId}`;
  const { user, isAuthenticated } = useAuth();
  const { isVerified: isWalletLinkedToProfile } = useWeb3();

  const [project, setProject] = useState<Project | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [saleOtcEnabled, setSaleOtcEnabled] = useState(false);
  const [paymentTokenAddress, setPaymentTokenAddress] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"crypto" | "otc" | "otc_token" | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<InvestStep>("amount");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isContributing, setIsContributing] = useState(false);
  const [otcComplianceMet, setOtcComplianceMet] = useState(false);
  // After on-chain confirm, the success card is gated on the backend POST
  // /sales/:id/contribute completing so the buyer's tx shows up in their
  // portfolio + transaction history. The button stays in its loading state
  // until both the on-chain receipt and the backend recording are done.
  const [isRecording, setIsRecording] = useState(false);

  // Payment token from the sale (e.g. cUSDC, USDT) — validated as a 0x hex address.
  // Falls back to the chain-wide default when the DB has a label (e.g. "USDC") or is null.
  const isValidAddr = (s: string | null): s is `0x${string}` =>
    !!s && /^0x[0-9a-fA-F]{40}$/.test(s);
  const usdcAddress = isValidAddr(paymentTokenAddress)
    ? paymentTokenAddress
    : getUsdcAddress(chainId);

  // Derive sale contract address early so hooks can reference it
  const _rawAddr = (project as unknown as { contract_address?: string | null })?.contract_address;
  const saleContractAddress: `0x${string}` | null =
    typeof _rawAddr === "string" && /^0x[0-9a-fA-F]{40}$/.test(_rawAddr)
      ? (_rawAddr as `0x${string}`)
      : null;

  // Check if wallet is whitelisted on identity registry
  const identityRegistryAddress = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as `0x${string}` | undefined;
  const { data: isWalletVerified } = useReadContract({
    address: identityRegistryAddress,
    abi: [{ name: "isVerified", type: "function", stateMutability: "view", inputs: [{ name: "userAddress", type: "address" }], outputs: [{ name: "", type: "bool" }] }] as const,
    functionName: "isVerified",
    args: connectedAddress ? [connectedAddress] : undefined,
    query: { enabled: !!connectedAddress && !!identityRegistryAddress },
  });

  // Read native ETH balance for low-gas warning
  const { data: nativeBalance } = useBalance({
    address: connectedAddress,
    query: { enabled: !!connectedAddress },
  });
  const ethBalance = nativeBalance ? Number(formatUnits(nativeBalance.value, 18)) : null;

  // Read hard cap + total raised from on-chain for max buyable validation
  const { data: onChainHardCap } = useReadContract({
    address: saleContractAddress ?? undefined,
    abi: SALE_ABI,
    functionName: "hardCap",
    query: { enabled: !!saleContractAddress },
  });
  const { data: onChainTotalRaised } = useReadContract({
    address: saleContractAddress ?? undefined,
    abi: SALE_ABI,
    functionName: "totalRaised",
    query: { enabled: !!saleContractAddress },
  });
  const hardCapUsdc = onChainHardCap ? Number(formatUnits(onChainHardCap as bigint, 6)) : 0;
  const totalRaisedUsdc = onChainTotalRaised ? Number(formatUnits(onChainTotalRaised as bigint, 6)) : 0;

  // Read USDC balance for insufficient funds check
  const { data: usdcBalanceRaw } = useReadContract({
    address: usdcAddress ?? undefined,
    abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
    functionName: "balanceOf",
    args: connectedAddress ? [connectedAddress] : undefined,
    query: { enabled: !!usdcAddress && !!connectedAddress },
  });
  const usdcBalance = usdcBalanceRaw != null ? Number(formatUnits(usdcBalanceRaw as bigint, 6)) : null;

  // Read sale.totalContributed[wallet] for amount-step display
  const { data: userTotalContributedRaw } = useReadContract({
    address: saleContractAddress ?? undefined,
    abi: [{ name: "totalContributed", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] }] as const,
    functionName: "totalContributed",
    args: connectedAddress ? [connectedAddress] : undefined,
    query: { enabled: !!saleContractAddress && !!connectedAddress },
  });
  const userTotalContributed = userTotalContributedRaw != null ? Number(formatUnits(userTotalContributedRaw as bigint, 6)) : 0;

  // Read on-chain token decimals (Sale.tokenDecimals()) so we can convert
  // raw phase.allocation / phase.sold (scaled by 10**tokenDecimals) into
  // whole-token counts for client-side validation.
  const { data: saleTokenDecimalsRaw } = useReadContract({
    address: saleContractAddress ?? undefined,
    abi: SALE_ABI,
    functionName: "tokenDecimals",
    query: { enabled: !!saleContractAddress },
  });
  const saleTokenDecimals = typeof saleTokenDecimalsRaw === "number" ? saleTokenDecimalsRaw : 6;

  // Compute the current active phase index from the loaded project so the
  // getPhase() hook below stays referentially stable. Safe inside render —
  // the hook below is called unconditionally with a derived bigint arg.
  const _now = new Date();
  const _activePhaseIdx = project?.phases.findIndex((p) => {
    const start = new Date(p.start_time);
    const end = new Date(p.end_time);
    return _now >= start && _now < end;
  }) ?? -1;

  // Read on-chain phase struct so we can validate against the *real* remaining
  // allocation. The DB-side SalePhase has no tokens_sold column, so the previous
  // client-side max check (project.tokensSoldTotal) was always 0 → users could
  // submit a buy that exceeds phase allocation and the tx would revert on-chain.
  const { data: onChainPhase } = useReadContract({
    address: saleContractAddress ?? undefined,
    abi: SALE_ABI,
    functionName: "getPhase",
    args: _activePhaseIdx >= 0 ? [BigInt(_activePhaseIdx)] : undefined,
    query: { enabled: !!saleContractAddress && _activePhaseIdx >= 0 },
  });

  // Phase remaining = (allocation - sold) / 10**tokenDecimals (whole tokens).
  // `getPhase` returns a tuple-like object indexed by component name.
  const phaseAllocationRaw = onChainPhase
    ? BigInt((onChainPhase as { allocation: bigint }).allocation ?? 0n)
    : 0n;
  const phaseSoldRaw = onChainPhase
    ? BigInt((onChainPhase as { sold: bigint }).sold ?? 0n)
    : 0n;
  const phaseRemainingTokens = phaseAllocationRaw > phaseSoldRaw && saleTokenDecimals >= 0
    ? Number((phaseAllocationRaw - phaseSoldRaw) / BigInt(10 ** saleTokenDecimals))
    : 0;

  // Read existing USDC allowance — skip approve step if sufficient
  // amountWei = USDC cost for allowance comparison (not token qty)
  const _tokenQtyForAllowance = parseInt(amount || "0", 10) || 0;
  const _priceForAllowance = project?.phases?.find((p: { start_time: string; end_time: string }) => { const n = Date.now(); return n >= new Date(p.start_time).getTime() && n < new Date(p.end_time).getTime(); });
  const _usdcCost = _tokenQtyForAllowance * (_priceForAllowance ? parseFloat(_priceForAllowance.price_per_token) : 0);
  const amountWei = _usdcCost > 0 ? parseUnits(_usdcCost.toString(), 6) : BigInt(0);
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

  const otcDecimalsLoaded = typeof otcDecimals === "number";
  const otcSymbolLoaded = typeof otcSymbol === "string";
  const otcMetadataReady = otcDecimalsLoaded && otcSymbolLoaded;
  const otcTokenDecimals = otcDecimalsLoaded ? (otcDecimals as number) : 6;
  const otcTokenSymbol = otcSymbolLoaded ? (otcSymbol as string) : "…";
  const otcBalanceFormatted = otcBalance && otcDecimalsLoaded
    ? Number(formatUnits(otcBalance as bigint, otcTokenDecimals))
    : 0;
  const hasOtcBalance = otcBalanceFormatted > 0;
  // Sale advertises OTC support if the OTC token address is non-zero on-chain.
  const saleHasOtcToken = otcTokenAddress != null;

  // Read OTC token allowance — skip approve step if sufficient
  const { data: otcAllowance, refetch: refetchOtcAllowance } = useReadContract({
    address: otcTokenAddress ?? undefined,
    abi: [{ name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
    functionName: "allowance",
    args: connectedAddress && saleContractAddress ? [connectedAddress, saleContractAddress] : undefined,
    query: { enabled: !!otcTokenAddress && !!connectedAddress && !!saleContractAddress },
  });
  const otcAmountWei = amount ? parseUnits(amount, otcTokenDecimals) : BigInt(0);
  const _hasEnoughOtcAllowance = otcAllowance != null && otcAmountWei > 0 && (otcAllowance as bigint) >= otcAmountWei;

  // Whole-token buy: `amount` represents token quantity (whole tokens).
  // Declared here so it's available to the useEffects below.
  const tokenQty = parseInt(amount || "0", 10) || 0;
  const now = new Date();
  const activePhase = project?.phases.find((p) => {
    if (p.deployed_on_chain === false) return false; // Skip tentative phases
    const start = new Date(p.start_time);
    const end = new Date(p.end_time);
    return now >= start && now < end;
  }) ?? null;
  const pricePerToken = activePhase ? parseFloat(activePhase.price_per_token) : 0;
  const usdcRequired = tokenQty * pricePerToken;
  const insufficientUsdc = paymentMethod === "crypto" && usdcBalance != null && usdcRequired > 0 && usdcBalance < usdcRequired;
  const tokensToReceive = tokenQty;
  const numericAmount = usdcRequired;

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
        if (raw.payment_token) setPaymentTokenAddress(raw.payment_token);
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
  }, [approveConfirmed]);

  // When on-chain contribute confirms, record in backend then show success.
  // The success card is gated on the backend POST so the buyer's purchase
  // appears in their portfolio + transaction history immediately.
  useEffect(() => {
    if (!contributeConfirmed || !contributeTxHash || !saleId) return;
    const hash = contributeTxHash;
    setTxHash(hash);
    setIsRecording(true);

    (async () => {
      try {
        // Send the USDC value (not the token quantity) — backend `amount`
        // is the payment-token amount and is used as the fallback when
        // on-chain verification can't extract event data.
        await buy(saleId, { phase_id: activePhase?.id || "", amount: usdcRequired.toString(), tx_hash: hash });
      } catch (err) {
        console.error("[invest] Backend recording failed:", err);
      }
      setIsContributing(false);
      setIsRecording(false);
      setStep("success");
    })();
  }, [contributeConfirmed, contributeTxHash, saleId, usdcRequired]);
  // Note: activePhase?.id intentionally excluded — recording must fire even
  // if frontend couldn't resolve the phase (backend resolves from on-chain event)

  // Handle contribute error
  useEffect(() => {
    if (contributeError) {
      setError(parseRevertReason(contributeError));
      setIsContributing(false);
    }
  }, [contributeError]);

  // OTC: When OTC approve tx confirms, advance to confirm step
  useEffect(() => {
    if (otcApproveConfirmed && paymentMethod === "otc_token") { refetchOtcAllowance(); setStep("confirm"); }
  }, [otcApproveConfirmed, paymentMethod]);

  // OTC: When buyOTC confirms, record in backend then show success.
  useEffect(() => {
    if (!buyOtcConfirmed || !buyOtcTxHash || !saleId) return;
    const hash = buyOtcTxHash;
    setTxHash(hash);
    setIsRecording(true);
    (async () => {
      try {
        // OTC buys: send USDC-equivalent value as the amount field for backend fallback.
        await buy(saleId, { phase_id: activePhase?.id || "", amount: usdcRequired.toString(), tx_hash: hash });
      } catch (err) {
        console.error("[invest] OTC backend recording failed:", err);
      }
      setIsContributing(false);
      setIsRecording(false);
      refetchOtcBalance();
      setStep("success");
    })();
  }, [buyOtcConfirmed, buyOtcTxHash, saleId, usdcRequired, refetchOtcBalance]);

  // OTC: Handle buyOTC error
  useEffect(() => {
    if (buyOtcError) {
      setError(parseRevertReason(buyOtcError));
      setIsContributing(false);
    }
  }, [buyOtcError]);

  // (tokenQty / activePhase / usdcRequired declared above for useEffect access)

  // Determine the active phase index (0-based, for on-chain call)
  const rawPhaseIndex = project?.phases.findIndex((p) => {
    const start = new Date(p.start_time);
    const end = new Date(p.end_time);
    return now >= start && now < end;
  }) ?? -1;
  const activePhaseIndex = rawPhaseIndex >= 0 ? rawPhaseIndex : 0;

  // Determine sale timing status for messaging
  const allPhasesEnded = project?.phases.length
    ? project.phases.every((p) => now >= new Date(p.end_time))
    : false;
  const allPhasesUpcoming = project?.phases.length
    ? project.phases.every((p) => now < new Date(p.start_time))
    : false;
  const nextUpcomingPhase = project?.phases
    .filter((p) => now < new Date(p.start_time))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] ?? null;

  const handleApprove = useCallback(() => {
    if (isWrongChain) {
      setError(`Wrong network. Switch to ${expectedChainName} first.`);
      return;
    }
    if (!saleContractAddress) {
      setError("Sale contract not deployed yet.");
      return;
    }
    setError(null);
    // Approve the exact USDC required for tokenQty tokens
    const approveAmount = parseUnits(usdcRequired.toString(), 6);
    console.log("[invest] Approve USDC:", {
      usdc: usdcAddress,
      spender: saleContractAddress,
      tokenQty,
      usdcRequired: approveAmount.toString(),
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
  }, [writeApprove, saleContractAddress, usdcAddress, tokenQty, usdcRequired, existingAllowance, isWrongChain, expectedChainName]);

  const handleConfirm = useCallback(() => {
    if (isWrongChain) {
      setError(`Wrong network. Switch to ${expectedChainName} first.`);
      return;
    }
    if (!saleContractAddress || !activePhase) return;
    setError(null);
    setIsContributing(true);
    // Whole-token buy: second arg is token quantity (not USDC)
    console.log("[invest] Buy:", {
      sale: saleContractAddress,
      phaseIndex: activePhaseIndex >= 0 ? activePhaseIndex : 0,
      tokenQty,
      usdcRequired,
    });
    try {
      writeContribute({
        address: saleContractAddress,
        abi: SALE_ABI,
        functionName: "buy",
        args: [
          BigInt(activePhaseIndex >= 0 ? activePhaseIndex : 0),
          BigInt(tokenQty),
        ],
        gas: BigInt(500_000),
      });
    } catch (err) {
      console.error("[invest] Buy error:", err);
      setError(parseRevertReason(err));
      setIsContributing(false);
    }
  }, [writeContribute, saleContractAddress, activePhase, activePhaseIndex, tokenQty, usdcRequired, isWrongChain, expectedChainName]);

  // OTC Token: Approve OTC tokens for spending by sale contract (exact USDC amount)
  const handleOtcApprove = useCallback(() => {
    if (isWrongChain) {
      setError(`Wrong network. Switch to ${expectedChainName} first.`);
      return;
    }
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
        args: [saleContractAddress, parseUnits(usdcRequired.toString(), otcTokenDecimals)],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTC approval failed");
    }
  }, [writeOtcApprove, saleContractAddress, otcTokenAddress, usdcRequired, otcTokenDecimals, isWrongChain, expectedChainName]);

  // OTC Token: Call sale.buyOTC() with token quantity
  const handleOtcConfirm = useCallback(() => {
    if (isWrongChain) {
      setError(`Wrong network. Switch to ${expectedChainName} first.`);
      return;
    }
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
          BigInt(tokenQty),
        ],
        gas: BigInt(500_000),
      });
    } catch (err) {
      setError(parseRevertReason(err));
      setIsContributing(false);
    }
  }, [writeBuyOtc, saleContractAddress, activePhase, activePhaseIndex, tokenQty, isWrongChain, expectedChainName]);

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
          <p className="text-xl text-black/50">{error ?? "Project not found"}</p>
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
              className="inline-flex items-center gap-2 text-black/50 hover:text-text transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Project
            </Link>
          )}
          {/* Progress bar */}
          {step !== "success" && (
            <div className="mb-8 flex items-center justify-between relative">
              {STEPS_BAR.map((s, i) => (
                <div key={s} className="flex flex-col items-center z-10">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    step === s ? "bg-darkAqua text-white"
                      : i < STEPS_BAR.indexOf(step as (typeof STEPS_BAR)[number]) ? "bg-green-500 text-white"
                      : "bg-black/10 text-black/50"
                  }`}>
                    {i < STEPS_BAR.indexOf(step as (typeof STEPS_BAR)[number])
                      ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                  </div>
                  <span className="text-xs mt-2 text-black/50 capitalize">{s}</span>
                </div>
              ))}
              <div className="absolute top-5 left-0 right-0 h-0.5 bg-black/10 -z-0">
                <div className="h-full bg-green-500 transition-all"
                  style={{ width: `${STEPS_BAR.indexOf(step as (typeof STEPS_BAR)[number]) * 50}%` }}/>
              </div>
            </div>
          )}
          <motion.div key={paymentMethod ?? "choose"} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 border border-black/10">

            {/* Wrong network — highest priority banner */}
            {isWrongChain && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200">
                <p className="text-sm font-semibold text-red-700 mb-1">Wrong network</p>
                <p className="text-sm text-red-600 mb-3">
                  Your wallet is connected to the wrong network. Switch to <span className="font-semibold">{expectedChainName}</span> to continue.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={isSwitchingChain}
                  disabled={isSwitchingChain}
                  onClick={() => switchChain({ chainId: expectedChainId })}
                >
                  Switch to {expectedChainName}
                </Button>
              </div>
            )}

            {/* Logged-out state — show sign in / register prompt, no KYC/wallet messaging */}
            {!isWrongChain && !isAuthenticated && (
              <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-sm font-semibold text-amber-800 mb-1">Sign in to buy</p>
                <p className="text-sm text-amber-700 mb-3">
                  You need a Cireta account to buy. Sign in with an existing account or register a new one.
                </p>
                <div className="flex gap-3">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1 text-sm font-medium text-darkAqua hover:underline"
                  >
                    Sign In &rarr;
                  </Link>
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-1 text-sm font-medium text-darkAqua hover:underline"
                  >
                    Register &rarr;
                  </Link>
                </div>
              </div>
            )}

            {/* Wallet verification status — priority: KYC first, then wallet linking */}
            {!isWrongChain && isAuthenticated && isConnected && isWalletVerified === false && (() => {
              const kyc = user?.kycStatus ?? "none";
              const kycIncomplete = kyc !== "approved";

              // KYC not yet approved — highest priority: show only KYC CTA
              if (kycIncomplete) {
                const statusLabel =
                  kyc === "pending"
                    ? "Your identity verification is under review"
                    : kyc === "rejected"
                    ? "Your identity verification was rejected"
                    : kyc === "expired"
                    ? "Your identity verification has expired"
                    : "Identity verification required";
                const buttonLabel =
                  kyc === "pending" ? "Check KYC Status" : "Start KYC Verification";
                return (
                  <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200">
                    <p className="text-sm font-semibold text-red-700 mb-1">Identity verification required</p>
                    <p className="text-sm text-red-600 mb-3">
                      {statusLabel}. You must complete KYC before buying regulated security tokens.
                    </p>
                    <Link
                      href="/settings/verification"
                      className="inline-flex items-center gap-1 text-sm font-medium text-darkAqua hover:underline"
                    >
                      {buttonLabel} &rarr;
                    </Link>
                  </div>
                );
              }

              // KYC approved but wallet not linked to profile
              if (!isWalletLinkedToProfile) {
                const shortAddr = connectedAddress
                  ? `${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}`
                  : "";
                return (
                  <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="text-sm font-semibold text-amber-800 mb-1">Link this wallet to your profile</p>
                    <p className="text-sm text-amber-700 mb-3">
                      You&apos;re verified, but the connected wallet{shortAddr && <> (<code className="font-mono text-xs">{shortAddr}</code>)</>} isn&apos;t linked to your Cireta account yet.
                      Add it from your profile before you can buy.
                    </p>
                    <Link
                      href="/settings/wallets"
                      className="inline-flex items-center gap-1 text-sm font-medium text-darkAqua hover:underline"
                    >
                      Add Wallet to Profile &rarr;
                    </Link>
                  </div>
                );
              }

              // Edge case: KYC approved, wallet linked, but still not verified on-chain.
              // This shouldn't normally happen — the backend auto-whitelists verified wallets.
              // Show a gentle hint in case of sync delay.
              return (
                <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-sm font-semibold text-amber-800 mb-1">Sync in progress</p>
                  <p className="text-sm text-amber-700">
                    Your wallet is being registered for on-chain buying. This usually takes a few seconds — please refresh in a moment.
                  </p>
                </div>
              );
            })()}

            {/* Wallet not verified — error banner (blocks buying) */}
            {!isWrongChain && isAuthenticated && isConnected && isWalletVerified === false && user?.kycStatus === "approved" && step !== "amount" && (
              <div className="mb-6 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                <p className="text-sm font-medium text-red-700">
                  This wallet is not registered on the identity registry. Please link a verified wallet or contact support.
                </p>
              </div>
            )}

            {/* No active phase — show timing message */}
            {!activePhase && project.phases.length > 0 && (
              <div className="text-center py-8 space-y-3">
                {allPhasesEnded ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
                      <CheckCircle2 className="h-6 w-6 text-gray-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-text">Sale Concluded</h2>
                    <p className="text-black/50">This sale has concluded. No active phases.</p>
                    <Link href={`/project/${project.slug}`} className="text-darkAqua font-medium hover:underline inline-block mt-2">
                      Back to Project
                    </Link>
                  </>
                ) : allPhasesUpcoming && nextUpcomingPhase ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-2">
                      <ArrowLeft className="h-6 w-6 text-blue-500 rotate-180" />
                    </div>
                    <h2 className="text-xl font-semibold text-text">Sale Not Yet Open</h2>
                    <p className="text-black/50">
                      Sale starts on{" "}
                      <span className="font-medium text-text">
                        {new Date(nextUpcomingPhase.start_time).toLocaleDateString("en-GB", {
                          day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </p>
                    <Link href={`/project/${project.slug}`} className="text-darkAqua font-medium hover:underline inline-block mt-2">
                      Back to Project
                    </Link>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-semibold text-text">No Active Phase</h2>
                    <p className="text-black/50">There is currently no active sale phase. Please check back later.</p>
                    {nextUpcomingPhase && (
                      <p className="text-sm text-blue-600 font-medium">
                        Next phase starts{" "}
                        {new Date(nextUpcomingPhase.start_time).toLocaleDateString("en-GB", {
                          day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    )}
                    <Link href={`/project/${project.slug}`} className="text-darkAqua font-medium hover:underline inline-block mt-2">
                      Back to Project
                    </Link>
                  </>
                )}
              </div>
            )}

            {/* Payment Method Selector — shown when OTC is enabled and method not yet chosen */}
            {saleOtcEnabled && !paymentMethod && activePhase && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-text text-center">How would you like to buy?</h2>
                <div className={`grid grid-cols-1 gap-4 ${saleHasOtcToken && hasOtcBalance ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                  <button
                    onClick={() => setPaymentMethod("crypto")}
                    className="p-6 rounded-2xl border-2 border-black/10 hover:border-darkAqua transition-colors text-left space-y-2"
                  >
                    <span className="text-2xl">&#x1F4B0;</span>
                    <h3 className="font-semibold text-text">On-Chain (USDC)</h3>
                    <p className="text-sm text-gray-500">Pay with USDC from your connected wallet. Instant on-chain settlement.</p>
                  </button>
                  {saleHasOtcToken && hasOtcBalance && (
                    <button
                      onClick={() => setPaymentMethod("otc_token")}
                      disabled={!otcMetadataReady}
                      className="p-6 rounded-2xl border-2 border-darkAqua/30 hover:border-darkAqua transition-colors text-left space-y-2 bg-darkAqua/5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="p-6 rounded-2xl border-2 border-black/10 hover:border-darkAqua transition-colors text-left space-y-2"
                  >
                    <span className="text-2xl">&#x1F3E6;</span>
                    <h3 className="font-semibold text-text">OTC & Bank Transfer</h3>
                    <p className="text-sm text-gray-500">Pay via wire transfer or OTC allocation. Suitable for larger purchases.</p>
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
                    This sale accepts purchases via bank wire transfer and OTC allocation.
                    Review the full instructions on the project page.
                  </p>
                  <Link
                    href={`/project/${params.slug}#otc`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-darkAqua hover:underline"
                  >
                    View OTC & Bank Instructions on Project Page &#x2192;
                  </Link>
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
            {paymentMethod === "otc_token" && activePhase && step === "amount" && (
              <>
                <h1 className="text-2xl font-semibold text-text mb-2">Buy with {otcTokenSymbol}</h1>
                <p className="text-black/50 mb-4">
                  Use your {otcTokenSymbol} balance to buy {project.tokenSymbol} tokens
                </p>
                {(() => {
                  // OTC tokens are pegged 1:1 to the payment token (USDC), so the
                  // OTC required = USDC required.
                  const otcRequired = usdcRequired;
                  const exceedsOtcBalance = otcRequired > otcBalanceFormatted;
                  const totalSupply = project.totalTokenSupply ?? 0;
                  const tokensSold = project.tokensSoldTotal ?? 0;
                  const saleLevelAvailable = Math.max(0, totalSupply - tokensSold);
                  // Use the on-chain phase remaining when present (authoritative)
                  // and fall back to sale-level remaining only if the contract
                  // read isn't ready yet.
                  const availableTokens =
                    phaseRemainingTokens > 0 ? phaseRemainingTokens : saleLevelAvailable;
                  const maxAffordableTokens = pricePerToken > 0
                    ? Math.floor(otcBalanceFormatted / pricePerToken)
                    : 0;
                  const maxBuyableTokens = Math.min(maxAffordableTokens, availableTokens);
                  return (
                    <>
                      <div className="bg-darkAqua/5 rounded-xl p-4 mb-3 border border-darkAqua/20 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-black/50">Your {otcTokenSymbol} Balance</span>
                          <span className="font-semibold text-darkAqua">{otcBalanceFormatted.toLocaleString()} {otcTokenSymbol}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-black/50">Available {project.tokenSymbol} for Purchase</span>
                          <span className="font-semibold text-darkAqua">
                            {availableTokens.toLocaleString()} {project.tokenSymbol}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-black/50">Price per {project.tokenSymbol}</span>
                          <span className="font-semibold">{formatCurrency(pricePerToken)}</span>
                        </div>
                      </div>
                      <div className="mb-6">
                        <label className="block text-sm font-semibold text-text mb-2">Amount ({project.tokenSymbol})</label>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                            placeholder="0"
                            className="input-field text-2xl font-semibold pr-24"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-black/40 font-semibold">{project.tokenSymbol}</span>
                        </div>
                        <button
                          onClick={() => setAmount(maxBuyableTokens.toString())}
                          className="mt-2 text-sm text-darkAqua hover:underline"
                          disabled={maxBuyableTokens <= 0}
                        >
                          Use max ({maxBuyableTokens.toLocaleString()} {project.tokenSymbol})
                        </button>
                      </div>
                      {exceedsOtcBalance && (
                        <div className="p-3 rounded-lg bg-red-50 border border-red-200 mb-4 text-sm text-red-600">
                          You need {otcRequired.toLocaleString()} {otcTokenSymbol} but only have {otcBalanceFormatted.toLocaleString()}.
                        </div>
                      )}
                      {tokenQty > availableTokens && availableTokens > 0 && (
                        <div className="p-3 rounded-lg bg-red-50 border border-red-200 mb-4 text-sm text-red-600">
                          Only {availableTokens.toLocaleString()} {project.tokenSymbol} are available for purchase.
                        </div>
                      )}
                      {tokenQty > 0 && !exceedsOtcBalance && tokenQty <= availableTokens && (
                        <div className="bg-box rounded-xl p-4 space-y-3 mb-6">
                          <div className="flex justify-between text-sm">
                            <span className="text-black/50">You Pay</span>
                            <span className="font-semibold">{otcRequired.toLocaleString()} {otcTokenSymbol}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-black/50">You Receive</span>
                            <span className="font-semibold">{tokenQty.toLocaleString()} {project.tokenSymbol}</span>
                          </div>
                        </div>
                      )}
                      {userTotalContributed > 0 && (
                        <p className="text-xs text-black/50 mb-3">
                          You&apos;ve already contributed{" "}
                          <span className="font-semibold text-text">{formatCurrency(userTotalContributed)}</span> to this sale.
                        </p>
                      )}
                      {ethBalance != null && ethBalance < 0.0005 && (
                        <div className="mb-4 p-3 rounded-xl bg-yellow-50 border border-yellow-200 text-sm text-yellow-900">
                          Low ETH for gas: you have {ethBalance.toFixed(5)} ETH. Top up before continuing.
                        </div>
                      )}
                      <Button
                        variant="primary" className="w-full" size="lg"
                        disabled={
                          !otcMetadataReady ||
                          tokenQty <= 0 ||
                          exceedsOtcBalance ||
                          tokenQty > availableTokens ||
                          !activePhase
                        }
                        onClick={() => {
                    if (isWalletVerified === false) {
                      setError("Wallet not registered on identity registry");
                      return;
                    }
                    setError(null);
                    refetchOtcAllowance().then(({ data: a }) => {
                      const needed = parseUnits(amount || "0", otcTokenDecimals);
                      if (a != null && needed > 0 && (a as bigint) >= needed) {
                        setStep("confirm");
                      } else {
                        setStep("approve");
                      }
                    }).catch(() => setStep("approve"));
                  }}
                >
                  {otcMetadataReady ? "Continue" : "Loading…"}
                </Button>
                <button
                  onClick={() => { setPaymentMethod(null); setAmount(""); setStep("amount"); }}
                  className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline block mx-auto"
                >
                  Back to payment options
                </button>
                    </>
                  );
                })()}
              </>
            )}

            {/* OTC Token flow — approve step (blocked if wallet not verified) */}
            {paymentMethod === "otc_token" && step === "approve" && isWalletVerified === false && (
              <div className="text-center py-8 space-y-3">
                <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
                <h2 className="text-lg font-semibold text-text">Wallet Not Verified</h2>
                <p className="text-black/50 text-sm">
                  This wallet is not registered on the identity registry. You cannot proceed with the purchase.
                  Please link a verified wallet or contact support.
                </p>
                <button onClick={() => setStep("amount")} className="text-darkAqua font-medium hover:underline text-sm">
                  Go Back
                </button>
              </div>
            )}
            {paymentMethod === "otc_token" && step === "approve" && isWalletVerified !== false && (
              <>
                <h1 className="text-2xl font-semibold text-text mb-2">Approve {otcTokenSymbol}</h1>
                <p className="text-black/50 mb-8">Allow the sale contract to spend your {otcTokenSymbol} tokens</p>
                <div className="bg-box rounded-xl p-6 mb-6 text-center">
                  <p className="font-semibold text-text mb-2">Approve {usdcRequired.toLocaleString()} {otcTokenSymbol}</p>
                  <p className="text-sm text-black/50">to buy {tokenQty.toLocaleString()} {project.tokenSymbol}. This is a one-time approval for this purchase.</p>
                </div>
                <ComplianceAcknowledgment checked={otcComplianceMet} onChange={setOtcComplianceMet} />
                <div className="p-4 rounded-xl bg-darkAqua/10 border border-darkAqua/30 flex gap-3 mb-6">
                  <p className="text-sm text-black/60">You will need to confirm this transaction in your wallet.</p>
                </div>
                {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
                <div className="flex gap-3">
                  <Button
                    variant="outline" className="flex-1" size="lg"
                    onClick={() => setStep("amount")}
                    disabled={isOtcApproving}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary" className="flex-1" size="lg"
                    onClick={handleOtcApprove}
                    isLoading={isOtcApproving}
                    disabled={!otcComplianceMet || !otcMetadataReady || isOtcApproving}
                  >
                    {isOtcApproving ? "Approving..." : `Approve ${otcTokenSymbol}`}
                  </Button>
                </div>
              </>
            )}

            {/* OTC Token flow — confirm step */}
            {paymentMethod === "otc_token" && step === "confirm" && (
              <>
                <h1 className="text-2xl font-semibold text-text mb-2">Confirm OTC Purchase</h1>
                <p className="text-black/50 mb-8">Review and confirm your purchase details</p>
                <div className="bg-box rounded-xl p-6 space-y-4 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-black/50">Project</span>
                    <span className="font-semibold">{project.title}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-black/50">Payment</span>
                    <span className="font-semibold">{usdcRequired.toLocaleString()} {otcTokenSymbol}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-black/50">Tokens</span>
                    <span className="font-semibold">{tokenQty.toLocaleString()} {project.tokenSymbol}</span>
                  </div>
                </div>
                <p className="text-xs text-black/40 mb-4 text-center">
                  Network fee paid in ETH from your wallet. Estimated by your wallet at signing time.
                </p>
                {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
                <Button
                  variant="primary" className="w-full" size="lg"
                  onClick={handleOtcConfirm}
                  isLoading={otcConfirmLoading}
                  disabled={!otcMetadataReady || otcConfirmLoading}
                >
                  {otcConfirmLoading ? "Confirming..." : "Confirm Purchase"}
                </Button>
              </>
            )}

            {/* Crypto flow — existing steps */}
            {paymentMethod === "crypto" && activePhase && step === "amount" && (
              <>
                {insufficientUsdc && (
                  <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
                    Insufficient USDC balance. You have {usdcBalance?.toLocaleString()} USDC but need {usdcRequired.toLocaleString()} USDC.
                  </div>
                )}
                <InvestAmountStep
                  project={project} activePhase={activePhase}
                  amount={amount} onAmountChange={setAmount}
                  onContinue={() => {
                    if (insufficientUsdc) {
                      setError("Insufficient USDC balance");
                      return;
                    }
                    if (isWalletVerified === false) {
                      setError("Wallet not registered on identity registry");
                      return;
                    }
                    setError(null);
                    refetchAllowance()
                      .then(({ data: a }) => {
                        // Compare allowance against USDC cost, not token quantity
                        const neededUsdc = parseUnits(usdcRequired.toString(), 6);
                        if (a != null && neededUsdc > 0n && (a as bigint) >= neededUsdc) {
                          setStep("confirm");
                        } else {
                          setStep("approve");
                        }
                      })
                      .catch(() => setStep("approve"));
                  }}
                  isConnected={isConnected} onConnect={() => openConnectModal?.()}
                  userTotalContributed={userTotalContributed}
                  ethBalance={ethBalance}
                  phaseRemainingTokens={phaseRemainingTokens}
                  hardCapUsdc={hardCapUsdc}
                  totalRaisedUsdc={totalRaisedUsdc}
                />
              </>
            )}
            {paymentMethod === "crypto" && step === "approve" && isWalletVerified === false && (
              <div className="text-center py-8 space-y-3">
                <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
                <h2 className="text-lg font-semibold text-text">Wallet Not Verified</h2>
                <p className="text-black/50 text-sm">
                  This wallet is not registered on the identity registry. You cannot proceed with the purchase.
                  Please link a verified wallet or contact support.
                </p>
                <button onClick={() => setStep("amount")} className="text-darkAqua font-medium hover:underline text-sm">
                  Go Back
                </button>
              </div>
            )}
            {paymentMethod === "crypto" && step === "approve" && isWalletVerified !== false && (
              <InvestApproveStep
                amount={numericAmount} isLoading={isApproving || isApproveConfirming}
                error={error} onApprove={handleApprove}
                currentAllowance={existingAllowance != null ? Number(formatUnits(existingAllowance as bigint, 6)) : 0}
                hasEnoughAllowance={hasEnoughAllowance}
                onSkip={() => setStep("confirm")}
                onBack={() => setStep("amount")}
              />
            )}
            {paymentMethod === "crypto" && step === "confirm" && (
              <InvestConfirmStep
                project={project} amount={numericAmount}
                tokensToReceive={tokensToReceive} isLoading={confirmLoading || isRecording}
                error={error} onConfirm={handleConfirm}
                onBack={() => setStep("amount")}
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
            <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-xl mx-auto">
              <Link href="/portfolio" className="flex-1">
                <Button variant="primary" size="lg" className="w-full">View Portfolio</Button>
              </Link>
              <Link href={`/project/${project.slug}`} className="flex-1">
                <Button variant="outline" size="lg" className="w-full">Back to {project.tokenSymbol}</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
