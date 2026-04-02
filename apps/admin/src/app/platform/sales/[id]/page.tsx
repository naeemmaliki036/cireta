"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart3, Clock, ArrowLeft, CheckCircle2, XCircle, Flag, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Badge, Spinner, Button } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { SaleContentReview } from "@/components/molecules/SaleContentReview";
import { ProgressBar } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";
import { getSale, type Sale } from "@/lib/api/repositories/sales";
import { apiFetch, getAccessToken } from "@/lib/api/client";

function getToken() { return getAccessToken() ?? undefined; }

export default function AdminSaleDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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

  const handleApprove = () => handleAction("approve", async () => {
    await apiFetch(`/api/v1/admin/sales/${resolvedId}/approve`, { method: "POST", body: {}, token: getToken() });
  });

  const handleReject = () => handleAction("reject", async () => {
    await apiFetch(`/api/v1/admin/sales/${resolvedId}/reject`, { method: "POST", body: { reason: rejectReason || undefined }, token: getToken() });
  });

  const handleFinalize = () => handleAction("finalize", async () => {
    await apiFetch(`/api/v1/admin/sales/${resolvedId}/finalize`, { method: "POST", body: {}, token: getToken() });
  });

  if (loading) return <PlatformAdminLayout title="Sale Details" description=""><div className="flex justify-center py-24"><Spinner /></div></PlatformAdminLayout>;
  if (!sale) return <PlatformAdminLayout title="Sale Details" description=""><p className="text-center text-darkBlack/40 py-24">Sale not found</p></PlatformAdminLayout>;

  const raised = parseFloat(sale.total_raised || "0");
  const cap = parseFloat(sale.hard_cap || "0");
  const soft = parseFloat(sale.soft_cap || "0");
  const pct = cap > 0 ? (raised / cap) * 100 : 0;
  const isPending = sale.status === "pending_approval";
  const isActive = sale.status === "active";
  const isFinalizedSuccess = sale.status === "finalized_success" || sale.status === "finalized";

  return (
    <PlatformAdminLayout title={sale.title || sale.token_name || "Sale Review"} description={`Sale ID: ${sale.id}`}>
      <div className="mb-6">
        <Link href="/platform/sales" className="flex items-center gap-2 text-sm text-darkBlack/50 hover:text-text transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Sales
        </Link>
      </div>

      {actionError && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600"><AlertCircle className="h-4 w-4 inline mr-1" />{actionError}</div>}
      {actionSuccess && <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-600">Action completed successfully</div>}

      {/* Admin Actions */}
      {isPending && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 rounded-3xl p-6 border border-amber-200 mb-6">
          <h2 className="text-lg font-semibold text-amber-800 mb-4">Pending Approval</h2>
          <p className="text-sm text-amber-700 mb-4">This sale is awaiting your review. Approve to make it visible on the launchpad, or reject with a reason.</p>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={handleApprove} isLoading={actionLoading === "approve"}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
            </Button>
            <div className="flex items-center gap-2">
              <input type="text" placeholder="Rejection reason (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                className="rounded-xl border border-darkBlack/10 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-red-300" />
              <Button variant="outline" onClick={handleReject} isLoading={actionLoading === "reject"} className="text-red-600 border-red-200 hover:bg-red-50">
                <XCircle className="h-4 w-4 mr-2" /> Reject
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {isActive && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-blue-50 rounded-3xl p-6 border border-blue-200 mb-6">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">Active Sale</h2>
          <p className="text-sm text-blue-700 mb-4">This sale is live. You can finalize it when ready.</p>
          <Button variant="primary" onClick={handleFinalize} isLoading={actionLoading === "finalize"}>
            <Flag className="h-4 w-4 mr-2" /> Finalize Sale
          </Button>
        </motion.div>
      )}

      {isFinalizedSuccess && (
        <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
          Sale finalized successfully. Issuer can withdraw funds via dApp.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard label="Status" value={sale.status} icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Total Raised" value={raised} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Hard Cap" value={cap} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Soft Cap" value={soft} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
      </div>

      {/* Progress */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">Funding Progress</h2>
          <Badge variant={isActive ? "active" : "default"} size="sm">{sale.status}</Badge>
        </div>
        <ProgressBar value={pct} size="md" />
        <div className="flex justify-between text-sm mt-2 text-darkBlack/50">
          <span>{formatCurrency(raised)} raised</span>
          <span>{pct.toFixed(1)}% of {formatCurrency(cap)}</span>
        </div>
      </motion.div>

      {/* Sale Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6">
        <h2 className="text-lg font-semibold text-text mb-4">Sale Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ["Token", sale.token_name ? `${sale.token_name} (${sale.token_symbol})` : "Not assigned"],
            ["Issuer", sale.issuer_name ?? "—"],
            ["Payment Token", sale.payment_token],
            ["Sale Mode", sale.sale_mode ?? "vested"],
            ["Phases", `${sale.phases.length} configured`],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between py-2 border-b border-darkBlack/5">
              <span className="text-darkBlack/50">{label}</span>
              <span className="font-medium text-text">{value}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Phases */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 border border-darkBlack/10">
        <h2 className="text-lg font-semibold text-text mb-6">Phases</h2>
        {sale.phases.length === 0 ? (
          <p className="text-darkBlack/40 text-center py-4">No phases configured (Coming Soon sale)</p>
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

      {/* Sale Content: description, gallery, team, FAQ, documents */}
      <div className="mt-6">
        <SaleContentReview saleId={sale.id} description={sale.description_text} fullDescription={sale.full_description} />
      </div>
    </PlatformAdminLayout>
  );
}
