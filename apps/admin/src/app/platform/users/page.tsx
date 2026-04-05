"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users, Search, ShieldCheck, Clock, UserX, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/atoms";
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
  const [page, setPage] = useState(1);
  const pageSize = 10;

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
          <p className="font-medium text-sm text-zinc-900">{row.display_name || row.email.split("@")[0]}</p>
          <p className="text-xs text-zinc-400">{row.email}</p>
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
        <span className="text-xs text-zinc-500">{row.created_at.slice(0, 10)}</span>
      ),
    },
  ];

  return (
    <PlatformAdminLayout
      title="Investor Management"
      description="View and manage registered investors"
    >
      {/* Inline stats */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[
          { label: "Total Members", value: users.length, icon: Users, color: "text-zinc-600" },
          { label: "Approved", value: approved, icon: ShieldCheck, color: "text-green-600" },
          { label: "Pending", value: pending, icon: Clock, color: "text-amber-600" },
          { label: "Unverified", value: unverified, icon: UserX, color: "text-zinc-400" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs"
          >
            <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
            <span className="text-zinc-500">{stat.label}</span>
            <span className="font-semibold text-zinc-900">{loading ? "—" : stat.value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-zinc-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:border-zinc-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-zinc-400"
        >
          <option value="all">All Status</option>
          <option value="none">Unverified</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Pagination info + controls */}
      {(() => {
        const totalPages = Math.ceil(filtered.length / pageSize);
        const start = (page - 1) * pageSize;
        const paged = filtered.slice(start, start + pageSize);
        return (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-zinc-400">
                Showing {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + pageSize, filtered.length)} of {filtered.length}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-zinc-600 px-2">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <DataTable
              columns={columns}
              data={paged}
              onRowClick={(row) => router.push(`/platform/users/${row.id}`)}
              emptyMessage={loading ? "Loading users..." : "No users found"}
            />
          </>
        );
      })()}
    </PlatformAdminLayout>
  );
}
