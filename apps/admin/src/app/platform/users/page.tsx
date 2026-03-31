"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Users, Search, ShieldCheck, Clock, UserX } from "lucide-react";
import { Badge, Select } from "@/components/atoms";
import { DataTable, type Column } from "@/components/molecules";
import { PlatformAdminLayout } from "@/components/templates";
import { getInvestors, type Investor } from "@/lib/api/repositories/investors";

const KYC_LABELS: Record<number, string> = {
  0: "Unverified",
  1: "Basic",
  2: "Enhanced",
  3: "Accredited",
  4: "Corporate",
};

export default function PlatformUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    (async () => {
      try {
        const data = await getInvestors(1, 100);
        setUsers(data.items);
      } catch (err) {
        console.error("Failed to load users:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.display_name ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || u.kyc_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const approved = users.filter((u) => u.kyc_status === "approved").length;
  const pending = users.filter((u) => u.kyc_status === "pending").length;
  const unverified = users.filter((u) => u.kyc_status === "none").length;

  const columns: Column<Investor>[] = [
    {
      key: "email",
      header: "User",
      render: (row) => (
        <div>
          <p className="font-semibold text-text">{row.display_name || row.email.split("@")[0]}</p>
          <p className="text-xs text-gray-500">{row.email}</p>
        </div>
      ),
    },
    {
      key: "investor_type",
      header: "Type",
      render: (row) => (
        <span className="text-xs font-medium capitalize">{row.investor_type ?? "—"}</span>
      ),
    },
    {
      key: "kyc_level",
      header: "KYC Level",
      render: (row) => (
        <Badge
          variant={row.kyc_level >= 2 ? "success" : row.kyc_level === 1 ? "pending" : "default"}
          size="sm"
        >
          {KYC_LABELS[row.kyc_level] ?? `Level ${row.kyc_level}`}
        </Badge>
      ),
    },
    {
      key: "kyc_status",
      header: "Status",
      render: (row) => (
        <Badge
          variant={
            row.kyc_status === "approved"
              ? "success"
              : row.kyc_status === "pending"
                ? "pending"
                : row.kyc_status === "rejected"
                  ? "error"
                  : "default"
          }
          size="sm"
        >
          {row.kyc_status}
        </Badge>
      ),
    },
    {
      key: "wallet_count",
      header: "Wallets",
      render: (row) => <span className="font-mono text-sm">{row.wallet_count}</span>,
    },
    {
      key: "onboarding_completed",
      header: "Onboarding",
      render: (row) => (
        <Badge variant={row.onboarding_completed ? "success" : "default"} size="sm">
          {row.onboarding_completed ? "Complete" : "Incomplete"}
        </Badge>
      ),
    },
    {
      key: "created_at",
      header: "Registered",
      render: (row) => (
        <span className="text-xs text-gray-500">{row.created_at.slice(0, 10)}</span>
      ),
    },
  ];

  return (
    <PlatformAdminLayout
      title="Investor Management"
      description="View and manage registered investors"
    >
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          { label: "Total Users", value: users.length, icon: Users, color: "bg-darkAqua/10 text-darkAqua" },
          { label: "KYC Approved", value: approved, icon: ShieldCheck, color: "bg-green-100 text-green-600" },
          { label: "Pending", value: pending, icon: Clock, color: "bg-amber-100 text-amber-600" },
          { label: "Unverified", value: unverified, icon: UserX, color: "bg-zinc-100 text-zinc-500" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white rounded-3xl p-6 border border-darkBlack/10"
          >
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{stat.label}</p>
                <p className="text-2xl font-bold text-text">{loading ? "—" : stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6"
      >
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-12"
            />
          </div>
          <Select
            options={[
              { value: "all", label: "All Status" },
              { value: "none", label: "Unverified" },
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={(row) => router.push(`/platform/users/${row.id}`)}
          emptyMessage={loading ? "Loading users..." : "No users found"}
        />
      </motion.div>
    </PlatformAdminLayout>
  );
}
