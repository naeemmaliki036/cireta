"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { Input, Badge, Spinner } from "@/components/atoms";
import { KYCBadge, WalletBadge, DataTable, type Column } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import { getInvestors, type Investor } from "@/lib/api/repositories/investors";

const columns: Column<Investor>[] = [
  {
    key: "email",
    header: "Investor",
    render: (row) => (
      <div>
        <p className="font-medium text-text">{row.email}</p>
        <p className="text-xs text-darkBlack/40">{row.id.slice(0, 8)}…</p>
      </div>
    ),
  },
  {
    key: "kyc_status",
    header: "KYC",
    render: (row) => <KYCBadge status={row.kyc_status as "none" | "pending" | "approved" | "rejected"} level={row.kyc_level} />,
  },
  {
    key: "wallet_address",
    header: "Wallet",
    render: (row) => row.wallet_address ? <WalletBadge address={row.wallet_address} /> : <span className="text-darkBlack/30 text-sm">—</span>,
  },
  {
    key: "created_at",
    header: "Joined",
    render: (row) => <span className="text-sm text-darkBlack/60">{row.created_at.slice(0, 10)}</span>,
  },
];

export default function InvestorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getInvestors(1, 100);
        setInvestors(data.items);
      } catch (err) { console.error("Failed to load investors:", err); }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = investors.filter((inv) =>
    !searchQuery || inv.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (inv.wallet_address?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false),
  );

  const verified = investors.filter((i) => i.kyc_status === "approved").length;

  return (
    <IssuerDashboardLayout title="Investors" description="Manage your verified investor base">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          { label: "Total Investors", value: investors.length, icon: <Users className="h-5 w-5" /> },
          { label: "KYC Verified", value: verified, icon: <Badge variant="active" size="sm">Verified</Badge> },
          { label: "Pending KYC", value: investors.filter((i) => i.kyc_status === "pending").length, icon: null },
        ].map((stat) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-6 border border-darkBlack/10">
            <p className="text-sm text-darkBlack/50 mb-2">{stat.label}</p>
            <p className="text-2xl font-bold text-text">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1">
            <Input placeholder="Search by email or wallet…"
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <DataTable columns={columns} data={filtered} />
        )}
      </motion.div>
    </IssuerDashboardLayout>
  );
}
