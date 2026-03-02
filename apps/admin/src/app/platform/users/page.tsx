"use client";

import { PlatformAdminLayout } from "@/components/templates/PlatformAdminLayout";
import { DataTable, type Column } from "@/components/molecules/DataTable";
import { Badge } from "@/components/atoms";
import { Users } from "lucide-react";

interface PlatformUser {
  id: string;
  email: string;
  kyc_level: number;
  kyc_status: string;
  wallets: number;
  country: string;
  created_at: string;
}

const MOCK_USERS: PlatformUser[] = [
  { id: "1", email: "investor@cireta.com", kyc_level: 2, kyc_status: "approved", wallets: 1, country: "AE", created_at: "2026-01-15" },
  { id: "2", email: "issuer@cireta.com", kyc_level: 3, kyc_status: "approved", wallets: 2, country: "GB", created_at: "2026-01-20" },
  { id: "3", email: "admin@cireta.com", kyc_level: 0, kyc_status: "pending", wallets: 0, country: "US", created_at: "2026-02-01" },
];

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
  { key: "wallets", header: "Wallets" },
  { key: "country", header: "Country" },
  { key: "created_at", header: "Registered" },
];

export default function PlatformUsersPage() {
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
          <p className="text-sm text-gray-500">{MOCK_USERS.length} total users</p>
        </div>
      </div>
      <DataTable<PlatformUser>
        columns={columns}
        data={MOCK_USERS}
      />
    </PlatformAdminLayout>
  );
}
