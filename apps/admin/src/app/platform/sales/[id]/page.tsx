"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, Clock, ArrowLeft, CheckCircle2, XCircle, Flag,
  AlertCircle, Zap, Pause, Play, ShieldAlert, Eye, EyeOff,
  Timer, Power, RefreshCw, Calendar,
} from "lucide-react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Abi, isAddress } from "viem";
import { Badge, Spinner, Button } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { SaleContentReview } from "@/components/molecules/SaleContentReview";
import { ProgressBar } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";
import { getSale, type Sale } from "@/lib/api/repositories/sales";
import { apiFetch, getAccessToken } from "@/lib/api/client";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";

function getToken() { return getAccessToken() ?? undefined; }

export default function AdminSaleDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [emergencyRecipient, setEmergencyRecipient] = useState("");
  // Extend phase state
  const [extendPhaseId, setExtendPhaseId] = useState<number | null>(null);
  const [extendNewEnd, setExtendNewEnd] = useState("");

  // On-chain actions
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const activateAction = useContractAction();
  const rejectAction = useContractAction();

  // Pre-activation on-chain checks
  const { data: onChainPhaseCount } = useReadContract({
    address: sale?.contract_address as `0x${string}`,
    abi: SALE_ABI as unknown as Abi,
    functionName: "getPhaseCount",
    query: { enabled: !!sale?.contract_address },
  });
  const { data: vaultAddr } = useReadContract({
    address: sale?.contract_address as `0x${string}`,
    abi: SALE_ABI as unknown as Abi,
    functionName: "vault",
    query: { enabled: !!sale?.contract_address && sale?.sale_mode === "vested" },
  });
  // Read token balance in sale (direct) or vault (vested)
  const tokenBalanceTarget = sale?.sale_mode === "vested" && vaultAddr
    ? (vaultAddr as string) : sale?.contract_address;
  const ERC20_BALANCE_ABI = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
  const { data: tokenDepositBalance } = useReadContract({
    address: sale?.token_contract_address as `0x${string}`,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: tokenBalanceTarget ? [tokenBalanceTarget as `0x${string}`] : undefined,
    query: { enabled: !!sale?.token_contract_address && !!tokenBalanceTarget },
  });
  const chainPhases = Number(onChainPhaseCount ?? 0);
  const tokensDeposited = Number(tokenDepositBalance ?? 0) > 0;
  const pauseAction = useContractAction();
  const unpauseAction = useContractAction();
  const finalizeAction = useContractAction();
  const emergencyAction = useContractAction();
  const closeSaleAction = useContractAction();
  const extendPhaseAction = useContractAction();
  const activateRefundsAction = useContractAction();

  useEffect(() => { paramsPromise.then((p) => setResolvedId(p.id)); }, [paramsPromise]);
  useEffect(() => {
    if (!resolvedId) return;
    (async () => {
      try { setSale(await getSale(resolvedId, getToken())); }
      catch { /* 404 */ }
      finally { setLoading(false); }
    })();
  }, [resolvedId]);

  const reload = async () => {
    if (!resolvedId) return;
    try { setSale(await getSale(resolvedId, getToken())); } catch {}
  };

  const handleAction = async (action: string, fn: () => Promise<void>) => {
    setActionLoading(action); setActionError(null); setActionSuccess(null);
    try { await fn(); setActionSuccess(action); await reload(); }
    catch (err) { setActionError(err instanceof Error ? err.message : "Action failed"); }
    finally { setActionLoading(null); }
  };

  const handleToggleVisibility = () => handleAction("visibility", async () => {
    await apiFetch(`/api/v1/admin/sales/${resolvedId}/toggle-visibility`, { method: "POST", body: {}, token: getToken() });
  });

  const handleApprove = () => handleAction("approve", async () => {
    await apiFetch(`/api/v1/admin/sales/${resolvedId}/approve`, { method: "POST", body: {}, token: getToken() });
  });

  const handleReject = () => handleAction("reject", async () => {
    await apiFetch(`/api/v1/admin/sales/${resolvedId}/reject`, { method: "POST", body: { reason: rejectReason || undefined }, token: getToken() });
  });

  const requireWallet = () => {
    if (!isConnected) { openConnectModal?.(); return false; }
    return true;
  };

  const handleActivateOnChain = async () => {
    if (!sale?.contract_address || !requireWallet()) return;
    const receipt = await activateAction.execute({
      address: sale.contract_address as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "activate",
    });
    if (receipt) {
      try {
        await apiFetch(`/api/v1/admin/sales/${resolvedId}/activate`, { method: "POST", body: { tx_hash: receipt.transactionHash }, token: getToken() });
      } catch { /* on-chain is source of truth */ }
      await reload();
    }
  };

  const handleRejectOnChain = async () => {
    if (!sale?.contract_address || !requireWallet()) return;
    await rejectAction.execute({
      address: sale.contract_address as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "reject",
    });
    await reload();
  };

  const handlePauseOnChain = async () => {
    if (!sale?.contract_address || !requireWallet()) return;
    await pauseAction.execute({
      address: sale.contract_address as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "pause",
    });
    await reload();
  };

  const handleUnpauseOnChain = async () => {
    if (!sale?.contract_address || !requireWallet()) return;
    await unpauseAction.execute({
      address: sale.contract_address as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "unpause",
    });
    await reload();
  };

  const handleFinalizeOnChain = async () => {
    if (!sale?.contract_address || !requireWallet()) return;
    await finalizeAction.execute({
      address: sale.contract_address as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "finalizeSale",
    });
    await reload();
  };

  const handleCloseSale = async (failed: boolean) => {
    if (!sale?.contract_address || !requireWallet()) return;
    const receipt = await closeSaleAction.execute({
      address: sale.contract_address as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "closeSale",
      args: [failed],
    });
    if (receipt) {
      try {
        await apiFetch(`/api/v1/sales/${resolvedId}/finalize`, { method: "POST", body: { tx_hash: receipt.transactionHash }, token: getToken() });
      } catch { /* on-chain is source of truth */ }
      await reload();
    }
  };

  const handleExtendPhase = async () => {
    if (!sale?.contract_address || !requireWallet() || extendPhaseId === null || !extendNewEnd) return;
    const newEndTimestamp = BigInt(Math.floor(new Date(extendNewEnd).getTime() / 1000));
    const receipt = await extendPhaseAction.execute({
      address: sale.contract_address as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "extendPhase",
      args: [BigInt(extendPhaseId), newEndTimestamp],
    });
    if (receipt) {
      setExtendPhaseId(null);
      setExtendNewEnd("");
      await reload();
    }
  };

  const handleActivateRefunds = async () => {
    if (!sale?.contract_address || !requireWallet()) return;
    const receipt = await activateRefundsAction.execute({
      address: sale.contract_address as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "activateRefunds",
    });
    if (receipt) {
      try {
        await apiFetch(`/api/v1/sales/${resolvedId}/activate-refunds`, { method: "POST", body: { tx_hash: receipt.transactionHash }, token: getToken() });
      } catch { /* on-chain is source of truth */ }
      await reload();
    }
  };

  const handleEmergencyWithdraw = async () => {
    if (!sale?.contract_address || !requireWallet() || !emergencyRecipient) return;
    await emergencyAction.execute({
      address: sale.contract_address as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "emergencyWithdraw",
      args: [emergencyRecipient as `0x${string}`],
    });
    await reload();
  };

  if (loading) return <PlatformAdminLayout title="Sale Details" description=""><div className="flex justify-center py-24"><Spinner /></div></PlatformAdminLayout>;
  if (!sale) return <PlatformAdminLayout title="Sale Details" description=""><p className="text-center text-black/40 py-24">Sale not found</p></PlatformAdminLayout>;

  const raised = parseFloat(sale.total_raised || "0");
  const cap = parseFloat(sale.hard_cap || "0");
  const soft = parseFloat(sale.soft_cap || "0");
  const pct = cap > 0 ? (raised / cap) * 100 : 0;
  const isPending = sale.status === "pending_approval";
  const isApproved = sale.status === "approved" || sale.status === "approved_coming_soon";
  const isActive = sale.status === "active";
  const isPaused = sale.status === "paused";
  const isFinalizedSuccess = sale.status === "finalized_success" || sale.status === "finalized";
  const isFinalizedFailed = sale.status === "finalized_failed" || sale.status === "failed";
  const isRejected = sale.status === "rejected";
  const hasContract = !!sale.contract_address;
  const isOpenEnded = sale.is_open_ended;

  return (
    <PlatformAdminLayout title={sale.title || sale.token_name || "Sale Review"} description={`Sale ID: ${sale.id}`}>
      <div className="mb-6">
        <Link href="/platform/sales" className="flex items-center gap-2 text-sm text-black/50 hover:text-text transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Sales
        </Link>
      </div>

      {actionError && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600"><AlertCircle className="h-4 w-4 inline mr-1" />{actionError}</div>}
      {actionSuccess && <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-600"><CheckCircle2 className="h-4 w-4 inline mr-1" />Action completed</div>}

      {/* ── Rejected (DB) ── */}
      {isRejected && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <p className="font-semibold mb-1">Sale rejected — not visible on launchpad</p>
          <p>Issuer can edit and resubmit for approval.</p>
        </div>
      )}

      {/* ── Pending — No contract and NOT coming soon ── */}
      {isPending && !hasContract && !sale.is_coming_soon && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 rounded-lg p-6 border border-amber-200 mb-6">
          <h2 className="text-lg font-semibold text-amber-800 mb-2">Pending Approval — Not Deployed</h2>
          <p className="text-sm text-amber-700">Issuer has submitted for approval but hasn&apos;t deployed the sale contract on-chain yet. Cannot approve until deployed.</p>
        </motion.div>
      )}

      {/* ── Pending — Has contract OR is coming soon → Approve or Reject ── */}
      {isPending && (hasContract || sale.is_coming_soon) && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 rounded-lg p-6 border border-amber-200 mb-6">
          <h2 className="text-lg font-semibold text-amber-800 mb-2">
            {sale.is_coming_soon ? "Pending Approval — Coming Soon" : "Pending Approval — Deployed"}
          </h2>
          {hasContract && (
            <p className="text-sm text-amber-700 mb-1">
              Sale deployed at <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">{sale.contract_address}</code>
            </p>
          )}
          <p className="text-sm text-amber-700 mb-4">
            {sale.is_coming_soon
              ? "Approve to list as Coming Soon on the launchpad. No contract deployment needed."
              : "Approve to allow the issuer to proceed. You can control launchpad visibility separately after approval."}
          </p>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={handleApprove} isLoading={actionLoading === "approve"}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
            </Button>
            <div className="flex items-center gap-2">
              <input type="text" placeholder="Rejection reason (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                className="rounded-lg border border-black/10 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-red-300" />
              <Button variant="outline" onClick={handleReject} isLoading={actionLoading === "reject"} className="text-red-600 border-red-200 hover:bg-red-50">
                <XCircle className="h-4 w-4 mr-2" /> Reject
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Approved — Ready to Activate (+ Reject On-Chain option) ── */}
      {isApproved && hasContract && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-teal-50 rounded-lg p-6 border border-teal-200 mb-6">
          <h2 className="text-lg font-semibold text-teal-800 mb-2">Approved — Ready to Activate</h2>
          <p className="text-sm text-teal-700 mb-1">
            Deployed at <code className="font-mono text-xs bg-teal-100 px-1.5 py-0.5 rounded">{sale.contract_address}</code>
          </p>
          <p className="text-sm text-teal-700 mb-3">Activate on-chain to enable purchases. You can control launchpad visibility after activation.</p>
          {(chainPhases === 0 || !tokensDeposited) && (
            <div className="mb-4 space-y-2">
              {chainPhases === 0 && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> No phases configured on-chain. Issuer must deploy phases before activation.
                </div>
              )}
              {!tokensDeposited && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> No tokens deposited in {sale.sale_mode === "vested" ? "vault" : "sale contract"}. Issuer must deposit project tokens first.
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={handleActivateOnChain}
              disabled={activateAction.isPending || activateAction.isConfirming || chainPhases === 0 || !tokensDeposited}
              isLoading={activateAction.isPending || activateAction.isConfirming}>
              <Zap className="h-4 w-4 mr-2" /> Activate On-Chain
            </Button>
            <Button variant="outline" onClick={handleRejectOnChain} disabled={rejectAction.isPending || rejectAction.isConfirming} isLoading={rejectAction.isPending || rejectAction.isConfirming} className="text-red-600 border-red-200 hover:bg-red-50">
              <XCircle className="h-4 w-4 mr-2" /> Reject On-Chain
            </Button>
          </div>
          <TransactionStatus isPending={activateAction.isPending} isConfirming={activateAction.isConfirming} isConfirmed={activateAction.isConfirmed} txHash={activateAction.txHash} txUrl={activateAction.txUrl} error={activateAction.error} successMessage="Sale activated — now live for buyers." />
          <TransactionStatus isPending={rejectAction.isPending} isConfirming={rejectAction.isConfirming} isConfirmed={rejectAction.isConfirmed} txHash={rejectAction.txHash} txUrl={rejectAction.txUrl} error={rejectAction.error} successMessage="Sale rejected on-chain — permanently blocked." />
        </motion.div>
      )}

      {/* ── Approved but no contract ── */}
      {isApproved && !hasContract && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-green-50 rounded-lg p-6 border border-green-200 mb-6">
          <h2 className="text-lg font-semibold text-green-800 mb-2">Approved — Waiting for Deploy</h2>
          <p className="text-sm text-green-700">Sale is approved for visibility. Waiting for issuer to deploy the contract on-chain.</p>
        </motion.div>
      )}

      {/* ── Active — Pause / Finalize / Close ── */}
      {isActive && hasContract && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-blue-50 rounded-lg p-6 border border-blue-200 mb-6">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">
            Sale is Live{isOpenEnded ? " (Open-Ended)" : ""}
          </h2>
          <p className="text-sm text-blue-700 mb-4">
            Buyers can buy. You can pause, finalize{isOpenEnded ? ", or close" : ""} from your admin wallet.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" onClick={handlePauseOnChain} disabled={pauseAction.isPending || pauseAction.isConfirming} isLoading={pauseAction.isPending || pauseAction.isConfirming} className="text-amber-600 border-amber-200 hover:bg-amber-50">
              <Pause className="h-4 w-4 mr-2" /> Pause Sale
            </Button>
            <Button variant="primary" onClick={handleFinalizeOnChain} disabled={finalizeAction.isPending || finalizeAction.isConfirming} isLoading={finalizeAction.isPending || finalizeAction.isConfirming}>
              <Flag className="h-4 w-4 mr-2" /> Finalize Sale
            </Button>
            {isOpenEnded && (
              <>
                <Button variant="outline" onClick={() => handleCloseSale(false)} disabled={closeSaleAction.isPending || closeSaleAction.isConfirming} isLoading={closeSaleAction.isPending || closeSaleAction.isConfirming}>
                  <Power className="h-4 w-4 mr-2" /> Close Sale (Success)
                </Button>
                <Button variant="outline" onClick={() => handleCloseSale(true)} disabled={closeSaleAction.isPending || closeSaleAction.isConfirming} isLoading={closeSaleAction.isPending || closeSaleAction.isConfirming} className="text-red-600 border-red-200 hover:bg-red-50">
                  <Power className="h-4 w-4 mr-2" /> Close Sale (Failed)
                </Button>
              </>
            )}
          </div>
          <TransactionStatus isPending={pauseAction.isPending} isConfirming={pauseAction.isConfirming} isConfirmed={pauseAction.isConfirmed} txHash={pauseAction.txHash} txUrl={pauseAction.txUrl} error={pauseAction.error} successMessage="Sale paused." />
          <TransactionStatus isPending={finalizeAction.isPending} isConfirming={finalizeAction.isConfirming} isConfirmed={finalizeAction.isConfirmed} txHash={finalizeAction.txHash} txUrl={finalizeAction.txUrl} error={finalizeAction.error} successMessage="Sale finalized." />
          <TransactionStatus isPending={closeSaleAction.isPending} isConfirming={closeSaleAction.isConfirming} isConfirmed={closeSaleAction.isConfirmed} txHash={closeSaleAction.txHash} txUrl={closeSaleAction.txUrl} error={closeSaleAction.error} successMessage="Sale closed." />
        </motion.div>
      )}

      {/* ── Paused — Unpause / Close ── */}
      {isPaused && hasContract && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 rounded-lg p-6 border border-amber-200 mb-6">
          <h2 className="text-lg font-semibold text-amber-800 mb-2">Sale Paused</h2>
          <p className="text-sm text-amber-700 mb-4">This sale is paused. Only admin can unpause (regulatory control).</p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="primary" onClick={handleUnpauseOnChain} disabled={unpauseAction.isPending || unpauseAction.isConfirming} isLoading={unpauseAction.isPending || unpauseAction.isConfirming}>
              <Play className="h-4 w-4 mr-2" /> Unpause Sale
            </Button>
            <Button variant="outline" onClick={handleFinalizeOnChain} disabled={finalizeAction.isPending || finalizeAction.isConfirming} isLoading={finalizeAction.isPending || finalizeAction.isConfirming}>
              <Flag className="h-4 w-4 mr-2" /> Finalize Instead
            </Button>
            {isOpenEnded && (
              <Button variant="outline" onClick={() => handleCloseSale(true)} disabled={closeSaleAction.isPending || closeSaleAction.isConfirming} isLoading={closeSaleAction.isPending || closeSaleAction.isConfirming} className="text-red-600 border-red-200 hover:bg-red-50">
                <Power className="h-4 w-4 mr-2" /> Close Sale (Failed)
              </Button>
            )}
          </div>
          <TransactionStatus isPending={unpauseAction.isPending} isConfirming={unpauseAction.isConfirming} isConfirmed={unpauseAction.isConfirmed} txHash={unpauseAction.txHash} txUrl={unpauseAction.txUrl} error={unpauseAction.error} successMessage="Sale unpaused — live again." />
          <TransactionStatus isPending={finalizeAction.isPending} isConfirming={finalizeAction.isConfirming} isConfirmed={finalizeAction.isConfirmed} txHash={finalizeAction.txHash} txUrl={finalizeAction.txUrl} error={finalizeAction.error} successMessage="Sale finalized." />
          <TransactionStatus isPending={closeSaleAction.isPending} isConfirming={closeSaleAction.isConfirming} isConfirmed={closeSaleAction.isConfirmed} txHash={closeSaleAction.txHash} txUrl={closeSaleAction.txUrl} error={closeSaleAction.error} successMessage="Sale closed." />
        </motion.div>
      )}

      {/* ── Finalized Success ── */}
      {isFinalizedSuccess && (
        <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
          <p className="font-semibold mb-1">Sale finalized successfully</p>
          <p>Issuer can withdraw funds. Buyers can claim tokens.</p>
        </div>
      )}

      {/* ── Finalized Failed — Activate Refunds ── */}
      {isFinalizedFailed && hasContract && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-red-50 rounded-lg p-6 border border-red-200 mb-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Sale Failed — Soft Cap Not Reached</h2>
          <p className="text-sm text-red-700 mb-4">
            {sale.refunds_activated_at
              ? "Refunds are active. Buyers can claim USDC refunds."
              : "Activate refunds to allow buyers to reclaim their USDC contributions. OTC contributors must be refunded off-chain."
            }
          </p>
          {!sale.refunds_activated_at && (
            <Button variant="primary" onClick={handleActivateRefunds}
              disabled={activateRefundsAction.isPending || activateRefundsAction.isConfirming}
              isLoading={activateRefundsAction.isPending || activateRefundsAction.isConfirming}
              className="bg-red-600 hover:bg-red-700">
              <RefreshCw className="h-4 w-4 mr-2" /> Activate Refunds
            </Button>
          )}
          {sale.refunds_activated_at && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Refunds activated on {new Date(sale.refunds_activated_at).toLocaleDateString()}
            </div>
          )}
          <TransactionStatus isPending={activateRefundsAction.isPending} isConfirming={activateRefundsAction.isConfirming} isConfirmed={activateRefundsAction.isConfirmed} txHash={activateRefundsAction.txHash} txUrl={activateRefundsAction.txUrl} error={activateRefundsAction.error} successMessage="Refunds activated — buyers can now claim USDC refunds." />
        </motion.div>
      )}

      {/* ── Finalized Failed without contract (DB-only) ── */}
      {isFinalizedFailed && !hasContract && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <p className="font-semibold mb-1">Sale failed — soft cap not reached</p>
          <p>No contract deployed — refunds handled off-chain.</p>
        </div>
      )}

      {/* ── Emergency Withdraw (90 days after finalization) ── */}
      {(isFinalizedSuccess || isFinalizedFailed) && hasContract && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-zinc-50 rounded-lg p-6 border border-zinc-200 mb-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Emergency Withdrawal
          </h2>
          <p className="text-xs text-zinc-500 mb-3">Available 90 days after finalization. Withdraws any remaining funds to the specified address. Use only if issuer has not withdrawn.</p>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={emergencyRecipient}
                onChange={(e) => setEmergencyRecipient(e.target.value)}
                placeholder="Recipient address (0x...)"
                maxLength={42}
                className={`w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-300 ${
                  emergencyRecipient && !isAddress(emergencyRecipient) ? "border-red-300 bg-red-50/30" : "border-zinc-200"
                }`}
              />
              {emergencyRecipient && !isAddress(emergencyRecipient) && (
                <p className="text-xs text-red-500 mt-1">Invalid EVM address</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEmergencyWithdraw}
              disabled={!emergencyRecipient || !isAddress(emergencyRecipient) || emergencyAction.isPending || emergencyAction.isConfirming}
              isLoading={emergencyAction.isPending || emergencyAction.isConfirming}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <ShieldAlert className="h-3.5 w-3.5 mr-1.5" /> Emergency Withdraw
            </Button>
          </div>
          <TransactionStatus isPending={emergencyAction.isPending} isConfirming={emergencyAction.isConfirming} isConfirmed={emergencyAction.isConfirmed} txHash={emergencyAction.txHash} txUrl={emergencyAction.txUrl} error={emergencyAction.error} successMessage="Emergency withdrawal complete." />
        </motion.div>
      )}

      {/* ── Visibility Toggle ── */}
      {(isActive || isPaused || isFinalizedSuccess || isFinalizedFailed || (isApproved && sale.is_coming_soon)) && (
        <div className="mb-6 flex items-center justify-between bg-white rounded-lg border border-zinc-100 p-5">
          <div className="flex items-center gap-3">
            {sale.is_visible ? (
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                <Eye className="h-5 w-5 text-green-600" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center">
                <EyeOff className="h-5 w-5 text-zinc-400" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-text">{sale.is_visible ? "Visible on Launchpad" : "Hidden from Launchpad"}</p>
              <p className="text-xs text-black/40">{sale.is_visible ? "Buyers can see this sale" : "Only admin and issuer can see this sale"}</p>
            </div>
          </div>
          <Button
            variant={sale.is_visible ? "outline" : "primary"}
            size="sm"
            onClick={handleToggleVisibility}
            isLoading={actionLoading === "visibility"}
          >
            {sale.is_visible ? "Hide from Launchpad" : "Make Visible"}
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard label="Status" value={({ draft: "Draft", pending_approval: "Pending Approval", approved: "Approved", approved_coming_soon: "Coming Soon", active: "Active", paused: "Paused", finalized_success: "Completed", finalized_failed: "Failed", rejected: "Rejected" } as Record<string, string>)[sale.status] || sale.status} icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Total Raised" value={raised} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Hard Cap" value={cap} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Soft Cap" value={soft} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
      </div>

      {/* Progress */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg p-6 border border-black/10 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">Funding Progress</h2>
          <Badge variant={isActive ? "active" : "default"} size="sm">{({ draft: "Draft", pending_approval: "Pending Approval", approved: "Approved", approved_coming_soon: "Coming Soon", active: "Active", paused: "Paused", finalized_success: "Completed", finalized_failed: "Failed", rejected: "Rejected" } as Record<string, string>)[sale.status] || sale.status}</Badge>
        </div>
        <ProgressBar value={pct} size="md" />
        <div className="flex justify-between text-sm mt-2 text-black/50">
          <span>{formatCurrency(raised)} raised</span>
          <span>{pct.toFixed(1)}% of {formatCurrency(cap)}</span>
        </div>
      </motion.div>

      {/* Sale Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg p-6 border border-black/10 mb-6">
        <h2 className="text-lg font-semibold text-text mb-4">Sale Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ["Token", sale.token_name ? `${sale.token_name} (${sale.token_symbol})` : "Not assigned"],
            ["Issuer", sale.issuer_name ?? "—"],
            ["Payment Token", sale.payment_token],
            ["Sale Mode", sale.sale_mode ?? "vested"],
            ["Sale Type", isOpenEnded ? "Open-Ended" : "Fixed Window"],
            ["Contract", sale.contract_address ? `${sale.contract_address.slice(0, 10)}...${sale.contract_address.slice(-8)}` : "Not deployed"],
            ["Phases", `${sale.phases.length} configured`],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between py-2 border-b border-black/5">
              <span className="text-black/50">{label}</span>
              <span className="font-medium text-text">{value}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Phases with Extend button */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg p-6 border border-black/10">
        <h2 className="text-lg font-semibold text-text mb-6">Phases</h2>
        {sale.phases.length === 0 ? (
          <p className="text-black/40 text-center py-4">No phases configured</p>
        ) : (
          <div className="space-y-4">
            {sale.phases.map((phase, idx) => {
              const phaseSold = parseFloat(phase.sold || "0");
              const phaseAlloc = parseFloat(phase.allocation || "0");
              const phasePct = phaseAlloc > 0 ? (phaseSold / phaseAlloc) * 100 : 0;
              const phaseEnd = new Date(phase.end_time);
              const phaseStart = new Date(phase.start_time);
              const now = new Date();
              const isPhaseActive = now >= phaseStart && now <= phaseEnd;
              const isPhaseUpcoming = now < phaseStart;
              const canExtend = hasContract && (isActive || isPaused) && (isPhaseActive || isPhaseUpcoming);
              return (
                <div key={phase.id} className="p-4 rounded-lg bg-box">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-text">{phase.name}</p>
                      {isPhaseActive && <Badge variant="active" size="sm">Active</Badge>}
                      {isPhaseUpcoming && <Badge variant="default" size="sm">Upcoming</Badge>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-sm text-black/50">
                        <Clock className="h-3 w-3" />
                        <span>{phase.start_time.slice(0, 10)} → {phase.end_time.slice(0, 10)}</span>
                      </div>
                      {canExtend && (
                        <Button variant="outline" size="sm" onClick={() => { setExtendPhaseId(idx); setExtendNewEnd(""); }}>
                          <Calendar className="h-3 w-3 mr-1" /> Extend
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Extend phase inline form */}
                  {extendPhaseId === idx && (
                    <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <p className="text-xs text-blue-700 mb-2">Extend phase end time (must be after {phase.end_time.slice(0, 16)})</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="datetime-local"
                          value={extendNewEnd}
                          onChange={(e) => setExtendNewEnd(e.target.value)}
                          min={phase.end_time.slice(0, 16)}
                          className="rounded-lg border border-blue-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 flex-1"
                        />
                        <Button variant="primary" size="sm" onClick={handleExtendPhase}
                          disabled={!extendNewEnd || extendPhaseAction.isPending || extendPhaseAction.isConfirming}
                          isLoading={extendPhaseAction.isPending || extendPhaseAction.isConfirming}>
                          <Timer className="h-3 w-3 mr-1" /> Confirm
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setExtendPhaseId(null)}>Cancel</Button>
                      </div>
                      <TransactionStatus isPending={extendPhaseAction.isPending} isConfirming={extendPhaseAction.isConfirming} isConfirmed={extendPhaseAction.isConfirmed} txHash={extendPhaseAction.txHash} txUrl={extendPhaseAction.txUrl} error={extendPhaseAction.error} successMessage="Phase extended successfully." />
                    </div>
                  )}
                  <ProgressBar value={phasePct} size="sm" />
                  <div className="flex justify-between text-xs mt-1 text-black/40">
                    <span>Price: ${parseFloat(phase.price_per_token).toLocaleString()}</span>
                    <span>{formatCurrency(phaseSold)} / {formatCurrency(phaseAlloc)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Sale Content */}
      <div className="mt-6">
        <SaleContentReview saleId={sale.id} description={sale.description_text} fullDescription={sale.full_description} />
      </div>
    </PlatformAdminLayout>
  );
}
