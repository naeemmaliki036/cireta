"use client";

import { useState, useEffect } from "react";
import { parseApiDate } from "@/lib/utils";
import { Package, ChevronLeft, ChevronRight } from "lucide-react";
import { PlatformAdminLayout } from "@/components/templates";
import { listRedemptions, type Redemption } from "@/lib/api/repositories/redemptions";

const STATUSES = ["all", "pending", "processing", "shipped", "fulfilled", "cancelled"] as const;
const PAGE_SIZE = 20;

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string }> = {
    pending: { bg: "bg-amber-100", text: "text-amber-700" },
    processing: { bg: "bg-blue-100", text: "text-blue-700" },
    shipped: { bg: "bg-purple-100", text: "text-purple-700" },
    fulfilled: { bg: "bg-green-100", text: "text-green-700" },
    cancelled: { bg: "bg-zinc-100", text: "text-zinc-500" },
  };
  const s = map[status] ?? { bg: "bg-zinc-100", text: "text-zinc-500" };
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      {status}
    </span>
  );
}

function methodLabel(method: string | null) {
  if (!method) return "—";
  return method === "physical" ? "Physical" : "Cash";
}

function truncateId(id: string) {
  if (id.length <= 12) return id;
  return id.slice(0, 6) + "..." + id.slice(-4);
}

function DeliveryPanel({ r, onClose }: { r: Redemption; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-lg border border-zinc-200 w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-900 mb-4">Delivery Details</h3>
        <div className="space-y-3 text-sm">
          <Row label="Redemption ID" value={r.id} />
          <Row label="Amount" value={`${Number(r.amount).toLocaleString()} tokens`} />
          <Row label="Method" value={methodLabel(r.fulfillment_method)} />
          <Row label="Status" value={r.status} />
          {r.delivery_name && <Row label="Name" value={r.delivery_name} />}
          {r.delivery_address && <Row label="Address" value={r.delivery_address} />}
          {r.delivery_phone && <Row label="Phone" value={r.delivery_phone} />}
          {r.tracking_number && <Row label="Tracking #" value={r.tracking_number} />}
          {r.shipped_at && <Row label="Shipped" value={parseApiDate(r.shipped_at).toLocaleDateString()} />}
          {r.fulfilled_at && <Row label="Fulfilled" value={parseApiDate(r.fulfilled_at).toLocaleDateString()} />}
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full py-2 text-sm font-medium rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-900 font-medium text-right max-w-[60%] break-all">{value}</span>
    </div>
  );
}

export default function PlatformRedemptionsPage() {
  const [all, setAll] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Redemption | null>(null);

  useEffect(() => {
    listRedemptions()
      .then(setAll)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? all : all.filter((r) => r.status === filter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  const counts = {
    pending: all.filter((r) => r.status === "pending").length,
    processing: all.filter((r) => r.status === "processing").length,
    shipped: all.filter((r) => r.status === "shipped").length,
    fulfilled: all.filter((r) => r.status === "fulfilled").length,
  };

  return (
    <PlatformAdminLayout
      title="All Redemptions"
      description="Redemption requests across all issuers"
    >
      {/* Stats */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <Package className="h-3.5 w-3.5 text-[#13636F]" />
          <span className="text-zinc-500">Total</span>
          <span className="font-semibold text-zinc-900">{all.length}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <span className="text-zinc-500">Pending</span>
          <span className="font-semibold text-amber-600">{counts.pending}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <span className="text-zinc-500">Processing</span>
          <span className="font-semibold text-blue-600">{counts.processing}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <span className="text-zinc-500">Shipped</span>
          <span className="font-semibold text-purple-600">{counts.shipped}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <span className="text-zinc-500">Fulfilled</span>
          <span className="font-semibold text-green-600">{counts.fulfilled}</span>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-4">
        <label className="text-xs text-zinc-500">Status:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-xs border border-zinc-200 rounded-lg px-2.5 py-1.5 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-[#13636F]"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-400 ml-2">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="p-8 text-center text-zinc-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-zinc-400 text-sm bg-white rounded-lg border border-zinc-200">
          No redemption requests{filter !== "all" ? ` with status "${filter}"` : ""}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-100">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Token</th>
                  <th className="px-5 py-3">Buyer</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Tracking #</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="border-b border-zinc-50 hover:bg-[#ECF3F4] cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 text-xs text-zinc-600 whitespace-nowrap">
                      {r.created_at ? parseApiDate(r.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-700 font-medium">
                      {truncateId(r.token_id)}
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-600">
                      {truncateId(r.user_id)}
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-900 font-medium text-right whitespace-nowrap">
                      {Number(r.amount).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-600">
                      {methodLabel(r.fulfillment_method)}
                    </td>
                    <td className="px-5 py-3">{statusBadge(r.status)}</td>
                    <td className="px-5 py-3 text-xs text-zinc-500">
                      {r.tracking_number || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-100">
              <span className="text-xs text-zinc-400">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-md hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 text-zinc-600" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-md hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4 text-zinc-600" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      {selected && <DeliveryPanel r={selected} onClose={() => setSelected(null)} />}
    </PlatformAdminLayout>
  );
}
