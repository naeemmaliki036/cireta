"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { parseApiDate } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Download } from "lucide-react";
import { Badge, Spinner, Button } from "@/components/atoms";
import { DataTable, type Column } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";
import { getSales, type Sale } from "@/lib/api/repositories/sales";

interface Subscriber {
  id: string;
  sale_id: string;
  email: string;
  display_name: string | null;
  subscribed_at: string;
  notified_at: string | null;
  sale_title: string | null;
}

interface SubscribersResponse {
  items: Subscriber[];
  total: number;
}

const columns: Column<Subscriber>[] = [
  {
    key: "email",
    header: "Email",
    render: (row) => <span className="text-[13px] text-zinc-900">{row.email}</span>,
  },
  {
    key: "display_name",
    header: "Display Name",
    render: (row) => (
      <span className="text-[13px] text-zinc-600">{row.display_name || "\u2014"}</span>
    ),
  },
  {
    key: "sale_title",
    header: "Sale",
    render: (row) => (
      <span className="text-[13px] text-zinc-600">{row.sale_title || "\u2014"}</span>
    ),
  },
  {
    key: "subscribed_at",
    header: "Subscribed",
    render: (row) => (
      <span className="text-[13px] text-zinc-500">
        {parseApiDate(row.subscribed_at).toLocaleDateString()}
      </span>
    ),
  },
  {
    key: "notified_at",
    header: "Notified",
    render: (row) =>
      row.notified_at ? (
        <Badge variant="success" size="sm">Yes</Badge>
      ) : (
        <Badge variant="pending" size="sm">No</Badge>
      ),
  },
];

function downloadCSV(subscribers: Subscriber[]) {
  const header = "Email,Display Name,Sale,Subscribed Date,Notified";
  const rows = subscribers.map((s) =>
    [
      `"${s.email}"`,
      `"${s.display_name || ""}"`,
      `"${s.sale_title || ""}"`,
      parseApiDate(s.subscribed_at).toLocaleDateString(),
      s.notified_at ? "Yes" : "No",
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function IssuerSubscribersContent() {
  const searchParams = useSearchParams();
  const initialSaleId = searchParams.get("sale_id") || "";

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState(initialSaleId);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSales(1, 100)
      .then((data) => setSales(data.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const path = selectedSaleId
      ? `/api/v1/subscriptions?sale_id=${selectedSaleId}`
      : "/api/v1/subscriptions";
    apiFetch<SubscribersResponse>(path)
      .then((data) => setSubscribers(data.items))
      .catch(() => setSubscribers([]))
      .finally(() => setLoading(false));
  }, [selectedSaleId]);

  const notifiedCount = useMemo(
    () => subscribers.filter((s) => s.notified_at).length,
    [subscribers]
  );

  return (
    <IssuerDashboardLayout title="Subscribers" description="People interested in your token sales">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          { label: "Total Subscribers", value: subscribers.length },
          { label: "Notified", value: notifiedCount },
          { label: "Pending Notification", value: subscribers.length - notifiedCount },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg p-6 border border-black/10"
          >
            <p className="text-sm text-black/50 mb-2">{stat.label}</p>
            <p className="text-2xl font-bold text-text">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg p-6 border border-black/10"
      >
        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1">
            <select
              value={selectedSaleId}
              onChange={(e) => setSelectedSaleId(e.target.value)}
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
            >
              <option value="">All Sales</option>
              {sales.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.title || sale.token_name || sale.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCSV(subscribers)}
            disabled={subscribers.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={subscribers}
            emptyMessage="No subscribers yet"
          />
        )}
      </motion.div>
    </IssuerDashboardLayout>
  );
}

export default function IssuerSubscribersPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin h-6 w-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full" /></div>}>
      <IssuerSubscribersContent />
    </Suspense>
  );
}
