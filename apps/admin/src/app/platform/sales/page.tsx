"use client";

import { useState, useEffect } from "react";
import { ShoppingCart } from "lucide-react";
import { Badge, ProgressBar } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { getSales, type Sale } from "@/lib/api/repositories/sales";

export default function PlatformSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSales(1, 100)
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
      breadcrumbs={[{ label: "Platform" }, { label: "Sales" }]}
    >
      {/* Stats */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center">
            <ShoppingCart className="h-6 w-6 text-teal-600" />
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase">Total Sales</p>
            <p className="text-2xl font-bold">{sales.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
            <ShoppingCart className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase">Active</p>
            <p className="text-2xl font-bold">{activeSales.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <ShoppingCart className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase">Total Raised</p>
            <p className="text-2xl font-bold">${totalRaised.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-zinc-400">Loading...</div>
        ) : sales.length === 0 ? (
          <div className="p-8 text-center text-zinc-400">No sales created yet</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-100">
                <th className="px-6 py-3">Token</th>
                <th className="px-6 py-3">Issuer</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Raised</th>
                <th className="px-6 py-3">Hard Cap</th>
                <th className="px-6 py-3">Progress</th>
                <th className="px-6 py-3">Phases</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const raised = parseFloat(sale.total_raised || "0");
                const hardCap = parseFloat(sale.hard_cap || "0");
                const pct = hardCap > 0 ? (raised / hardCap) * 100 : 0;
                return (
                  <tr key={sale.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-sm">{sale.token_name ?? "—"}</p>
                      <p className="text-xs text-zinc-400">{sale.token_symbol}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-600">
                      {sale.issuer_id.slice(0, 8)}...
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={sale.status === "active" ? "active" : sale.status === "draft" ? "pending" : "default"}
                        size="sm"
                        className="capitalize"
                      >
                        {sale.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">${raised.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500">${hardCap.toLocaleString()}</td>
                    <td className="px-6 py-4 w-32">
                      <ProgressBar value={pct} size="sm" />
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-500">{sale.phases.length}</td>
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
