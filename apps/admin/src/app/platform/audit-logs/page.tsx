"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, ChevronDown, Download, FileText } from "lucide-react";
import { Badge, Spinner } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import { getAuditLogs, getAuditLogActions, type AuditLogEntry } from "@/lib/api/repositories/compliance";
import { getAccessToken } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type ActionColor = "error" | "success" | "default";

function actionColor(action: string): ActionColor {
  if (["freeze", "pause"].includes(action)) return "error";
  if (["unfreeze", "unpause"].includes(action)) return "success";
  return "default";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [searchTarget, setSearchTarget] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAccessToken() ?? undefined;
      const data = await getAuditLogs(page, PAGE_SIZE, actionFilter || undefined, token);
      setLogs(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Reset to page 1 when filter changes
  useEffect(() => { setPage(1); }, [actionFilter]);

  // Populate action filter dropdown from backend
  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    getAuditLogActions(token)
      .then((actions) => setAvailableActions(actions))
      .catch(() => { /* fall back to empty — select stays usable */ });
  }, []);

  const filteredLogs = searchTarget
    ? logs.filter((l) => l.target_id.toLowerCase().includes(searchTarget.toLowerCase()))
    : logs;

  const handleExport = () => {
    const header = "Date,Action,Target Type,Target ID,Actor ID,Reason,IP Address\n";
    const rows = filteredLogs.map((l) =>
      [formatDate(l.created_at), l.action, l.target_type, l.target_id,
       l.actor_id ?? "", l.reason ?? "", l.ip_address ?? ""].map((v) => `"${v}"`).join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PlatformAdminLayout
      title="Audit Logs"
      description="Immutable record of all compliance and administrative actions"
      breadcrumbs={[{ label: "Platform", href: "/platform/overview" }, { label: "Audit Logs" }]}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Action filter */}
        <div className="relative">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="appearance-none border border-zinc-200 rounded-lg pl-3 pr-8 py-1.5 text-xs bg-white focus:outline-none focus:border-zinc-400"
          >
            <option value="">All actions</option>
            {availableActions.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-400 pointer-events-none" />
        </div>

        {/* Target search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <input
            placeholder="Search target ID..."
            value={searchTarget}
            onChange={(e) => setSearchTarget(e.target.value)}
            className="w-full border border-zinc-200 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white focus:outline-none focus:border-zinc-400"
          />
        </div>

        {/* Stats + Export */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-zinc-400">{total} total entries</span>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 rounded-lg text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-500">Date</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-500">Action</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-500">Target</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-500">Actor</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-500">Reason</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-500">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12"><div className="flex justify-center"><Spinner /></div></td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <FileText className="h-6 w-6 text-zinc-200 mx-auto mb-2" />
                    <p className="text-sm text-zinc-400">No audit logs found</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <LogRow
                    key={log.id}
                    log={log}
                    isExpanded={expandedId === log.id}
                    onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-100">
            <p className="text-xs text-zinc-400">
              Page {page} of {totalPages} ({total} entries)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium text-zinc-600">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </PlatformAdminLayout>
  );
}

/* ---- Row component (extracted to keep page under 300 LOC) ---- */

function LogRow({ log, isExpanded, onToggle }: { log: AuditLogEntry; isExpanded: boolean; onToggle: () => void }) {
  const color = actionColor(log.action);
  const badgeVariant = color === "error" ? "error" : color === "success" ? "success" : "outline";
  const isSystemEvent = log.actor_id === null;

  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          "border-b border-zinc-50 cursor-pointer hover:bg-zinc-50/50 transition-colors text-sm",
          isExpanded && "bg-zinc-50/50",
          isSystemEvent && "border-l-2 border-l-[#13636F]/20",
        )}
      >
        <td className="px-5 py-3 text-xs text-zinc-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
        <td className="px-5 py-3">
          <Badge variant={badgeVariant} size="sm">{log.action.replace(/_/g, " ")}</Badge>
        </td>
        <td className="px-5 py-3">
          <div className="flex flex-col">
            <code className="text-xs text-zinc-700 font-mono">
              {log.target_id.length > 20 ? `${log.target_id.slice(0, 10)}...${log.target_id.slice(-6)}` : log.target_id}
            </code>
            <span className="text-[10px] text-zinc-400">{log.target_type}</span>
          </div>
        </td>
        <td className="px-5 py-3">
          {isSystemEvent ? (
            <Badge variant="outline" size="sm">System</Badge>
          ) : (
            <code className="text-xs text-zinc-500 font-mono">
              {log.actor_id!.slice(0, 8)}...
            </code>
          )}
        </td>
        <td className="px-5 py-3 text-xs text-zinc-500 max-w-[200px] truncate">{log.reason ?? "--"}</td>
        <td className="px-5 py-3 text-xs text-zinc-400 font-mono">{log.ip_address ?? "--"}</td>
      </tr>
      {isExpanded && log.payload && (
        <tr className="bg-zinc-50/80">
          <td colSpan={6} className="px-5 py-3">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Payload</p>
            <pre className="text-xs text-zinc-600 bg-white border border-zinc-200 rounded-lg p-3 overflow-x-auto max-h-60">
              {JSON.stringify(log.payload, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}
