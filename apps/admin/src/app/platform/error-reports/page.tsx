"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { PlatformAdminLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";
import { Spinner } from "@/components/atoms";

interface ErrorReport {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  wallet_address: string | null;
  tx_hash: string | null;
  contract_address: string | null;
  function_name: string | null;
  chain_id: number | null;
  error_code: string | null;
  error_message: string | null;
  page_url: string | null;
  user_agent: string | null;
  additional_details: string | null;
  recipient_email: string | null;
  email_status: string | null;
}

interface ErrorReportListResponse {
  items: ErrorReport[];
  total: number;
  page: number;
  size: number;
}

const PAGE_SIZE = 25;

function explorerTxUrl(chainId: number | null, txHash: string | null): string | null {
  if (!chainId || !txHash) return null;
  const map: Record<number, string> = {
    1: "https://etherscan.io",
    8453: "https://basescan.org",
    84532: "https://sepolia.basescan.org",
    11155111: "https://sepolia.etherscan.io",
    137: "https://polygonscan.com",
  };
  const base = map[chainId];
  return base ? `${base}/tx/${txHash}` : null;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export default function ErrorReportsPage() {
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterFunction, setFilterFunction] = useState("");
  const [hasTxFilter, setHasTxFilter] = useState<"all" | "yes" | "no">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("size", String(PAGE_SIZE));
    if (filterFunction) params.set("function_name", filterFunction);
    if (hasTxFilter === "yes") params.set("has_tx", "true");
    if (hasTxFilter === "no") params.set("has_tx", "false");
    apiFetch<ErrorReportListResponse>(`/api/v1/admin/error-reports?${params}`)
      .then((res) => {
        if (cancelled) return;
        setReports(res.items);
        setTotal(res.total);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load reports");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, filterFunction, hasTxFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selected = reports.find((r) => r.id === selectedId) ?? null;

  return (
    <PlatformAdminLayout title="Error Reports" description="User-submitted reports of failed transactions or errors">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Function</label>
          <input
            value={filterFunction}
            onChange={(e) => { setFilterFunction(e.target.value); setPage(1); }}
            placeholder="e.g. buy, addPhase"
            className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-400"
          />
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Has tx hash</label>
          <select
            value={hasTxFilter}
            onChange={(e) => { setHasTxFilter(e.target.value as "all" | "yes" | "no"); setPage(1); }}
            className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-400"
          >
            <option value="all">All</option>
            <option value="yes">With tx</option>
            <option value="no">No tx</option>
          </select>
        </div>
        <div className="text-xs text-zinc-500">{total.toLocaleString()} report{total === 1 ? "" : "s"}</div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      ) : reports.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-sm text-zinc-500">
          No error reports yet.
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Time</th>
                <th className="text-left px-4 py-2 font-medium">User</th>
                <th className="text-left px-4 py-2 font-medium">Function</th>
                <th className="text-left px-4 py-2 font-medium">Error</th>
                <th className="text-left px-4 py-2 font-medium">Tx</th>
                <th className="text-left px-4 py-2 font-medium">Email</th>
                <th className="text-right px-4 py-2 font-medium">—</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const txUrl = explorerTxUrl(r.chain_id, r.tx_hash);
                return (
                  <tr key={r.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-2 text-zinc-600 text-xs whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-2">
                      <div className="text-zinc-800">{r.user_email ?? "(anonymous)"}</div>
                      {r.wallet_address && <div className="font-mono text-[11px] text-zinc-400">{r.wallet_address.slice(0, 6)}…{r.wallet_address.slice(-4)}</div>}
                    </td>
                    <td className="px-4 py-2 text-zinc-700">{r.function_name ?? "—"}</td>
                    <td className="px-4 py-2 max-w-xs">
                      <div className="text-red-700 font-medium truncate">{r.error_code ?? "—"}</div>
                      {r.error_message && <div className="text-[11px] text-zinc-500 truncate">{r.error_message}</div>}
                    </td>
                    <td className="px-4 py-2">
                      {r.tx_hash ? (
                        txUrl ? (
                          <a href={txUrl} target="_blank" rel="noopener noreferrer" className="text-darkAqua hover:underline inline-flex items-center gap-1 text-xs font-mono">
                            {r.tx_hash.slice(0, 6)}…<ExternalLink className="h-3 w-3" />
                          </a>
                        ) : <span className="font-mono text-xs text-zinc-500">{r.tx_hash.slice(0, 10)}…</span>
                      ) : <span className="text-zinc-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        r.email_status === "sent" ? "bg-emerald-100 text-emerald-700"
                          : r.email_status === "dev_logged" ? "bg-zinc-100 text-zinc-600"
                          : r.email_status === "error" ? "bg-red-100 text-red-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}>{r.email_status ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => setSelectedId(r.id)} className="text-darkAqua text-xs font-medium hover:underline">View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-900 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <span className="text-zinc-500 text-xs">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-900 disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedId(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-semibold text-base">Error report — {fmtDateTime(selected.created_at)}</h3>
              <button onClick={() => setSelectedId(null)} className="text-zinc-400 hover:text-zinc-700">×</button>
            </div>
            <dl className="p-5 grid grid-cols-3 gap-y-2 gap-x-4 text-sm">
              {[
                ["User", selected.user_email],
                ["Wallet", selected.wallet_address],
                ["Function", selected.function_name],
                ["Page", selected.page_url],
                ["Tx hash", selected.tx_hash],
                ["Contract", selected.contract_address],
                ["Chain", selected.chain_id?.toString()],
                ["Error code", selected.error_code],
                ["Error message", selected.error_message],
                ["Recipient", selected.recipient_email],
                ["Email status", selected.email_status],
                ["User agent", selected.user_agent],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-zinc-500 col-span-1">{k}</dt>
                  <dd className="col-span-2 text-zinc-800 break-all font-mono text-xs whitespace-pre-wrap">{v || "—"}</dd>
                </div>
              ))}
              <div className="contents">
                <dt className="text-zinc-500 col-span-1">User notes</dt>
                <dd className="col-span-2 text-zinc-800 whitespace-pre-wrap text-sm bg-amber-50 border border-amber-200 rounded p-2">
                  {selected.additional_details || "(none)"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </PlatformAdminLayout>
  );
}
