"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, BarChart3, Plus, ArrowUpRight, Rocket, Clock, FileText, LayoutGrid, List } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Badge, Spinner } from "@/components/atoms";
import { ProgressBar } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";
import { getIssuerSales, type Sale } from "@/lib/api/repositories/sales";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  approved: "Approved",
  approved_coming_soon: "Coming Soon",
  active: "Active",
  finalized_success: "Completed",
  finalized_failed: "Failed",
  rejected: "Rejected",
};

const STATUS_VARIANTS: Record<string, "active" | "pending" | "default"> = {
  active: "active",
  approved: "active",
  approved_coming_soon: "active",
  draft: "pending",
  pending_approval: "pending",
  finalized_success: "default",
  finalized_failed: "default",
  rejected: "default",
};

/** Drafts that haven't been deployed on-chain yet should re-open the wizard
 *  so the issuer can keep editing financial fields, phases, etc. */
function saleDestination(sale: Sale): string {
  if (sale.status === "draft" && !sale.contract_address) {
    return `/issuer/sales/new?id=${sale.id}`;
  }
  return `/issuer/sales/${sale.id}`;
}

/** Deploy is available from the list when the draft has a token deployed but
 *  no sale contract yet — same precondition as the detail page's Deploy button. */
function canDeployFromList(sale: Sale): boolean {
  return (
    sale.status === "draft"
    && !sale.contract_address
    && !!sale.token_contract_address
    && !sale.is_coming_soon
  );
}

/** Inline Deploy CTA — stops Link propagation and routes to the detail page
 *  with ?from=wizard&action=deploy so the deploy auto-triggers on mount. */
function DeployButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  return (
    <Button
      variant="primary"
      size="sm"
      className="shrink-0"
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(`/issuer/sales/${saleId}?from=wizard&action=deploy`);
      }}
    >
      <Rocket className="h-3.5 w-3.5 mr-1.5" />
      Deploy
    </Button>
  );
}

function SaleCard({ sale }: { sale: Sale }) {
  const raised = parseFloat(sale.total_raised || "0");
  const cap = parseFloat(sale.hard_cap || "0");
  const pct = cap > 0 ? Math.min(Math.round((raised / cap) * 100), 100) : 0;
  const statusLabel = STATUS_LABELS[sale.status] || sale.status;
  const variant = STATUS_VARIANTS[sale.status] || "pending";

  return (
    <Link href={saleDestination(sale)}
      className="block bg-white rounded-lg border border-zinc-100 hover:border-darkAqua/30 hover:shadow-sm transition-all group">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-text text-sm truncate">{sale.title || sale.token_name || "Untitled Sale"}</h3>
            <p className="text-xs text-black/40 mt-0.5">
              {sale.token_symbol ? `${sale.token_symbol} · ` : ""}
              {sale.is_coming_soon ? "Coming Soon" : sale.sale_mode === "vested" ? "Vested" : "Direct"}
            </p>
          </div>
          <Badge variant={variant} size="sm" className="shrink-0 ml-2">{statusLabel}</Badge>
        </div>

        {!sale.is_coming_soon && cap > 0 && (
          <div className="mb-3">
            <ProgressBar value={pct} size="sm" />
            <div className="flex justify-between text-xs text-black/40 mt-1">
              <span>{formatCurrency(raised)}</span>
              <span>{pct}% of {formatCurrency(cap)}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-black/30">
            {sale.contract_address && (
              <span className="flex items-center gap-1"><Rocket className="h-3 w-3" /> Deployed</span>
            )}
            {sale.phases.length > 0 && (
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {sale.phases.length} phase{sale.phases.length > 1 ? "s" : ""}</span>
            )}
            {sale.otc_enabled && (
              <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> OTC</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canDeployFromList(sale) && <DeployButton saleId={sale.id} />}
            <ArrowUpRight className="h-4 w-4 text-black/15 group-hover:text-darkAqua transition-colors" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function SaleRow({ sale }: { sale: Sale }) {
  const raised = parseFloat(sale.total_raised || "0");
  const cap = parseFloat(sale.hard_cap || "0");
  const pct = cap > 0 ? Math.min(Math.round((raised / cap) * 100), 100) : 0;
  const statusLabel = STATUS_LABELS[sale.status] || sale.status;
  const variant = STATUS_VARIANTS[sale.status] || "pending";

  return (
    <Link href={saleDestination(sale)}
      className="flex items-center gap-4 px-4 py-3 bg-white border border-zinc-100 rounded-lg hover:border-darkAqua/30 hover:shadow-sm transition-all group">
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-text text-sm truncate">{sale.title || sale.token_name || "Untitled Sale"}</h3>
        <p className="text-xs text-black/40 mt-0.5">
          {sale.token_symbol ? `${sale.token_symbol} · ` : ""}
          {sale.is_coming_soon ? "Coming Soon" : sale.sale_mode === "vested" ? "Vested" : "Direct"}
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-black/30 shrink-0">
        {sale.contract_address && <span className="flex items-center gap-1"><Rocket className="h-3 w-3" /> Deployed</span>}
        {sale.phases.length > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {sale.phases.length} phase{sale.phases.length > 1 ? "s" : ""}</span>}
        {sale.otc_enabled && <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> OTC</span>}
      </div>
      {!sale.is_coming_soon && cap > 0 && (
        <div className="w-32 shrink-0">
          <ProgressBar value={pct} size="sm" />
          <p className="text-[10px] text-black/30 mt-0.5 text-right">{formatCurrency(raised)} / {formatCurrency(cap)}</p>
        </div>
      )}
      <Badge variant={variant} size="sm" className="shrink-0">{statusLabel}</Badge>
      {canDeployFromList(sale) && <DeployButton saleId={sale.id} />}
      <ArrowUpRight className="h-4 w-4 text-black/15 group-hover:text-darkAqua transition-colors shrink-0" />
    </Link>
  );
}

export default function SalesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getIssuerSales(1, 100);
        setSales(data.items);
      } catch (err) { console.error("Failed to load sales:", err); }
      finally { setLoading(false); }
    })();
  }, []);

  const sanitizedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").trim();
  const filtered = sales.filter((s) => {
    const matchesSearch = !sanitizedSearch || (s.title ?? s.token_name ?? "").toLowerCase().includes(sanitizedSearch.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalRaised = sales.reduce((acc, s) => acc + parseFloat(s.total_raised || "0"), 0);
  const active = sales.filter((s) => s.status === "active").length;
  const comingSoon = sales.filter((s) => s.status === "approved_coming_soon").length;
  const drafts = sales.filter((s) => s.status === "draft").length;

  const statusTabs = [
    { key: "all", label: "All", count: sales.length },
    { key: "active", label: "Active", count: active },
    { key: "approved_coming_soon", label: "Coming Soon", count: comingSoon },
    { key: "draft", label: "Draft", count: drafts },
    { key: "pending_approval", label: "Pending", count: sales.filter((s) => s.status === "pending_approval").length },
  ].filter((t) => t.key === "all" || t.count > 0);

  return (
    <IssuerDashboardLayout title="Token Sales" description="Manage your active and past token sales"
      actions={
        <Link href="/issuer/sales/new">
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>New Sale</Button>
        </Link>
      }>
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Sales", value: sales.length.toString(), icon: <BarChart3 className="h-4 w-4" />, color: "text-darkAqua", bg: "bg-darkAqua/10" },
          { label: "Active", value: active.toString(), icon: <TrendingUp className="h-4 w-4" />, color: "text-green-600", bg: "bg-green-50" },
          { label: "Coming Soon", value: comingSoon.toString(), icon: <Clock className="h-4 w-4" />, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Total Raised", value: formatCurrency(totalRaised), icon: <BarChart3 className="h-4 w-4" />, color: "text-blue-600", bg: "bg-blue-50" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-lg px-4 py-3.5 border border-zinc-100">
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`w-7 h-7 rounded-md ${s.bg} flex items-center justify-center ${s.color}`}>{s.icon}</div>
              <p className="text-[11px] font-medium text-black/40 uppercase tracking-wide">{s.label}</p>
            </div>
            <p className="text-xl font-bold text-text">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters + Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-1.5 bg-zinc-100 rounded-lg p-1">
          {statusTabs.map((tab) => (
            <button key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === tab.key ? "bg-white text-text shadow-sm" : "text-black/50 hover:text-text"
              }`}>
              {tab.label} <span className="text-black/30 ml-0.5">{tab.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-56">
            <Input placeholder="Search sales…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center bg-zinc-100 rounded-md p-0.5">
            <button onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white text-text shadow-sm" : "text-black/40 hover:text-text"}`}>
              <List className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-white text-text shadow-sm" : "text-black/40 hover:text-text"}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Sales Grid */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-zinc-100">
          <div className="w-14 h-14 rounded-lg bg-zinc-100 flex items-center justify-center mx-auto mb-3">
            <TrendingUp className="h-7 w-7 text-zinc-300" />
          </div>
          <p className="text-black/40 text-sm mb-1">{sales.length === 0 ? "No sales yet" : "No matching sales"}</p>
          <p className="text-black/25 text-xs mb-4">
            {sales.length === 0 ? "Create your first token sale to get started" : "Try adjusting your search or filters"}
          </p>
          {sales.length === 0 && (
            <Link href="/issuer/sales/new">
              <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>Create Sale</Button>
            </Link>
          )}
        </div>
      ) : (
        viewMode === "list" ? (
          <div className="flex flex-col gap-2">
            {filtered.map((sale, i) => (
              <motion.div key={sale.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                <SaleRow sale={sale} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((sale, i) => (
              <motion.div key={sale.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <SaleCard sale={sale} />
              </motion.div>
            ))}
          </div>
        )
      )}
    </IssuerDashboardLayout>
  );
}
