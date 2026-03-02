"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Button, Input, Badge, Spinner } from "@/components/atoms";
import { DataTable, type Column } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import { getTokens, type Token } from "@/lib/api/repositories/tokens";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? undefined : undefined;
}

const columns: Column<Token>[] = [
  {
    key: "name",
    header: "Token",
    render: (row) => (
      <div>
        <p className="font-semibold text-text">{row.name}</p>
        <p className="text-xs text-darkBlack/40">{row.symbol} · {row.asset_type}</p>
      </div>
    ),
  },
  {
    key: "total_supply",
    header: "Supply",
    render: (row) => <span className="font-mono text-sm">{parseFloat(row.total_supply).toLocaleString()}</span>,
  },
  {
    key: "contract_address",
    header: "Contract",
    render: (row) => row.contract_address
      ? <code className="text-xs bg-box px-2 py-1 rounded">{row.contract_address.slice(0, 10)}…</code>
      : <Badge variant="pending" size="sm">Not deployed</Badge>,
  },
  {
    key: "is_paused",
    header: "Status",
    render: (row) => <Badge variant={row.is_paused ? "pending" : "active"} size="sm">{row.is_paused ? "Paused" : "Active"}</Badge>,
  },
  {
    key: "id",
    header: "",
    render: (row) => (
      <Link href={`/issuer/tokens/${row.id}`}>
        <Button variant="ghost" size="sm">Manage</Button>
      </Link>
    ),
  },
];

export default function TokensPage() {
  const [search, setSearch] = useState("");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getTokens(1, 50, undefined, getToken());
        setTokens(data.items);
      } catch { /* empty */ }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = tokens.filter((t) =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.symbol.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <IssuerDashboardLayout title="Tokens" description="Deploy and manage your ERC-3643 security tokens">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-8 border border-darkBlack/10 overflow-visible">
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1 max-w-xs">
            <Input placeholder="Search tokens…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Link href="/issuer/tokens/new">
            <Button variant="primary" >New Token</Button>
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-darkBlack/40 mb-4">No tokens yet</p>
            <Link href="/issuer/tokens/new">
              <Button variant="primary" >Create First Token</Button>
            </Link>
          </div>
        ) : (
          <DataTable columns={columns} data={filtered} />
        )}
      </motion.div>
    </IssuerDashboardLayout>
  );
}
