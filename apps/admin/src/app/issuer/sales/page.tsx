"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, BarChart3, Clock } from "lucide-react";
import Link from "next/link";
import { Button, Input, Badge, Spinner } from "@/components/atoms";
import { DataTable, type Column } from "@/components/molecules";
import { ProgressBar } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";
import { getSales, type Sale } from "@/lib/api/repositories/sales";
import { getAccessToken } from "@/lib/api/client";

function getToken() {
  return getAccessToken() ?? undefined;
}

const columns: Column<Sale>[] = [
  {
    key: "token_name",
    header: "Sale",
    render: (row) => (
      <div>
        <p className="font-semibold text-text">{row.token_name ?? "Unnamed"}</p>
        <p className="text-xs text-darkBlack/40">{row.token_symbol}</p>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <Badge variant={row.status === "active" ? "active" : row.status === "finalized" ? "default" : "pending"} size="sm">{row.status}</Badge>,
  },
  {
    key: "total_raised",
    header: "Raised",
    render: (row) => {
      const raised = parseFloat(row.total_raised || "0");
      const cap = parseFloat(row.hard_cap || "0");
      const pct = cap > 0 ? (raised / cap) * 100 : 0;
      return (
        <div className="min-w-[140px]">
          <p className="text-sm font-medium text-text mb-1">{formatCurrency(raised)}</p>
          <ProgressBar value={pct} size="sm" />
          <p className="text-xs text-darkBlack/40 mt-1">{pct.toFixed(0)}% of {formatCurrency(cap)}</p>
        </div>
      );
    },
  },
  {
    key: "id",
    header: "",
    render: (row) => (
      <Link href={`/issuer/sales/${row.id}`}>
        <Button variant="ghost" size="sm">View</Button>
      </Link>
    ),
  },
];

export default function SalesPage() {
  const [search, setSearch] = useState("");
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getSales(1, 50, getToken());
        setSales(data.items);
      } catch { /* empty */ }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = sales.filter((s) =>
    !search || (s.token_name ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const totalRaised = sales.reduce((acc, s) => acc + parseFloat(s.total_raised || "0"), 0);
  const active = sales.filter((s) => s.status === "active").length;

  return (
    <IssuerDashboardLayout title="Token Sales" description="Manage your active and past token sales">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          { label: "Total Sales", value: sales.length, icon: <BarChart3 className="h-5 w-5" /> },
          { label: "Active", value: active, icon: <TrendingUp className="h-5 w-5" /> },
          { label: "Total Raised", value: formatCurrency(totalRaised), icon: <Clock className="h-5 w-5" />, raw: true },
        ].map((stat) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-6 border border-darkBlack/10">
            <p className="text-sm text-darkBlack/50 mb-2">{stat.label}</p>
            <p className="text-2xl font-bold text-text">{stat.raw ? stat.value : stat.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1 max-w-xs">
            <Input placeholder="Search sales…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Link href="/issuer/sales/new">
            <Button variant="primary" >New Sale</Button>
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-darkBlack/40 py-12">No sales yet</p>
        ) : (
          <DataTable columns={columns} data={filtered} />
        )}
      </motion.div>
    </IssuerDashboardLayout>
  );
}
