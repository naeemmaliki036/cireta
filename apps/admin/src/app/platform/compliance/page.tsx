"use client";

import { useState, useEffect } from "react";
import { Shield, Globe, Lock, Search } from "lucide-react";
import { Badge, Spinner } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { DataTable, type Column } from "@/components/molecules";
import { PlatformAdminLayout } from "@/components/templates";
import { getFrozenAddresses, getAuditLogs, type FrozenAddress, type AuditLogEntry } from "@/lib/api/repositories/compliance";
import { getAccessToken } from "@/lib/api/client";

function getToken() {
  return getAccessToken() ?? undefined;
}

const frozenCols: Column<FrozenAddress>[] = [
  { key: "wallet_address", header: "Address", render: (r) => <CopyableAddress address={r.wallet_address} truncate className="text-xs bg-zinc-100 px-2 py-1 rounded" /> },
  { key: "reason", header: "Reason", render: (r) => <span className="text-sm text-zinc-500">{r.reason}</span> },
  { key: "frozen_at", header: "Frozen At", render: (r) => <span className="text-sm text-zinc-400">{r.frozen_at.slice(0, 10)}</span> },
];

export default function PlatformCompliancePage() {
  const [frozen, setFrozen] = useState<FrozenAddress[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [f, l] = await Promise.all([
          getFrozenAddresses(getToken()),
          getAuditLogs(1, 50, undefined, getToken()),
        ]);
        setFrozen(f.items);
        setLogs(l.items);
      } catch (err) { console.error("Failed to load compliance data:", err); }
      finally { setLoading(false); }
    })();
  }, []);

  const filteredFrozen = frozen.filter((f) =>
    !search || f.wallet_address.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <PlatformAdminLayout title="Platform Compliance" description="Monitor frozen addresses and compliance actions">
      {/* Inline stats */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[
          { label: "Frozen Addresses", value: frozen.length, icon: Lock, color: "text-zinc-600" },
          { label: "Compliance Actions", value: logs.length, icon: Shield, color: "text-purple-600" },
          { label: "Active Rules", value: 0, icon: Globe, color: "text-teal-600" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs"
          >
            <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
            <span className="text-zinc-500">{stat.label}</span>
            <span className="font-semibold text-zinc-900">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Frozen Addresses */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-900">Frozen Addresses</h2>
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              placeholder="Search address\u2026"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-zinc-200 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white focus:outline-none focus:border-zinc-400"
            />
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : filteredFrozen.length === 0 ? (
          <p className="text-center text-zinc-400 py-8 text-sm">No frozen addresses</p>
        ) : (
          <DataTable columns={frozenCols} data={filteredFrozen} />
        )}
      </div>

      {/* Recent Actions */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <h2 className="text-sm font-semibold text-zinc-900 mb-4">Recent Actions</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : logs.length === 0 ? (
          <p className="text-center text-zinc-400 py-8 text-sm">No compliance actions yet</p>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 10).map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
                <div className="flex items-center gap-3">
                  <Badge variant={log.action === "freeze" ? "pending" : log.action === "unfreeze" ? "active" : "default"} size="sm">{log.action}</Badge>
                  <code className="text-xs text-zinc-500">{log.target_id.slice(0, 12)}\u2026</code>
                </div>
                <span className="text-xs text-zinc-400">{log.created_at.slice(0, 16).replace("T", " ")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PlatformAdminLayout>
  );
}
