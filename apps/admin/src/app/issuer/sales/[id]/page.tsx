"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart3, Clock, ArrowLeft, Wallet, Send, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Badge, Spinner, Button } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { ProgressBar } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";
import { getSale, submitSaleForApproval, type Sale } from "@/lib/api/repositories/sales";
import { apiFetch, getAccessToken } from "@/lib/api/client";

function getToken() { return getAccessToken() ?? undefined; }

export default function SaleDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

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

  const handleSubmitForApproval = () => handleAction("submit", async () => {
    await submitSaleForApproval(resolvedId, getToken());
  });

  const handleConvertToLive = () => handleAction("convert", async () => {
    await apiFetch(`/api/v1/sales/${resolvedId}/convert-to-live`, { method: "POST", body: {}, token: getToken() });
  });

  if (loading) return <IssuerDashboardLayout title="Sale Details" description=""><div className="flex justify-center py-24"><Spinner /></div></IssuerDashboardLayout>;
  if (!sale) return <IssuerDashboardLayout title="Sale Details" description=""><p className="text-center text-darkBlack/40 py-24">Sale not found</p></IssuerDashboardLayout>;

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

  return (
    <IssuerDashboardLayout title={sale.token_name ?? "Sale Details"} description={`Sale ID: ${sale.id}`}>
      <div className="mb-6 flex items-center justify-between">
        <Link href="/issuer/sales" className="flex items-center gap-2 text-sm text-darkBlack/50 hover:text-text transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Sales
        </Link>
        <div className="flex items-center gap-3">
          {isDraft && <Button variant="primary" onClick={handleSubmitForApproval} isLoading={actionLoading === "submit"}>
            <Send className="h-4 w-4 mr-2" /> Submit for Approval
          </Button>}
          {isApprovedComingSoon && <Button variant="primary" onClick={handleConvertToLive} isLoading={actionLoading === "convert"}>
            Convert to Live Sale
          </Button>}
          {isApproved && <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
            <p className="font-semibold">Approved — deploy on-chain via dApp</p>
          </div>}
          {isFinalizedSuccess && <div className="p-3 rounded-xl bg-darkAqua/10 border border-darkAqua/20 text-sm text-darkAqua">
            <Wallet className="h-4 w-4 inline mr-1" /> Withdraw funds via dApp — call <code className="font-mono bg-darkAqua/10 px-1 rounded">withdrawFunds()</code>
          </div>}
        </div>
      </div>

      {actionError && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600"><AlertCircle className="h-4 w-4 inline mr-1" />{actionError}</div>}
      {actionSuccess && <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-600">Action completed successfully</div>}

      {/* Status Banner */}
      {isPending && <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">Pending admin approval. You&apos;ll be notified once reviewed.</div>}
      {isRejected && <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">Sale was rejected. Edit and resubmit.</div>}
      {isFailed && <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">Sale failed to reach soft cap. Investors can claim refunds.</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Total Raised" value={raised} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Hard Cap" value={cap} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Soft Cap" value={soft} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">Progress</h2>
          <Badge variant={isActive ? "active" : "default"} size="sm">{sale.status}</Badge>
        </div>
        <ProgressBar value={pct} size="md" />
        <div className="flex justify-between text-sm mt-2 text-darkBlack/50">
          <span>{formatCurrency(raised)} raised</span>
          <span>{pct.toFixed(1)}% of {formatCurrency(cap)}</span>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 border border-darkBlack/10">
        <h2 className="text-lg font-semibold text-text mb-6">Phases</h2>
        {sale.phases.length === 0 ? (
          <p className="text-darkBlack/40 text-center py-4">No phases configured</p>
        ) : (
          <div className="space-y-4">
            {sale.phases.map((phase) => {
              const phaseSold = parseFloat(phase.sold || "0");
              const phaseAlloc = parseFloat(phase.allocation || "0");
              const phasePct = phaseAlloc > 0 ? (phaseSold / phaseAlloc) * 100 : 0;
              return (
                <div key={phase.id} className="p-4 rounded-2xl bg-box">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-text">{phase.name}</p>
                    <div className="flex items-center gap-2 text-sm text-darkBlack/50">
                      <Clock className="h-3 w-3" />
                      <span>{phase.start_time.slice(0, 10)} → {phase.end_time.slice(0, 10)}</span>
                    </div>
                  </div>
                  <ProgressBar value={phasePct} size="sm" />
                  <div className="flex justify-between text-xs mt-1 text-darkBlack/40">
                    <span>Price: ${phase.price_per_token}</span>
                    <span>{formatCurrency(phaseSold)} / {formatCurrency(phaseAlloc)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </IssuerDashboardLayout>
  );
}
