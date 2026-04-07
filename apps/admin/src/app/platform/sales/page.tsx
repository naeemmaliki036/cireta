"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, Eye, LayoutGrid, List, ArrowUpRight, Rocket, Clock } from "lucide-react";
import { Badge, ProgressBar } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import Link from "next/link";
import { Button } from "@/components/atoms";
import { formatCurrency } from "@/lib/utils";
import { getAdminSales, type Sale } from "@/lib/api/repositories/sales";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", pending_approval: "Pending", approved: "Approved",
  approved_coming_soon: "Coming Soon", active: "Active",
  finalized_success: "Completed", finalized_failed: "Failed", rejected: "Rejected",
};

function PlatformSaleCard({ sale }: { sale: Sale }) {
  const raised = parseFloat(sale.total_raised || "0");
  const cap = parseFloat(sale.hard_cap || "0");
  const pct = cap > 0 ? Math.min(Math.round((raised / cap) * 100), 100) : 0;
  const statusLabel = STATUS_LABELS[sale.status] || sale.status;

  return (
    <Link href={`/platform/sales/${sale.id}`}
      className="block bg-white rounded-lg border border-zinc-100 hover:border-darkAqua/30 hover:shadow-sm transition-all group">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-text text-sm truncate">{sale.title || sale.token_name || "Untitled Sale"}</h3>
            <p className="text-xs text-darkBlack/40 mt-0.5">
              {sale.issuer_name || sale.issuer_id.slice(0, 8) + "..."}
              {sale.token_symbol ? ` · ${sale.token_symbol}` : ""}
            </p>
          </div>
          <Badge
            variant={sale.status === "active" ? "active" : sale.status === "draft" ? "pending" : "default"}
            size="sm" className="shrink-0 ml-2"
          >{statusLabel}</Badge>
        </div>
        {cap > 0 && (
          <div className="mb-3">
            <ProgressBar value={pct} size="sm" />
            <div className="flex justify-between text-xs text-darkBlack/40 mt-1">
              <span>{formatCurrency(raised)}</span>
              <span>{pct}% of {formatCurrency(cap)}</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-darkBlack/30">
            {sale.contract_address && <span className="flex items-center gap-1"><Rocket className="h-3 w-3" /> Deployed</span>}
            {sale.is_coming_soon && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Coming Soon</span>}
            {sale.is_visible && <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Visible</span>}
          </div>
          <ArrowUpRight className="h-4 w-4 text-darkBlack/15 group-hover:text-darkAqua transition-colors" />
        </div>
      </div>
    </Link>
  );
}

export default function PlatformSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  useEffect(() => {
    getAdminSales(1, 100)
      .then((data) => setSales(data.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeSales = sales.filter((s) => s.status === "active");
  const totalRaised = sales.reduce((sum, s) => sum + parseFloat(s.total_raised || "0"), 0);

  return (
    <PlatformAdminLayout
      title="All Sales"
      description="Token sales across all issuers on the platform"
    >
      {/* Inline stats */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <ShoppingCart className="h-3.5 w-3.5 text-teal-600" />
          <span className="text-zinc-500">Total Sales</span>
          <span className="font-semibold text-zinc-900">{sales.length}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <ShoppingCart className="h-3.5 w-3.5 text-green-600" />
          <span className="text-zinc-500">Active</span>
          <span className="font-semibold text-zinc-900">{activeSales.length}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <ShoppingCart className="h-3.5 w-3.5 text-purple-600" />
          <span className="text-zinc-500">Total Raised</span>
          <span className="font-semibold text-zinc-900">${totalRaised.toLocaleString()}</span>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center justify-end mb-4">
        <div className="flex items-center bg-zinc-100 rounded-md p-0.5">
          <button onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white text-text shadow-sm" : "text-darkBlack/40 hover:text-text"}`}>
            <List className="h-4 w-4" />
          </button>
          <button onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-white text-text shadow-sm" : "text-darkBlack/40 hover:text-text"}`}>
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-zinc-400 text-sm">Loading...</div>
      ) : sales.length === 0 ? (
        <div className="p-8 text-center text-zinc-400 text-sm bg-white rounded-lg border border-zinc-200">No sales created yet</div>
      ) : viewMode === "list" ? (
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-100">
                <th className="px-5 py-3">Sale</th>
                <th className="px-5 py-3">Issuer</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Raised</th>
                <th className="px-5 py-3">Hard Cap</th>
                <th className="px-5 py-3">Progress</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const raised = parseFloat(sale.total_raised || "0");
                const hardCap = parseFloat(sale.hard_cap || "0");
                const pct = hardCap > 0 ? (raised / hardCap) * 100 : 0;
                return (
                  <tr key={sale.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-sm">{sale.title || sale.token_name || "Untitled"}</p>
                      {sale.token_symbol && <p className="text-xs text-zinc-400">{sale.token_symbol}</p>}
                      {sale.is_coming_soon && <span className="text-[10px] text-amber-600 font-medium">Coming Soon</span>}
                    </td>
                    <td className="px-5 py-3 text-sm text-zinc-600">
                      {sale.issuer_name || sale.issuer_id.slice(0, 8) + "..."}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={sale.status === "active" ? "active" : sale.status === "draft" ? "pending" : "default"}
                        size="sm"
                      >
                        {(STATUS_LABELS[sale.status] || sale.status)}
                      </Badge>
                      {sale.is_visible && <span className="ml-1.5 inline-flex items-center text-[10px] text-green-600" title="Visible on launchpad"><Eye className="h-3 w-3" /></span>}
                    </td>
                    <td className="px-5 py-3 text-sm font-medium">${raised.toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-zinc-500">${hardCap.toLocaleString()}</td>
                    <td className="px-5 py-3 w-32">
                      <ProgressBar value={pct} size="sm" />
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/platform/sales/${sale.id}`}><Button variant="ghost" size="sm">View</Button></Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sales.map((sale) => (
            <PlatformSaleCard key={sale.id} sale={sale} />
          ))}
        </div>
      )}
    </PlatformAdminLayout>
  );
}
