"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { TrendingUp, Users, DollarSign, BarChart3 } from "lucide-react";
import { Select } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { PlatformAdminLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";
import { getAccessToken } from "@/lib/api/client";

// Dynamic imports to prevent SSR crash with recharts (uses browser SVG APIs)
const TVLChart = dynamic(
  () => import("@/lib/analyticsCharts").then((m) => ({ default: m.TVLChart })),
  { ssr: false }
);
const FeeRevenueChart = dynamic(
  () => import("@/lib/analyticsCharts").then((m) => ({ default: m.FeeRevenueChart })),
  { ssr: false }
);
const KYCFunnelChart = dynamic(
  () => import("@/lib/analyticsCharts").then((m) => ({ default: m.KYCFunnelChart })),
  { ssr: false }
);
const TokenDistributionChart = dynamic(
  () => import("@/lib/analyticsCharts").then((m) => ({ default: m.TokenDistributionChart })),
  { ssr: false }
);

interface PlatformStats {
  total_users: number;
  total_issuers: number;
  active_sales: number;
  tvl_usdc: number;
  total_raised_usdc: number;
  platform_fees_collected_usdc: number;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = getAccessToken() ?? "";
        const data = await apiFetch<PlatformStats>("/api/v1/admin/platform/stats", { token });
        setStats(data);
      } catch {
        // Fallback: stats remain null, cards show 0
      }
    })();
  }, []);

  return (
    <PlatformAdminLayout
      title="Platform Analytics"
      description="Monitor platform performance and metrics"
      actions={
        <Select
          options={[
            { value: "7d", label: "Last 7 days" },
            { value: "30d", label: "Last 30 days" },
            { value: "90d", label: "Last 90 days" },
            { value: "1y", label: "Last year" },
          ]}
        />
      }
    >
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Value Locked" value={stats?.tvl_usdc ?? 0} prefix="$"
          icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Total Users" value={stats?.total_users ?? 0}
          icon={<Users className="h-5 w-5" />} />
        <StatCard label="Fee Revenue (YTD)" value={stats?.platform_fees_collected_usdc ?? 0} prefix="$"
          icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Active Sales" value={stats?.active_sales ?? 0}
          icon={<BarChart3 className="h-5 w-5" />} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <TVLChart />
        <FeeRevenueChart />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <KYCFunnelChart />
        <TokenDistributionChart />
      </div>
    </PlatformAdminLayout>
  );
}
