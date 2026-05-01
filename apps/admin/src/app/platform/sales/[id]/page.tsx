"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, Clock, ArrowLeft, CheckCircle2, XCircle, Flag,
  AlertCircle, Pause, Play, ShieldAlert, Eye, EyeOff,
  Power, RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Abi, isAddress } from "viem";
import { Badge, Spinner, Button } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { StatCard } from "@/components/molecules";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { SaleContentReview } from "@/components/molecules/SaleContentReview";
import { ProgressBar } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { formatCurrency, parseApiDate } from "@/lib/utils";
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
  // Phase extension is issuer-only at the contract level (Sale.extendPhase has
  // onlyIssuer); the admin-side button used to be here was a footgun — the tx
  // would always revert. Moved to the issuer's sale detail page.

  // On-chain actions
  const { isConnected, address: connectedWallet } = useAccount();
  const { openConnectModal } = useConnectModal();
  const approveOnChainAction = useContractAction();
  const rejectAction = useContractAction();

  // On-chain approval flag — Sale.approved() must be true before activate()
  // can succeed. The DB-only "Approved" status update isn't enough; admin
  // must sign Sale.approveSale() on-chain in the same step.
  const { data: approvedOnChainRaw, refetch: refetchApprovedOnChain } = useReadContract({
    address: sale?.contract_address as `0x${string}`,
    abi: SALE_ABI as unknown as Abi,
    functionName: "approved",
    query: { enabled: !!sale?.contract_address },
  });
  const approvedOnChain = approvedOnChainRaw === true;

  // Resolve admin wallet: Sale.factory() → factory.owner(). The connected
  // wallet must match this for approveSale() to succeed; otherwise the tx
  // reverts NotAdmin. Surface the mismatch in the UI before the click.
  const { data: saleFactoryAddr } = useReadContract({
    address: sale?.contract_address as `0x${string}`,
    abi: SALE_ABI as unknown as Abi,
    functionName: "factory",
    query: { enabled: !!sale?.contract_address },
  });
  const FACTORY_OWNER_ABI = [{ name: "owner", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] }] as const;
  const { data: adminWallet } = useReadContract({
    address: saleFactoryAddr as `0x${string}` | undefined,
    abi: FACTORY_OWNER_ABI,
    functionName: "owner",
    query: { enabled: !!saleFactoryAddr },
  });
  const adminWalletAddr = (adminWallet as string | undefined)?.toLowerCase();
  const connectedWalletAddr = connectedWallet?.toLowerCase();
  const isConnectedAsAdmin = !!connectedWalletAddr && !!adminWalletAddr && connectedWalletAddr === adminWalletAddr;

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
  const unapproveOnChainAction = useContractAction();
  const pauseAction = useContractAction();
  const unpauseAction = useContractAction();
  const finalizeAction = useContractAction();
  const emergencyAction = useContractAction();
  const closeSaleAction = useContractAction();
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

  // Combined approval: signs Sale.approveSale() on-chain (admin wallet) AND
  // updates DB status to Approved. Previously the button only flipped the
  // DB row, leaving on-chain `approved` flag = false — issuer's activate()
  // then reverted with NotApproved (this trapped a real sale today).
  // For sales already deployed on-chain we always include the on-chain call;
  // for coming-soon sales (no contract) we skip it.
  const handleApprove = async () => {
    setActionLoading("approve"); setActionError(null); setActionSuccess(null);
    try {
      if (sale?.contract_address && !approvedOnChain) {
        if (!requireWallet()) { setActionLoading(null); return; }
        const receipt = await approveOnChainAction.execute({
          address: sale.contract_address as `0x${string}`,
          abi: SALE_ABI as unknown as Abi,
          functionName: "approveSale",
        });
        if (!receipt) {
          // Wallet rejected or revert — error is already set on the action
          setActionLoading(null);
          return;
        }
        await refetchApprovedOnChain();
      }
      await apiFetch(`/api/v1/admin/sales/${resolvedId}/approve`, {
        method: "POST", body: {}, token: getToken(),
      });
      setActionSuccess("approve");
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Standalone on-chain approve — used when DB shows Approved but on-chain
  // approved is still false (legacy sales approved before this fix).
  const handleApproveOnChainOnly = async () => {
    if (!sale?.contract_address || !requireWallet()) return;
    setActionLoading("approve_onchain"); setActionError(null);
    try {
      const receipt = await approveOnChainAction.execute({
        address: sale.contract_address as `0x${string}`,
        abi: SALE_ABI as unknown as Abi,
        functionName: "approveSale",
      });
      if (receipt) {
        await refetchApprovedOnChain();
        setActionSuccess("approve_onchain");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "On-chain approve failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Unapprove: reverts Sale.approveSale() on-chain (admin wallet).
  // Only callable when the sale is on-chain, approved on-chain, and
  // status is still in the approveable window (Draft / Approved, not yet Active).
  const handleUnapproveSale = async () => {
    if (!sale?.contract_address || !requireWallet()) return;
    if (!isConnectedAsAdmin) return;
    setActionLoading("unapprove"); setActionError(null);
    try {
      const receipt = await unapproveOnChainAction.execute({
        address: sale.contract_address as `0x${string}`,
        abi: SALE_ABI as unknown as Abi,
        functionName: "unapproveSale",
        gas: 1_000_000n,
      });
      if (receipt) {
        await refetchApprovedOnChain();
        setActionSuccess("unapprove");
        await reload();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unapprove failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = () => handleAction("reject", async () => {
    await apiFetch(`/api/v1/admin/sales/${resolvedId}/reject`, { method: "POST", body: { reason: rejectReason || undefined }, token: getToken() });
  });

  const requireWallet = () => {
    if (!isConnected) { openConnectModal?.(); return false; }
    return true;
  };

  // activate() is issuer-only and lives on /issuer/sales/[id] now. Admin
  // doesn't take any on-chain action between approveSale() and the issuer's
  // activate() — only Reject (below).

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

      {/* ── Approval Wizard (3 steps) ── shown for any deployed sale that's
          past Draft and not yet Active. Coming-soon sales use a single-step
          approve below. */}
      {(isPending || isApproved) && hasContract && !sale.is_coming_soon && (() => {
        const step1Done = approvedOnChain && (isApproved || isActive);
        const step2Done = isActive;
        const currentStep = !step1Done ? 1 : !step2Done ? 2 : 3;
        const StepHeader = ({ n, label, done, current }: { n: number; label: string; done: boolean; current: boolean }) => (
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              done ? "bg-teal-600 text-white" : current ? "bg-amber-500 text-white" : "bg-zinc-200 text-zinc-500"
            }`}>
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
            </div>
            <span className={`text-sm font-semibold ${done ? "text-teal-700" : current ? "text-amber-700" : "text-zinc-400"}`}>{label}</span>
            {done && <span className="text-xs text-teal-600 ml-1">Done</span>}
            {current && !done && <span className="text-xs text-amber-600 ml-1">Now</span>}
          </div>
        );
        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-lg p-6 border border-zinc-200 mb-6">
            <h2 className="text-base font-semibold text-text mb-1">Sale Approval</h2>
            <p className="text-xs text-black/50 mb-4">
              Sale deployed at <CopyableAddress address={sale.contract_address!} className="text-xs bg-zinc-100 px-1.5 py-0.5 rounded" />
            </p>

            {/* Step 1 */}
            <div className={`p-4 rounded-lg border mb-3 ${currentStep === 1 ? "bg-amber-50 border-amber-200" : step1Done ? "bg-teal-50 border-teal-200" : "bg-zinc-50 border-zinc-200"}`}>
              <StepHeader n={1} label="Approve sale on-chain" done={step1Done} current={currentStep === 1} />
              <p className="text-xs text-black/60 mt-2 mb-3 ml-8">
                Signs <code>Sale.approveSale()</code> from your admin wallet AND marks the DB row as Approved. Issuer cannot activate until this is complete.
              </p>
              {currentStep === 1 && (
                <div className="ml-8">
                  {isConnected && !isConnectedAsAdmin && adminWalletAddr && (
                    <div className="mb-3 p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold mb-0.5">Connected wallet is not the admin.</p>
                        <p>Switch MetaMask to <code className="font-mono">{adminWalletAddr}</code> (factory owner). Currently connected: <code className="font-mono">{connectedWalletAddr}</code>.</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Button variant="primary" size="sm" onClick={handleApprove}
                      disabled={isConnected && !isConnectedAsAdmin}
                      isLoading={actionLoading === "approve" || approveOnChainAction.isPending || approveOnChainAction.isConfirming}>
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Approve & Sign On-Chain
                    </Button>
                    <input type="text" placeholder="Rejection reason (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                      className="rounded-lg border border-black/10 px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-red-300" />
                    <Button variant="outline" size="sm" onClick={handleReject} isLoading={actionLoading === "reject"} className="text-red-600 border-red-200 hover:bg-red-50">
                      <XCircle className="h-4 w-4 mr-2" /> Reject
                    </Button>
                  </div>
                </div>
              )}
              {/* Recovery: DB says Approved but on-chain approved=false. */}
              {isApproved && !approvedOnChain && (
                <div className="ml-8 mt-2 p-3 rounded-md bg-amber-100 border border-amber-300 text-xs text-amber-900">
                  <p className="font-semibold mb-1">DB shows Approved but on-chain isn&apos;t signed yet.</p>
                  <p className="mb-2">Legacy data — click below to run the on-chain approveSale() so the issuer can activate.</p>
                  {isConnected && !isConnectedAsAdmin && adminWalletAddr && (
                    <p className="mb-2 text-red-700">
                      ⚠ Connected wallet is not the admin. Switch MetaMask to <code className="font-mono">{adminWalletAddr}</code> first.
                    </p>
                  )}
                  <Button variant="primary" size="sm" onClick={handleApproveOnChainOnly}
                    disabled={isConnected && !isConnectedAsAdmin}
                    isLoading={actionLoading === "approve_onchain" || approveOnChainAction.isPending || approveOnChainAction.isConfirming}>
                    Run on-chain approveSale()
                  </Button>
                </div>
              )}
              <TransactionStatus
                isPending={approveOnChainAction.isPending} isConfirming={approveOnChainAction.isConfirming}
                isConfirmed={approveOnChainAction.isConfirmed} txHash={approveOnChainAction.txHash}
                txUrl={approveOnChainAction.txUrl} error={approveOnChainAction.error}
                successMessage="On-chain approveSale() confirmed."
              />
              {/* Unapprove — visible once on-chain approved=true and sale is not yet Active */}
              {approvedOnChain && !isActive && (
                <div className="ml-8 mt-3 pt-3 border-t border-zinc-100">
                  <p className="text-xs text-black/50 mb-2">Need to pull back the approval before the issuer activates?</p>
                  {isConnected && !isConnectedAsAdmin && adminWalletAddr && (
                    <p className="mb-2 text-xs text-red-700">
                      Connected wallet is not the admin. Switch MetaMask to <code className="font-mono">{adminWalletAddr}</code> first.
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUnapproveSale}
                    disabled={(isConnected && !isConnectedAsAdmin) || unapproveOnChainAction.isPending || unapproveOnChainAction.isConfirming}
                    isLoading={actionLoading === "unapprove" || unapproveOnChainAction.isPending || unapproveOnChainAction.isConfirming}
                    className="text-amber-600 border-amber-300 hover:bg-amber-50"
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Unapprove (revoke on-chain)
                  </Button>
                  <TransactionStatus
                    isPending={unapproveOnChainAction.isPending} isConfirming={unapproveOnChainAction.isConfirming}
                    isConfirmed={unapproveOnChainAction.isConfirmed} txHash={unapproveOnChainAction.txHash}
                    txUrl={unapproveOnChainAction.txUrl} error={unapproveOnChainAction.error}
                    successMessage="Sale unapproved on-chain — issuer can no longer activate until re-approved."
                  />
                </div>
              )}
            </div>

            {/* Step 2 — issuer-side action; admin just waits + monitors. */}
            <div className={`p-4 rounded-lg border mb-3 ${currentStep === 2 ? "bg-amber-50 border-amber-200" : step2Done ? "bg-teal-50 border-teal-200" : "bg-zinc-50 border-zinc-200"}`}>
              <StepHeader n={2} label="Issuer activates the sale" done={step2Done} current={currentStep === 2} />
              <p className="text-xs text-black/60 mt-2 mb-3 ml-8">
                <code>Sale.activate()</code> is issuer-only. The issuer signs from their own wallet on the issuer Sale Detail page. Admin doesn&apos;t take any action here.
              </p>
              {currentStep === 2 && (
                <div className="ml-8 space-y-2">
                  <p className="text-xs text-amber-800">Waiting for issuer to activate. They&apos;ll see the &quot;Activate Sale On-Chain&quot; step in their setup checklist.</p>
                  {(chainPhases === 0 || !tokensDeposited) && (
                    <div className="space-y-2">
                      {chainPhases === 0 && (
                        <div className="p-2.5 rounded-md bg-amber-100 border border-amber-300 text-xs text-amber-900 flex items-center gap-2">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> Issuer hasn&apos;t deployed any phases on-chain yet.
                        </div>
                      )}
                      {!tokensDeposited && (
                        <div className="p-2.5 rounded-md bg-amber-100 border border-amber-300 text-xs text-amber-900 flex items-center gap-2">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> Issuer hasn&apos;t deposited project tokens to the {sale.sale_mode === "vested" ? "vault" : "sale contract"}.
                        </div>
                      )}
                    </div>
                  )}
                  {/* Reject is admin-side and stays here even after approval. */}
                  <div className="pt-1">
                    <Button variant="outline" size="sm" onClick={handleRejectOnChain}
                      disabled={rejectAction.isPending || rejectAction.isConfirming || (isConnected && !isConnectedAsAdmin)}
                      isLoading={rejectAction.isPending || rejectAction.isConfirming}
                      className="text-red-600 border-red-200 hover:bg-red-50">
                      <XCircle className="h-4 w-4 mr-2" /> Reject On-Chain (admin)
                    </Button>
                  </div>
                  <TransactionStatus
                    isPending={rejectAction.isPending} isConfirming={rejectAction.isConfirming}
                    isConfirmed={rejectAction.isConfirmed} txHash={rejectAction.txHash}
                    txUrl={rejectAction.txUrl} error={rejectAction.error}
                    successMessage="Sale rejected on-chain — permanently blocked."
                  />
                </div>
              )}
            </div>

            {/* Step 3 */}
            <div className={`p-4 rounded-lg border ${currentStep === 3 ? "bg-teal-50 border-teal-200" : "bg-zinc-50 border-zinc-200"}`}>
              <StepHeader n={3} label="Sale is live" done={step2Done} current={currentStep === 3} />
              {currentStep === 3 && (
                <p className="ml-8 text-xs text-teal-700 mt-2">Buyers can now contribute. Use the actions below to pause, finalize, or close the sale.</p>
              )}
            </div>
          </motion.div>
        );
      })()}

      {/* ── Coming-soon: single-step approve, no on-chain ── */}
      {isPending && sale.is_coming_soon && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 rounded-lg p-6 border border-amber-200 mb-6">
          <h2 className="text-lg font-semibold text-amber-800 mb-2">Pending Approval — Coming Soon</h2>
          <p className="text-sm text-amber-700 mb-4">Approve to list as Coming Soon on the launchpad. No contract deployment needed.</p>
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

      {/* ── Pending without contract (deployed sales) ── */}
      {isPending && !hasContract && !sale.is_coming_soon && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 rounded-lg p-6 border border-amber-200 mb-6">
          <h2 className="text-lg font-semibold text-amber-800 mb-2">Waiting for Issuer to Deploy</h2>
          <p className="text-sm text-amber-700">Issuer submitted for approval but the sale contract isn&apos;t on-chain yet. Approval will unlock once the issuer deploys.</p>
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
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Refunds activated on {parseApiDate(sale.refunds_activated_at).toLocaleDateString()}
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
          {([
            ["Token", sale.token_name ? `${sale.token_name} (${sale.token_symbol})` : "Not assigned"],
            ["Issuer", sale.issuer_name ?? "—"],
            ["Payment Token", sale.payment_token],
            ["Sale Mode", sale.sale_mode ?? "vested"],
            ["Sale Type", isOpenEnded ? "Open-Ended" : "Fixed Window"],
            ["Contract", sale.contract_address ? <CopyableAddress address={sale.contract_address} truncate className="text-xs" /> : "Not deployed"],
            ["Phases", `${sale.phases.length} configured`],
          ] as Array<[string, React.ReactNode]>).map(([label, value]) => (
            <div key={label} className="flex justify-between py-2 border-b border-black/5">
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
            {sale.phases.map((phase) => {
              const phaseSold = parseFloat(phase.sold || "0");
              const phaseAlloc = parseFloat(phase.allocation || "0");
              const phasePct = phaseAlloc > 0 ? (phaseSold / phaseAlloc) * 100 : 0;
              const phaseEnd = new Date(phase.end_time);
              const phaseStart = new Date(phase.start_time);
              const now = new Date();
              const isPhaseActive = now >= phaseStart && now <= phaseEnd;
              const isPhaseUpcoming = now < phaseStart;
              return (
                <div key={phase.id} className="p-4 rounded-lg bg-box">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-text">{phase.name}</p>
                      {isPhaseActive && <Badge variant="active" size="sm">Active</Badge>}
                      {isPhaseUpcoming && <Badge variant="default" size="sm">Upcoming</Badge>}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-black/50">
                      <Clock className="h-3 w-3" />
                      <span>{phase.start_time.slice(0, 10)} → {phase.end_time.slice(0, 10)}</span>
                    </div>
                  </div>
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
