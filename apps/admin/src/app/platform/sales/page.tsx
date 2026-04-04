"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, Eye } from "lucide-react";
import { Badge, ProgressBar } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import Link from "next/link";
import { Button } from "@/components/atoms";
import { getAdminSales, type Sale } from "@/lib/api/repositories/sales";

export default function PlatformSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

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

      {/* Table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-zinc-400 text-sm">Loading...</div>
        ) : sales.length === 0 ? (
          <div className="p-8 text-center text-zinc-400 text-sm">No sales created yet</div>
        ) : (
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
                        {({ draft: "Draft", pending_approval: "Pending Approval", approved: "Approved", approved_coming_soon: "Coming Soon", active: "Active", finalized_success: "Completed", finalized_failed: "Failed", rejected: "Rejected" } as Record<string, string>)[sale.status] || sale.status}
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
        )}
      </div>
    </PlatformAdminLayout>
  );
}
