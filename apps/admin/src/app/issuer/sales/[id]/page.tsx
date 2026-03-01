"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart3, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Badge, Spinner } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { ProgressBar } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";
import { getSale, type Sale } from "@/lib/api/repositories/sales";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? undefined : undefined;
}

export default function SaleDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string>("");

  useEffect(() => {
    paramsPromise.then((p) => setResolvedId(p.id));
  }, [paramsPromise]);

  useEffect(() => {
    if (!resolvedId) return;
    (async () => {
      try {
        const data = await getSale(resolvedId, getToken());
        setSale(data);
      } catch { /* 404 */ }
      finally { setLoading(false); }
    })();
  }, [resolvedId]);

  if (loading) {
    return (
      <IssuerDashboardLayout title="Sale Details" description="">
        <div className="flex justify-center py-24"><Spinner /></div>
      </IssuerDashboardLayout>
    );
  }

  if (!sale) {
    return (
      <IssuerDashboardLayout title="Sale Details" description="">
        <p className="text-center text-darkBlack/40 py-24">Sale not found</p>
      </IssuerDashboardLayout>
    );
  }

  const raised = parseFloat(sale.total_raised || "0");
  const cap = parseFloat(sale.hard_cap || "0");
  const soft = parseFloat(sale.soft_cap || "0");
  const pct = cap > 0 ? (raised / cap) * 100 : 0;

  return (
    <IssuerDashboardLayout
      title={sale.token_name ?? "Sale Details"}
      description={`Sale ID: ${sale.id}`}
    >
      <div className="mb-6">
        <Link href="/issuer/sales" className="flex items-center gap-2 text-sm text-darkBlack/50 hover:text-text transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Sales
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Total Raised" value={raised} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Hard Cap" value={cap} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="Soft Cap" value={soft} prefix="$" icon={<BarChart3 className="h-5 w-5" />} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">Progress</h2>
          <Badge variant={sale.status === "active" ? "active" : "default"} size="sm">{sale.status}</Badge>
        </div>
        <ProgressBar value={pct} size="md" />
        <div className="flex justify-between text-sm mt-2 text-darkBlack/50">
          <span>{formatCurrency(raised)} raised</span>
          <span>{pct.toFixed(1)}% of {formatCurrency(cap)}</span>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10">
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
