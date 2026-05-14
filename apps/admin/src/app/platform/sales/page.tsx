"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShoppingCart, Eye, LayoutGrid, List, ArrowUpRight,
  Rocket, Clock, Save, Search,
} from "lucide-react";
import { Badge, ProgressBar } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import Link from "next/link";
import { Button } from "@/components/atoms";
import { formatCurrency } from "@/lib/utils";
import { getAdminSales, type Sale } from "@/lib/api/repositories/sales";
import { apiFetch, getAccessToken } from "@/lib/api/client";

function getToken() { return getAccessToken() ?? undefined; }

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", pending_approval: "Pending", approved: "Approved",
  approved_coming_soon: "Coming Soon", active: "Active", paused: "Paused",
  finalized_success: "Completed", finalized_failed: "Failed", rejected: "Rejected",
};

// Status sort priority (lower = shown first)
const STATUS_SORT_ORDER: Record<string, number> = {
  active: 0, approved: 1, approved_coming_soon: 2,
  pending_approval: 3, draft: 4,
  paused: 5, finalized_success: 6, finalized_failed: 7, rejected: 8,
};

type SortKey = "newest" | "oldest" | "name_asc" | "name_desc" | "status" | "hardcap_desc" | "raised_desc";

function saleName(s: Sale): string {
  return (s.title ?? s.token_name ?? "").toLowerCase();
}

function applySort(list: Sale[], sort: SortKey): Sale[] {
  const copy = [...list];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    case "oldest":
      return copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    case "name_asc":
      return copy.sort((a, b) => saleName(a).localeCompare(saleName(b)));
    case "name_desc":
      return copy.sort((a, b) => saleName(b).localeCompare(saleName(a)));
    case "status":
      return copy.sort(
        (a, b) =>
          (STATUS_SORT_ORDER[a.status] ?? 99) - (STATUS_SORT_ORDER[b.status] ?? 99),
      );
    case "hardcap_desc":
      return copy.sort((a, b) => parseFloat(b.hard_cap || "0") - parseFloat(a.hard_cap || "0"));
    case "raised_desc":
      return copy.sort((a, b) => parseFloat(b.total_raised || "0") - parseFloat(a.total_raised || "0"));
    default:
      return copy;
  }
}

function PlatformSaleCard({
  sale, order, onOrderChange,
}: {
  sale: Sale;
  order: number | null;
  onOrderChange: (v: number | null) => void;
}) {
  const raised = parseFloat(sale.total_raised || "0");
  const cap = parseFloat(sale.hard_cap || "0");
  const pct = cap > 0 ? Math.min(Math.round((raised / cap) * 100), 100) : 0;
  const statusLabel = STATUS_LABELS[sale.status] || sale.status;

  return (
    <div className="bg-white rounded-lg border border-zinc-100 hover:border-darkAqua/30 hover:shadow-sm transition-all group">
      <Link href={`/platform/sales/${sale.id}`} className="block p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-text text-sm truncate">{sale.title || sale.token_name || "Untitled Sale"}</h3>
            <p className="text-xs text-black/40 mt-0.5">
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
            <div className="flex justify-between text-xs text-black/40 mt-1">
              <span>{formatCurrency(raised)}</span>
              <span>{pct}% of {formatCurrency(cap)}</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-black/30">
            {sale.contract_address && <span className="flex items-center gap-1"><Rocket className="h-3 w-3" /> Deployed</span>}
            {sale.is_coming_soon && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Coming Soon</span>}
            {sale.is_visible && <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Visible</span>}
          </div>
          <ArrowUpRight className="h-4 w-4 text-black/15 group-hover:text-darkAqua transition-colors" />
        </div>
      </Link>
      <div className="px-5 pb-4 pt-0 border-t border-zinc-50">
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] text-zinc-400 uppercase">Order</span>
          <input
            type="number"
            value={order ?? ""}
            onChange={(e) => onOrderChange(e.target.value === "" ? null : parseInt(e.target.value))}
            placeholder="Auto"
            className="w-16 text-xs border border-zinc-200 rounded px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-darkAqua"
            onClick={(e) => e.preventDefault()}
          />
        </div>
      </div>
    </div>
  );
}

export default function PlatformSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [orderMap, setOrderMap] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Search / filter / sort
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  useEffect(() => {
    getAdminSales(1, 100)
      .then((data) => {
        setSales(data.items);
        const map: Record<string, number | null> = {};
        for (const s of data.items) {
          map[s.id] = s.display_order ?? null;
        }
        setOrderMap(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const bySearch = q
      ? sales.filter(
          (s) =>
            (s.token_symbol ?? "").toLowerCase().includes(q) ||
            (s.title ?? "").toLowerCase().includes(q) ||
            (s.token_name ?? "").toLowerCase().includes(q),
        )
      : sales;
    const byStatus =
      statusFilter === "all"
        ? bySearch
        : bySearch.filter((s) => s.status === statusFilter);
    return applySort(byStatus, sortKey);
  }, [sales, searchQuery, statusFilter, sortKey]);

  const hasChanges = sales.some((s) => orderMap[s.id] !== (s.display_order ?? null));

  const handleSaveOrder = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const order = Object.entries(orderMap).map(([sale_id, display_order]) => ({
        sale_id,
        display_order,
      }));
      await apiFetch("/api/v1/admin/sales/reorder", {
        method: "POST",
        body: { order },
        token: getToken(),
      });
      const data = await getAdminSales(1, 100);
      setSales(data.items);
      setSaveMsg("Display order saved");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (_err) {
      setSaveMsg("Failed to save order");
    } finally {
      setSaving(false);
    }
  }, [orderMap]);

  const updateOrder = (id: string, value: number | null) => {
    setOrderMap((prev) => ({ ...prev, [id]: value }));
  };

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
          <ShoppingCart className="h-3.5 w-3.5 text-[#13636F]" />
          <span className="text-zinc-500">Total Sales</span>
          <span className="font-semibold text-zinc-900">{sales.length}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <ShoppingCart className="h-3.5 w-3.5 text-[#13636F]" />
          <span className="text-zinc-500">Active</span>
          <span className="font-semibold text-zinc-900">{activeSales.length}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs">
          <ShoppingCart className="h-3.5 w-3.5 text-[#13636F]" />
          <span className="text-zinc-500">Total Raised</span>
          <span className="font-semibold text-zinc-900">${totalRaised.toLocaleString()}</span>
        </div>
        {hasChanges && (
          <Button variant="primary" size="sm" onClick={handleSaveOrder} isLoading={saving} className="ml-auto">
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save Order
          </Button>
        )}
        {saveMsg && (
          <span className={`text-xs ml-2 ${saveMsg.includes("Failed") ? "text-red-500" : "text-green-600"}`}>{saveMsg}</span>
        )}
      </div>

      {/* Search + filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-[36rem] max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by token symbol, sale title, or token name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-zinc-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:border-[#13636F]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#13636F]"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_approval">Pending</option>
          <option value="approved">Approved</option>
          <option value="approved_coming_soon">Coming Soon</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="finalized_success">Completed</option>
          <option value="finalized_failed">Failed</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#13636F]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name_asc">Name A → Z</option>
          <option value="name_desc">Name Z → A</option>
          <option value="status">Status (active first)</option>
          <option value="hardcap_desc">Largest hard cap</option>
          <option value="raised_desc">Most raised</option>
        </select>

        {/* View toggle pushed to the right */}
        <div className="ml-auto flex items-center bg-zinc-100 rounded-md p-0.5">
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white text-text shadow-sm" : "text-black/40 hover:text-text"}`}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-white text-text shadow-sm" : "text-black/40 hover:text-text"}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Result count */}
      {!loading && (
        <p className="text-xs text-zinc-400 mb-3">
          {filtered.length === sales.length
            ? `${sales.length} sale${sales.length !== 1 ? "s" : ""}`
            : `${filtered.length} of ${sales.length} sales`}
        </p>
      )}

      {loading ? (
        <div className="p-8 text-center text-zinc-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-zinc-400 text-sm bg-white rounded-lg border border-zinc-200">
          {sales.length === 0 ? "No sales created yet" : "No sales match your filters"}
        </div>
      ) : viewMode === "list" ? (
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-100">
                <th className="px-5 py-3 w-16">Order</th>
                <th className="px-5 py-3">Sale</th>
                <th className="px-5 py-3">Issuer</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Live</th>
                <th className="px-5 py-3">Raised</th>
                <th className="px-5 py-3">Hard Cap</th>
                <th className="px-5 py-3">Progress</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sale) => {
                const raised = parseFloat(sale.total_raised || "0");
                const hardCap = parseFloat(sale.hard_cap || "0");
                const pct = hardCap > 0 ? (raised / hardCap) * 100 : 0;
                return (
                  <tr key={sale.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="px-5 py-3">
                      <input
                        type="number"
                        value={orderMap[sale.id] ?? ""}
                        onChange={(e) => updateOrder(sale.id, e.target.value === "" ? null : parseInt(e.target.value))}
                        placeholder="—"
                        className="w-14 text-xs border border-zinc-200 rounded px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-darkAqua"
                      />
                    </td>
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
                        {STATUS_LABELS[sale.status] || sale.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      {sale.is_visible
                        ? <Badge variant="success" size="sm">Yes</Badge>
                        : <Badge variant="default" size="sm">No</Badge>}
                    </td>
                    <td className="px-5 py-3 text-sm font-medium">${raised.toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-zinc-500">${hardCap.toLocaleString()}</td>
                    <td className="px-5 py-3 w-32">
                      <ProgressBar value={pct} size="sm" />
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/platform/sales/${sale.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((sale) => (
            <PlatformSaleCard
              key={sale.id}
              sale={sale}
              order={orderMap[sale.id] ?? null}
              onOrderChange={(v) => updateOrder(sale.id, v)}
            />
          ))}
        </div>
      )}
    </PlatformAdminLayout>
  );
}
