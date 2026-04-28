"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Clock, ArrowLeft, AlertCircle, Coins, Bell,
  Pencil, X, Check, Upload, ImageIcon, Globe, Star, Rocket,
  BarChart3, Users, Blocks,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useConfig } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { encodeFunctionData, zeroAddress, parseUnits, type Abi } from "viem";
import { Badge, Spinner, Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { resolveMediaUrl } from "@/lib/utils/mediaUrl";
import { SaleContractActions } from "@/components/molecules/SaleContractActions";
import { AddPhaseForm } from "@/components/molecules/AddPhaseForm";
import RichTextEditor from "@/components/molecules/RichTextEditor";
import { SaleContentReview } from "@/components/molecules/SaleContentReview";
import { SaleSetupChecklist } from "@/components/molecules/SaleSetupChecklist";
import { ProgressBar } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";
import {
  getSale, submitSaleForApproval, updateSale, setHeroImage,
  addSaleImage, removeSaleImage,
  type Sale, type UpdateSaleRequest,
} from "@/lib/api/repositories/sales";
import { apiFetch, apiUpload } from "@/lib/api/client";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";
import { SALE_FACTORY_ABI } from "@/lib/contracts/abis/saleFactory";
import { requireAddress, getAddressUrl } from "@/lib/contracts/addresses";
import { getChainId } from "@/lib/chain";
import { PLATFORM_FEE_MANAGER_ABI } from "@/lib/contracts/abis/platformFeeManager";
import { readContract } from "wagmi/actions";
import { OTCTokenManager } from "@/components/organisms/OTCTokenManager";

/** Read fee from PlatformFeeManager on-chain (fallback when useReadContract hook didn't fire) */
async function readFeeFromChain(
  config: ReturnType<typeof import("wagmi").useConfig>,
  feeManager: `0x${string}`,
  issuer: `0x${string}`,
): Promise<bigint> {
  try {
    const fee = await readContract(config, {
      address: feeManager,
      abi: PLATFORM_FEE_MANAGER_ABI as unknown as Abi,
      functionName: "getFeeForIssuer",
      args: [issuer],
    });
    console.log("[deploySale] Fee read on-chain:", fee);
    return BigInt(fee as number);
  } catch (e) {
    console.error("[deploySale] Failed to read fee on-chain:", e);
    throw new Error("Could not read issuer fee from PlatformFeeManager. Check the contract address.");
  }
}

interface SaleImage {
  id: string;
  url: string;
  caption?: string;
  is_banner?: boolean;
  sort_order?: number;
  media_type?: string;
  video_url?: string;
}

function SubscribersSummary({ saleId }: { saleId: string }) {
  const [count, setCount] = useState(0);
  const [unnotified, setUnnotified] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ items: { notified_at: string | null }[]; total: number }>(`/api/v1/sales/${saleId}/subscribers`);
        setCount(data.total);
        setUnnotified(data.items.filter((s) => !s.notified_at).length);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [saleId]);

  const handleNotify = async () => {
    setNotifying(true);
    setNotifyResult(null);
    try {
      const result = await apiFetch<{ notified: number; message: string }>(`/api/v1/sales/${saleId}/notify-subscribers`, { method: "POST", body: {} });
      setNotifyResult(result.message);
      setUnnotified((prev) => Math.max(0, prev - result.notified));
    } catch { setNotifyResult("Failed to send notifications"); }
    finally { setNotifying(false); }
  };

  if (loading || count === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg border border-zinc-100 p-4 mt-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/issuer/subscribers?sale_id=${saleId}`}
          className="flex items-center gap-2 text-sm font-medium text-darkAqua hover:underline"
        >
          <Bell className="h-4 w-4" />
          {count} subscriber{count !== 1 ? "s" : ""}
          {unnotified > 0 && (
            <span className="text-xs text-black/40 font-normal">({unnotified} not yet notified)</span>
          )}
        </Link>
        <div className="flex items-center gap-3">
          {notifyResult && <span className="text-xs text-green-600">{notifyResult}</span>}
          {unnotified > 0 && (
            <Button variant="primary" size="sm" onClick={handleNotify} isLoading={notifying}>
              Notify {unnotified}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function SaleDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const [editForm, setEditForm] = useState<UpdateSaleRequest>({});
  const [saving, setSaving] = useState(false);
  // Gallery management
  const [images, setImages] = useState<SaleImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Deployment sync
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Tab management
  const [activeTab, setActiveTab] = useState<"overview" | "phases" | "onchain" | "investors">("overview");

  // On-chain deployment
  const { isConnected, address: walletAddress } = useAccount();
  const wagmiConfig = useConfig();
  const { openConnectModal } = useConnectModal();
  const deployAction = useContractAction();
  const [configError, setConfigError] = useState<string | null>(null);

  // Read on-chain phase count for deployed sales
  const phaseDeployAction = useContractAction();
  const { data: onChainPhaseCount, refetch: refetchPhaseCount, error: phaseCountError, isLoading: phaseCountLoading } = useReadContract({
    address: (sale?.contract_address as `0x${string}`) || undefined,
    abi: SALE_ABI as unknown as Abi,
    functionName: "getPhaseCount",
    query: { enabled: !!sale?.contract_address },
  });
  const chainPhases = Number(onChainPhaseCount ?? 0);

  // Log contract call details for debugging
  useEffect(() => {
    if (sale?.contract_address) {
      console.log("[Phase Count Debug]", {
        contractAddress: sale.contract_address,
        onChainPhaseCount,
        chainPhases,
        error: phaseCountError,
        isLoading: phaseCountLoading,
        salePhaseLength: sale.phases.length
      });
    }
  }, [sale?.contract_address, onChainPhaseCount, chainPhases, phaseCountError, phaseCountLoading, sale?.phases.length]);

  // Read issuer fee from PlatformFeeManager
  const feeManagerAddr = (process.env.NEXT_PUBLIC_PLATFORM_FEE_MANAGER_ADDRESS as `0x${string}`) || undefined;
  const { data: issuerFeeBps } = useReadContract({
    address: feeManagerAddr,
    abi: PLATFORM_FEE_MANAGER_ABI as unknown as Abi,
    functionName: "getFeeForIssuer",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!feeManagerAddr && !!walletAddress },
  });

  useEffect(() => { paramsPromise.then((p) => setResolvedId(p.id)); }, [paramsPromise]);

  const reload = useCallback(async () => {
    if (!resolvedId) return;
    try {
      const s = await getSale(resolvedId);
      setSale(s);
    } catch { /* 404 */ }
  }, [resolvedId]);

  const loadImages = useCallback(async () => {
    if (!resolvedId) return;
    try {
      const imgs = await apiFetch<SaleImage[]>(`/api/v1/sales/${resolvedId}/images`);
      setImages(imgs);
    } catch { /* ignore */ }
  }, [resolvedId]);

  useEffect(() => {
    if (!resolvedId) return;
    (async () => {
      try {
        const s = await getSale(resolvedId);
        // Drafts that haven't been deployed yet belong in the wizard, not here.
        if (s.status === "draft" && !s.contract_address) {
          router.replace(`/issuer/sales/new?id=${resolvedId}`);
          return;
        }
        setSale(s);
      }
      catch { /* 404 */ }
      finally { setLoading(false); }
    })();
    loadImages();
  }, [resolvedId, loadImages, router]);

  const handleAction = async (action: string, fn: () => Promise<void>) => {
    setActionLoading(action); setActionError(null); setActionSuccess(null);
    try { await fn(); setActionSuccess(action); await reload(); }
    catch (err) { setActionError(err instanceof Error ? err.message : "Action failed"); }
    finally { setActionLoading(null); }
  };

  const handleSubmitForApproval = () => handleAction("submit", async () => {
    await submitSaleForApproval(resolvedId);
  });

  const handleConvertToLive = () => handleAction("convert", async () => {
    await apiFetch(`/api/v1/sales/${resolvedId}/convert-to-live`, { method: "POST", body: {} });
  });

  /**
   * Deploy Sale contract on-chain via CiretaSaleFactory.deploySale().
   * Encodes Sale.initialize() calldata with the correct parameters.
   */
  const handleDeployPhaseOnChain = async (phase: NonNullable<typeof sale>["phases"][0], tokenDecimals = 6) => {
    if (!sale?.contract_address) return;
    const pricePerToken = parseUnits(phase.price_per_token, 18);
    const allocation = parseUnits(phase.allocation, tokenDecimals);
    const minTokens = BigInt(phase.min_tokens || "1");
    const maxTokens = BigInt(phase.max_tokens || "0");
    const topUpMinTokens = BigInt(phase.top_up_min_tokens || "1");
    const startTimestamp = BigInt(Math.floor(new Date(phase.start_time).getTime() / 1000));
    const endTimestamp = BigInt(Math.floor(new Date(phase.end_time).getTime() / 1000));
    const allocationMode = (phase.allocation_mode === "remaining") ? 1 : 0;
    const receipt = await phaseDeployAction.execute({
      address: sale.contract_address as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "addPhase",
      args: [phase.name, pricePerToken, allocation, minTokens, maxTokens, topUpMinTokens, startTimestamp, endTimestamp, phase.whitelist_only ?? false, allocationMode],
    });
    if (receipt) {
      refetchPhaseCount();
      reload();
    }
  };

  const handleDeployAllPhases = async () => {
    if (!sale?.contract_address) return;
    for (let i = chainPhases; i < sale.phases.length; i++) {
      await handleDeployPhaseOnChain(sale.phases[i]!);
    }
  };

  const handleDeployOnChain = async () => {
    if (!sale || !walletAddress) {
      if (!isConnected) openConnectModal?.();
      return;
    }

    // Validate required addresses
    if (!sale.token_contract_address) {
      deployAction.reset();
      return;
    }
    const identityRegistryAddr = sale.identity_registry_address
      || process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS;
    if (!identityRegistryAddr) {
      deployAction.reset();
      return;
    }

    let saleFactoryAddress: `0x${string}`;
    let feeManagerAddress: `0x${string}`;
    let ciretaUsdcFallback: `0x${string}`;
    try {
      saleFactoryAddress = requireAddress("saleFactory");
      ciretaUsdcFallback = requireAddress("ciretaUsdc");
      feeManagerAddress = requireAddress("platformFeeManager");
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : "Missing contract address — check environment variables.");
      return;
    }
    setConfigError(null);

    // Use the issuer-selected payment token (set in the wizard), falling back
    // to the env-configured Cireta USDC mock only when the sale row has none.
    const isHexAddr = (s: string | null | undefined): s is `0x${string}` =>
      !!s && /^0x[0-9a-fA-F]{40}$/.test(s);
    const paymentTokenAddress: `0x${string}` = isHexAddr(sale.payment_token)
      ? sale.payment_token
      : ciretaUsdcFallback;

    const softCap = BigInt(Math.round(parseFloat(sale.soft_cap || "0") * 1e6));
    const hardCap = BigInt(Math.round(parseFloat(sale.hard_cap || "0") * 1e6));
    const otcTokenAddress = sale.otc_enabled ? (sale.otc_token_address ?? zeroAddress) : zeroAddress;

    // Round-5: derive sale window from phases (earliest start, latest end)
    const sortedPhases = [...sale.phases].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    const saleStartTime = sortedPhases.length > 0
      ? BigInt(Math.floor(new Date(sortedPhases[0]!.start_time).getTime() / 1000))
      : BigInt(Math.floor(Date.now() / 1000));
    // saleEndTime = 0 for open-ended sales, otherwise latest phase end
    const saleEndTime = sale.is_open_ended
      ? 0n
      : sortedPhases.length > 0
        ? BigInt(Math.floor(new Date(sortedPhases[sortedPhases.length - 1]!.end_time).getTime() / 1000))
        : BigInt(Math.floor(Date.now() / 1000) + 365 * 86400);
    // Total token supply in token-decimal units (default 6 decimals, 1M tokens)
    const totalTokenSupply = sale.total_token_supply
      ? BigInt(Math.round(parseFloat(sale.total_token_supply) * 1e6))
      : BigInt(1_000_000 * 1e6);

    // Debug: log all deployment arguments
    console.log("[deploySale] Resolved addresses:", {
      token: sale.token_contract_address,
      paymentToken: paymentTokenAddress,
      identityRegistry: identityRegistryAddr,
      issuer: walletAddress,
      factory: saleFactoryAddress,
      feeManager: feeManagerAddress,
      issuerFeeBps: issuerFeeBps ?? "FALLBACK→250",
      softCap: softCap.toString(),
      hardCap: hardCap.toString(),
      otcToken: otcTokenAddress,
      saleMode: sale.sale_mode,
      saleStartTime: saleStartTime.toString(),
      saleEndTime: saleEndTime.toString(),
      totalTokenSupply: totalTokenSupply.toString(),
    });

    // Encode Sale.initialize() calldata (round 5: 14 args)
    const initData = encodeFunctionData({
      abi: SALE_ABI,
      functionName: "initialize",
      args: [
        sale.token_contract_address as `0x${string}`,    // _token
        paymentTokenAddress,                               // _paymentToken (issuer-selected)
        identityRegistryAddr as `0x${string}`,             // _identityRegistry
        walletAddress,                                     // _issuer (connected wallet)
        saleFactoryAddress,                                // _factory
        feeManagerAddress,                                 // _feeManager
        softCap,                                           // _softCap
        hardCap,                                           // _hardCap
        issuerFeeBps != null ? BigInt(issuerFeeBps as number) : await readFeeFromChain(wagmiConfig, feeManagerAddress, walletAddress as `0x${string}`), // _feeBasisPoints
        BigInt(50_000 * 1e6),                              // _feeCapUsdc ($50k)
        otcTokenAddress as `0x${string}`,                  // _otcToken
        saleStartTime,                                     // _saleStartTime
        saleEndTime,                                       // _saleEndTime (0 = open-ended)
        totalTokenSupply,                                  // _totalTokenSupply
      ],
    });

    let receipt;
    if (sale.sale_mode === "vested") {
      // Vested mode: deploy with vault + fraction token
      const cliffSeconds = BigInt((sale.cliff_duration_days || 0) * 86400);
      const vestingSeconds = BigInt((sale.vesting_duration_days || 365) * 86400);
      receipt = await deployAction.execute({
        address: saleFactoryAddress,
        abi: SALE_FACTORY_ABI as unknown as Abi,
        functionName: "deploySaleVested",
        args: [
          sale.token_contract_address as `0x${string}`,
          initData,
          `${sale.token_name || "Token"} Fraction`,   // fractionName
          `f${sale.token_symbol || "TKN"}`,            // fractionSymbol
          6,                                            // fractionDecimals
          identityRegistryAddr as `0x${string}`,
          cliffSeconds,
          vestingSeconds,
          0,                                            // excessPolicy: Revert
        ],
      });
    } else {
      // Direct mode
      receipt = await deployAction.execute({
        address: saleFactoryAddress,
        abi: SALE_FACTORY_ABI as unknown as Abi,
        functionName: "deploySale",
        args: [sale.token_contract_address as `0x${string}`, initData],
      });
    }

    if (receipt) {
      // Save to localStorage as backup
      const pendingKey = `cireta_pending_sale_${resolvedId}`;
      localStorage.setItem(pendingKey, JSON.stringify({
        saleId: resolvedId, txHash: receipt.transactionHash, timestamp: Date.now(),
      }));

      await syncSaleDeployment(resolvedId, receipt.transactionHash, pendingKey);
    }
  };

  const syncSaleDeployment = async (saleId: string, txHash: string, pendingKey: string) => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      await apiFetch(`/api/v1/sales/${saleId}/record-deployment?tx_hash=${txHash}`, {
        method: "POST",
      });
      setSyncDone(true);
      localStorage.removeItem(pendingKey);
      await reload();
    } catch {
      setSyncError("Sale deployed on-chain but failed to sync. Click 'Retry Sync' to try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRetrySync = async () => {
    const pendingKey = `cireta_pending_sale_${resolvedId}`;
    const saved = localStorage.getItem(pendingKey);
    if (!saved) { setSyncError("No pending deployment found."); return; }
    const { txHash } = JSON.parse(saved);
    await syncSaleDeployment(resolvedId, txHash, pendingKey);
  };

  // Auto-retry pending deployment on page load
  useEffect(() => {
    if (!resolvedId || sale?.contract_address) return;
    const pendingKey = `cireta_pending_sale_${resolvedId}`;
    const saved = localStorage.getItem(pendingKey);
    if (saved && !syncDone) {
      const { txHash, timestamp } = JSON.parse(saved);
      if (Date.now() - timestamp < 3600000) { // within 1 hour
        syncSaleDeployment(resolvedId, txHash, pendingKey);
      }
    }
  }, [resolvedId, sale?.contract_address]);

  // Block navigation during deployment/syncing
  const isDeployingOrSyncing = deployAction.isPending || deployAction.isConfirming || isSyncing;
  useEffect(() => {
    if (!isDeployingOrSyncing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Deployment in progress. Are you sure you want to leave?";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDeployingOrSyncing]);

  // Auto-populate edit form when sale loads and ?edit=1
  useEffect(() => {
    if (sale && editing && !editForm.title) {
      setEditForm({
        title: sale.title ?? undefined,
        description: sale.description_text ?? undefined,
        full_description: sale.full_description ?? undefined,
        banner_image_url: sale.banner_image_url ?? undefined,
        otc_enabled: sale.otc_enabled,
        otc_content: sale.otc_content ?? undefined,
        website_url: sale.website_url ?? undefined,
        twitter_url: sale.twitter_url ?? undefined,
        linkedin_url: sale.linkedin_url ?? undefined,
        instagram_url: sale.instagram_url ?? undefined,
        facebook_url: sale.facebook_url ?? undefined,
        telegram_url: sale.telegram_url ?? undefined,
        discord_url: sale.discord_url ?? undefined,
      });
    }
  }, [sale, editing, editForm.title]);

  const startEditing = () => {
    if (!sale) return;
    setEditForm({
      title: sale.title ?? undefined,
      description: sale.description_text ?? undefined,
      full_description: sale.full_description ?? undefined,
      banner_image_url: sale.banner_image_url ?? undefined,
      otc_enabled: sale.otc_enabled,
      otc_content: sale.otc_content ?? undefined,
      website_url: sale.website_url ?? undefined,
      twitter_url: sale.twitter_url ?? undefined,
      linkedin_url: sale.linkedin_url ?? undefined,
      instagram_url: sale.instagram_url ?? undefined,
      facebook_url: sale.facebook_url ?? undefined,
      telegram_url: sale.telegram_url ?? undefined,
      discord_url: sale.discord_url ?? undefined,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true); setActionError(null);
    try {
      const updated = await updateSale(resolvedId, editForm);
      setSale(updated);
      setEditing(false);
      setActionSuccess("save");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save failed");
    } finally { setSaving(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadProgress(0);
    try {
      const result = await apiUpload(file, "sales", "public", (pct) => setUploadProgress(pct));
      const isVideo = file.type.startsWith("video/");
      await addSaleImage(resolvedId, {
        url: result.url,
        is_banner: images.length === 0,
        media_type: isVideo ? "video" : "image",
      });
      await loadImages();
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Upload failed");
    } finally { setUploading(false); setUploadProgress(0); }
  };

  const handleSetHero = async (imageId: string) => {
    try {
      await setHeroImage(resolvedId, imageId);
      await loadImages();
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to set hero");
    }
  };

  const handleRemoveImage = async (imageId: string) => {
    try {
      await removeSaleImage(resolvedId, imageId);
      await loadImages();
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove image");
    }
  };

  if (loading) return <IssuerDashboardLayout title="Sale Details" description=""><div className="flex justify-center py-24"><Spinner /></div></IssuerDashboardLayout>;
  if (!sale) return <IssuerDashboardLayout title="Sale Details" description=""><p className="text-center text-black/40 py-24">Sale not found</p></IssuerDashboardLayout>;

  const raised = parseFloat(sale.total_raised || "0");
  const cap = parseFloat(sale.hard_cap || "0");
  const soft = parseFloat(sale.soft_cap || "0");
  const pct = cap > 0 ? (raised / cap) * 100 : 0;
  const isDraft = sale.status === "draft";
  const isPending = sale.status === "pending_approval";
  const isApprovedComingSoon = sale.status === "approved_coming_soon";
  const isApproved = sale.status === "approved";
  const isActive = sale.status === "active";
  const isFinalizedSuccess = sale.status === "finalized_success" || sale.status === "finalized";
  const isFailed = sale.status === "finalized_failed" || sale.status === "failed";
  const isRejected = sale.status === "rejected";

  // Tab configuration
  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "phases", label: "Phases", icon: Clock },
    { id: "onchain", label: "On-Chain", icon: Blocks },
    { id: "investors", label: "Investors", icon: Users },
  ] as const;

  return (
    <IssuerDashboardLayout
      title={sale.title || sale.token_name || "Sale Details"}
      description={`Sale ID: ${sale.id}`}
      actions={
        <div className="flex items-center gap-3">
          {!editing && (
            <Button variant="secondary" onClick={startEditing}>
              <Pencil className="h-4 w-4 mr-2" /> Edit Details
            </Button>
          )}
          <Link href={`/issuer/sales/${resolvedId}/buyers`}>
            <Button variant="secondary">Buyers</Button>
          </Link>
          {sale.otc_enabled && (
            <Link href={`/issuer/sales/${resolvedId}/otc-mint`}>
              <Button variant="secondary">
                <Coins className="h-4 w-4 mr-2" /> Mint OTC Tokens
              </Button>
            </Link>
          )}
        </div>
      }
    >
      <div className="mb-6 flex items-center justify-between">
        <Link href="/issuer/sales" className="flex items-center gap-2 text-sm text-black/50 hover:text-text transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Sales
        </Link>
        <div className="flex items-center gap-3">
          {isDraft && !sale.contract_address && (
            <span className="text-xs text-zinc-400">Deploy on-chain to start setup</span>
          )}
          {isApprovedComingSoon && <Button variant="primary" onClick={handleConvertToLive} isLoading={actionLoading === "convert"}>
            Convert to Live Sale
          </Button>}
          {!sale.contract_address && !syncDone && sale.token_contract_address && (
            <Button
              variant="primary"
              onClick={handleDeployOnChain}
              disabled={isDeployingOrSyncing}
              isLoading={isDeployingOrSyncing}
            >
              <Rocket className="h-4 w-4 mr-2" />
              {isSyncing ? "Syncing..." : "Deploy On-Chain"}
            </Button>
          )}
          {(sale.contract_address || syncDone) && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <p className="font-semibold">Sale Contract Deployed</p>
              </div>
              {sale.contract_address && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(sale.contract_address!)}
                    title="Click to copy address"
                    className="inline-flex items-center gap-1.5 font-mono text-xs bg-green-100 hover:bg-green-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    {sale.contract_address.slice(0, 6)}...{sale.contract_address.slice(-4)}
                    <svg className="h-3 w-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </button>
                  <a
                    href={getAddressUrl(getChainId(), sale.contract_address) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View on BaseScan"
                    className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800 transition-colors"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View on BaseScan
                  </a>
                </div>
              )}
            </div>
          )}
          {isFinalizedSuccess && (
            <Badge variant="active" size="sm">Finalized</Badge>
          )}
        </div>
      </div>

      {actionError && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600"><AlertCircle className="h-4 w-4 inline mr-1" />{actionError}</div>}
      {actionSuccess && <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-600">Changes saved successfully</div>}
      {syncError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
          <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 flex-shrink-0" /> {syncError}</div>
          <Button variant="outline" size="sm" onClick={handleRetrySync} className="mt-2" isLoading={isSyncing} disabled={isSyncing}>
            Retry Sync
          </Button>
        </div>
      )}
      {isSyncing && (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700 flex items-center gap-2">
          <div className="h-4 w-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
          Syncing sale contract address — please wait...
        </div>
      )}

      {/* On-chain deployment status */}
      {isApproved && !sale.contract_address && !sale.token_contract_address && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 inline mr-1" />
          Token must be deployed on-chain before the sale can be deployed. Go to your token and deploy it first.
        </div>
      )}
      {configError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 inline mr-1" />
          {configError}
        </div>
      )}
      <TransactionStatus
        isPending={deployAction.isPending}
        isConfirming={deployAction.isConfirming}
        isConfirmed={deployAction.isConfirmed}
        txHash={deployAction.txHash}
        txUrl={deployAction.txUrl}
        error={deployAction.error}
        successMessage="Sale contract deployed on-chain. Address recorded."
      />


      {/* Status Banner */}
      {isPending && <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">Pending admin approval. You&apos;ll be notified once reviewed.</div>}
      {isRejected && <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">Sale was rejected. Edit and resubmit.</div>}
      {isFailed && <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">Sale failed to reach soft cap. Buyers can claim refunds.</div>}

      {/* Edit Form */}
      {editing && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg p-6 border border-darkAqua/30 mb-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">Edit Sale Details</h2>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button variant="primary" onClick={handleSave} isLoading={saving}>
                <Check className="h-4 w-4 mr-1" /> Save Changes
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Title</label>
              <input
                type="text"
                value={editForm.title ?? ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
                placeholder="Sale title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Short Description</label>
              <textarea
                value={editForm.description ?? ""}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
                rows={3}
                placeholder="Brief description of the sale"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Full Description</label>
              <RichTextEditor
                content={editForm.full_description ?? ""}
                onChange={(html) => setEditForm({ ...editForm, full_description: html })}
                placeholder="Write a detailed description..."
              />
            </div>
          </div>

          {/* OTC Details */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
              <Coins className="h-4 w-4" /> OTC / Bank Transfer
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.otc_enabled ?? false}
                  onChange={(e) => setEditForm({ ...editForm, otc_enabled: e.target.checked })}
                  className="rounded border-zinc-300 text-darkAqua focus:ring-darkAqua"
                />
                Enable OTC / Bank Transfer purchases
              </label>
              {editForm.otc_enabled && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">OTC Instructions</label>
                  <RichTextEditor
                    content={editForm.otc_content ?? ""}
                    onChange={(html) => setEditForm({ ...editForm, otc_content: html })}
                    placeholder="Bank transfer details, instructions for OTC buyers..."
                  />
                </div>
              )}
            </div>
          </div>

          {/* Social Links */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
              <Globe className="h-4 w-4" /> Social Links
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {([
                ["website_url", "Website URL"],
                ["twitter_url", "Twitter / X"],
                ["linkedin_url", "LinkedIn"],
                ["telegram_url", "Telegram"],
                ["discord_url", "Discord"],
                ["instagram_url", "Instagram"],
                ["facebook_url", "Facebook"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                  <input
                    type="url"
                    value={(editForm as Record<string, string | undefined>)[key] ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value || undefined })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
                    placeholder={`https://...`}
                  />
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="border-b border-zinc-200">
          <nav className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? "border-darkAqua text-darkAqua"
                      : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Sale Overview Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg border border-zinc-100 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-black/60 uppercase tracking-wide">Funding Progress</h2>
              <Badge variant={isActive ? "active" : isDraft ? "pending" : "default"} size="sm" className="capitalize">
                {sale.status === "approved_coming_soon" ? "Coming Soon" : sale.status === "pending_approval" ? "Pending" : sale.status.replace(/_/g, " ")}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-5">
              {[
                { label: "Total Raised", value: formatCurrency(raised), color: "text-darkAqua", bg: "bg-darkAqua/10" },
                { label: "Hard Cap", value: formatCurrency(cap), color: "text-blue-600", bg: "bg-blue-50" },
                { label: "Soft Cap", value: formatCurrency(soft), color: "text-amber-600", bg: "bg-amber-50" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-[11px] font-medium text-black/40 uppercase tracking-wide mb-1">{s.label}</p>
                  <p className="text-lg font-bold text-text">{s.value}</p>
                </div>
              ))}
            </div>

            <ProgressBar value={pct} size="md" />
            <div className="flex justify-between text-xs mt-2 text-black/40">
              <span>{formatCurrency(raised)} raised</span>
              <span>{pct.toFixed(1)}% of {formatCurrency(cap)}</span>
            </div>
          </motion.div>

          {/* Media Gallery */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg border border-zinc-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-black/60 uppercase tracking-wide flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Media Gallery
              </h2>
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors">
                <Upload className="h-4 w-4" />
                {uploading ? `Uploading ${uploadProgress}%` : "Upload Media"}
                <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>

            {images.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {images.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((img) => (
                  <div key={img.id} className={`relative rounded-lg overflow-hidden border-2 group ${img.is_banner ? "border-darkAqua ring-2 ring-darkAqua/20" : "border-zinc-100"}`}>
                    <div className="relative h-32">
                      {img.media_type === "video" ? (
                        <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                          <video src={resolveMediaUrl(img.url)} className="w-full h-full object-cover" muted />
                        </div>
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={resolveMediaUrl(img.url)} alt={img.caption || ""} className="w-full h-full object-cover" />
                      )}
                      {img.is_banner && (
                        <span className="absolute top-1.5 left-1.5 bg-darkAqua text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">HERO</span>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        {!img.is_banner && (
                          <button
                            onClick={() => handleSetHero(img.id)}
                            className="w-8 h-8 rounded-md bg-white/90 flex items-center justify-center text-darkAqua hover:bg-white"
                            title="Set as hero"
                          >
                            <Star className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveImage(img.id)}
                          className="w-8 h-8 rounded-md bg-white/90 flex items-center justify-center text-red-500 hover:bg-white"
                          title="Remove"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {img.caption && <p className="text-[11px] text-zinc-500 px-2 py-1.5 truncate">{img.caption}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <ImageIcon className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
                <p className="text-zinc-400 text-sm">No media uploaded. Upload an image or video to set as the hero.</p>
              </div>
            )}
          </motion.div>

          {/* Sale Content Review */}
          <div>
            <SaleContentReview saleId={sale.id} description={sale.description_text} fullDescription={sale.full_description} editable />
          </div>
        </div>
      )}

      {activeTab === "phases" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg border border-zinc-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-black/60 uppercase tracking-wide">Phases</h2>
          <div className="flex items-center gap-2">
            {sale.contract_address && (
              <Button variant="secondary" size="sm" onClick={() => refetchPhaseCount()}>
                🔄 Refresh Status
              </Button>
            )}
            {sale.contract_address && sale.phases.length > chainPhases && (
              <Button variant="outline" size="sm" onClick={handleDeployAllPhases}
                disabled={phaseDeployAction.isPending || phaseDeployAction.isConfirming}
                isLoading={phaseDeployAction.isPending || phaseDeployAction.isConfirming}>
                Deploy All On-Chain ({sale.phases.length - chainPhases} pending)
              </Button>
            )}
          </div>
        </div>
        {sale.contract_address && (
          <div className="mb-3 text-xs text-black/40">
            {chainPhases} of {sale.phases.length} phase{sale.phases.length !== 1 ? "s" : ""} deployed on-chain
            <span className="ml-2 text-blue-500 font-mono">
              [Debug: chainPhases={chainPhases}, onChainPhaseCount={String(onChainPhaseCount)}, enabled={!!sale?.contract_address}]
            </span>
          </div>
        )}
        <TransactionStatus
          isPending={phaseDeployAction.isPending} isConfirming={phaseDeployAction.isConfirming}
          isConfirmed={phaseDeployAction.isConfirmed} txHash={phaseDeployAction.txHash}
          txUrl={phaseDeployAction.txUrl} error={phaseDeployAction.error}
          successMessage="Phase deployed on-chain."
        />
        {sale.phases.length === 0 ? (
          <p className="text-black/30 text-center py-6 text-sm">No phases configured yet</p>
        ) : (
          <div className="space-y-3">
            {sale.phases.map((phase, idx) => {
              const phaseSold = parseFloat(phase.sold || "0");
              const phaseAlloc = parseFloat(phase.allocation || "0");
              const phasePct = phaseAlloc > 0 ? (phaseSold / phaseAlloc) * 100 : 0;
              const isOnChain = sale.contract_address ? idx < chainPhases : false;
              // Time-based phase status
              const phaseNow = Date.now();
              const phaseStart = new Date(phase.start_time).getTime();
              const phaseEnd = new Date(phase.end_time).getTime();
              const phaseStatus: "upcoming" | "active" | "ended" =
                phaseNow < phaseStart ? "upcoming" : phaseNow >= phaseEnd ? "ended" : "active";
              // Time display helpers
              const timeDiff = phaseStatus === "active"
                ? phaseEnd - phaseNow
                : phaseStatus === "ended"
                  ? phaseNow - phaseEnd
                  : phaseStart - phaseNow;
              const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
              const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
              const timeLabel = phaseStatus === "active"
                ? days > 0 ? `${days}d ${hours}h remaining` : `${hours}h remaining`
                : phaseStatus === "ended"
                  ? days > 0 ? `Ended ${days}d ago` : `Ended ${hours}h ago`
                  : days > 0 ? `Starts in ${days}d ${hours}h` : `Starts in ${hours}h`;
              return (
                <div key={phase.id} className={`p-4 rounded-lg border transition-colors ${isOnChain ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-md bg-darkAqua/10 text-darkAqua flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                      <p className="font-medium text-sm text-text">{phase.name}</p>
                      {/* Time-based status badge */}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                        phaseStatus === "active" ? "bg-green-100 text-green-700"
                          : phaseStatus === "upcoming" ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        {phaseStatus === "active" ? "Active" : phaseStatus === "upcoming" ? "Upcoming" : "Ended"}
                      </span>
                      {sale.contract_address && (
                        isOnChain
                          ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-green-100 text-green-700">On-Chain</span>
                          : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">Not Deployed</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {sale.contract_address && !isOnChain && (
                        <Button variant="outline" size="sm" onClick={() => handleDeployPhaseOnChain(phase)}
                          disabled={phaseDeployAction.isPending || phaseDeployAction.isConfirming}>
                          Deploy On-Chain
                        </Button>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-black/40">
                        <Clock className="h-3 w-3" />
                        <span>{phase.start_time.slice(0, 10)} → {phase.end_time.slice(0, 10)}</span>
                      </div>
                      <span className={`text-[10px] font-medium ${
                        phaseStatus === "active" ? "text-green-600" : phaseStatus === "upcoming" ? "text-blue-600" : "text-gray-400"
                      }`}>
                        {timeLabel}
                      </span>
                    </div>
                  </div>
                  <ProgressBar value={phasePct} size="sm" />
                  <div className="flex justify-between text-xs mt-2 text-black/40">
                    <span>Price: <span className="text-text font-medium">${parseFloat(phase.price_per_token).toLocaleString()}</span></span>
                    <span>{phaseSold.toLocaleString()} / {phaseAlloc.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {sale.contract_address && (isDraft || isApproved || isApprovedComingSoon || isActive) && (() => {
          const totalAllocated = sale.phases.reduce((s, p) => s + parseFloat(p.allocation || "0"), 0);
          const available = cap > 0 ? cap - totalAllocated : undefined;
          return (
          <div className="mt-4">
            <AddPhaseForm
              contractAddress={sale.contract_address}
              saleId={sale.id}
              availableSupply={available}
              existingPhases={sale.phases}
              onSuccess={reload}
            />
          </div>
          );
        })()}
        </motion.div>
      )}

      {activeTab === "onchain" && (
        <div className="space-y-6">
          {/* Setup Checklist */}
          <SaleSetupChecklist
            sale={sale as Parameters<typeof SaleSetupChecklist>[0]["sale"]}
            onReload={reload}
            onSubmitForApproval={handleSubmitForApproval}
            isSubmitting={actionLoading === "submit"}
          />

          {/* On-Chain Contract Actions */}
          {sale.contract_address && (
            <SaleContractActions
              contractAddress={sale.contract_address}
              saleStatus={sale.status}
              onSuccess={reload}
            />
          )}
        </div>
      )}

      {activeTab === "investors" && (
        <div className="space-y-6">
          {/* Subscribers Summary */}
          <SubscribersSummary saleId={sale.id} />

          {/* Per-Phase Whitelist Management - Hidden until needed for other issuers
          {sale?.contract_address && sale.phases.some((p) => p.whitelist_only) && (
            <WhitelistManager
              saleContractAddress={sale.contract_address as `0x${string}`}
              phases={sale.phases}
            />
          )}
          */}

          {/* OTC Token Manager */}
          {sale.contract_address && isDraft && (
            <OTCTokenManager
              saleContractAddress={sale.contract_address as `0x${string}`}
              currentOTCTokenAddress={sale.otc_token_address}
            />
          )}
        </div>
      )}

    </IssuerDashboardLayout>
  );
}
