"use client";

import { useState, useEffect } from "react";
import { PlatformAdminLayout } from "@/components/templates/PlatformAdminLayout";
import { DataTable, type Column } from "@/components/molecules/DataTable";
import { Badge } from "@/components/atoms";
import { Users } from "lucide-react";
import { apiFetch } from "@/lib/api/client";

interface PlatformUser {
  id: string;
  email: string;
  kyc_level: number;
  kyc_status: string;
  wallet_address: string | null;
  onchain_id: string | null;
  created_at: string;
}

const KYC_LABELS: Record<number, string> = {
  0: "Unverified", 1: "Basic KYC", 2: "Enhanced KYC", 3: "Accredited", 4: "Corporate KYB",
};

const columns: Column<PlatformUser>[] = [
  { key: "email", header: "Email" },
  {
    key: "kyc_level",
    header: "KYC Level",
    render: (row) => (
      <Badge variant={row.kyc_level >= 2 ? "success" : row.kyc_level === 1 ? "pending" : "default"}>
        {KYC_LABELS[row.kyc_level] ?? `Level ${row.kyc_level}`}
      </Badge>
    ),
  },
  {
    key: "kyc_status",
    header: "Status",
    render: (row) => (
      <Badge variant={row.kyc_status === "approved" ? "success" : row.kyc_status === "pending" ? "pending" : "error"}>
        {row.kyc_status}
      </Badge>
    ),
  },
  { key: "wallet_address", header: "Wallet", render: (row) => <span className="font-mono text-xs">{row.wallet_address ? `${row.wallet_address.slice(0, 6)}...${row.wallet_address.slice(-4)}` : "—"}</span> },
  { key: "created_at", header: "Registered" },
];

export default function PlatformUsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: PlatformUser[]; total: number }>("/api/v1/admin/investors/?page=1&size=100")
      .then((data) => setUsers(data.items ?? []))
      .catch(() => setError("Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PlatformAdminLayout
      title="Users"
      description="All registered platform users"
      breadcrumbs={[{ label: "Platform" }, { label: "Users" }]}
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-darkAqua/10 rounded-xl flex items-center justify-center">
          <Users className="w-5 h-5 text-darkAqua" />
        </div>
        <div>
          <p className="text-sm text-gray-500">
            {loading ? "Loading..." : `${users.length} total users`}
          </p>
        </div>
      </div>
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      ) : (
        <DataTable<PlatformUser>
          columns={columns}
          data={users}
        />
      )}
    </PlatformAdminLayout>
  );
}
