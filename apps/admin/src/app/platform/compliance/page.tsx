"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, Globe, Lock } from "lucide-react";
import { Badge, Spinner, Input } from "@/components/atoms";
import { StatCard, DataTable, type Column } from "@/components/molecules";
import { PlatformAdminLayout } from "@/components/templates";
import { getFrozenAddresses, getAuditLogs, type FrozenAddress, type AuditLogEntry } from "@/lib/api/repositories/compliance";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? undefined : undefined;
}

const frozenCols: Column<FrozenAddress>[] = [
  { key: "wallet_address", header: "Address", render: (r) => <code className="text-xs bg-box px-2 py-1 rounded">{r.wallet_address.slice(0, 12)}\u2026</code> },
  { key: "reason", header: "Reason", render: (r) => <span className="text-sm text-darkBlack/60">{r.reason}</span> },
  { key: "frozen_at", header: "Frozen At", render: (r) => <span className="text-sm text-darkBlack/50">{r.frozen_at.slice(0, 10)}</span> },
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
      } catch { /* empty */ }
      finally { setLoading(false); }
    })();
  }, []);

  const filteredFrozen = frozen.filter((f) =>
    !search || f.wallet_address.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <PlatformAdminLayout title="Platform Compliance" description="Monitor frozen addresses and compliance actions">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Frozen Addresses" value={frozen.length} icon={<Lock className="h-5 w-5" />} />
        <StatCard label="Compliance Actions" value={logs.length} icon={<Shield className="h-5 w-5" />} />
        <StatCard label="Active Rules" value={0} icon={<Globe className="h-5 w-5" />} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text">Frozen Addresses</h2>
          <div className="w-64">
            <Input placeholder="Search address\u2026" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : filteredFrozen.length === 0 ? (
          <p className="text-center text-darkBlack/40 py-8">No frozen addresses</p>
        ) : (
          <DataTable columns={frozenCols} data={filteredFrozen} />
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10">
        <h2 className="text-lg font-semibold text-text mb-6">Recent Actions</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : logs.length === 0 ? (
          <p className="text-center text-darkBlack/40 py-8">No compliance actions yet</p>
        ) : (
          <div className="space-y-3">
            {logs.slice(0, 10).map((log) => (
              <div key={log.id} className="flex items-center justify-between py-3 border-b border-darkBlack/5 last:border-0">
                <div className="flex items-center gap-3">
                  <Badge variant={log.action === "freeze" ? "pending" : log.action === "unfreeze" ? "active" : "default"} size="sm">{log.action}</Badge>
                  <code className="text-xs text-darkBlack/60">{log.target_id.slice(0, 12)}\u2026</code>
                </div>
                <span className="text-xs text-darkBlack/40">{log.created_at.slice(0, 16).replace("T", " ")}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </PlatformAdminLayout>
  );
}
