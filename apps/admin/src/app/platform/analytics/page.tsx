"use client";

import dynamic from "next/dynamic";
import { TrendingUp, Users, DollarSign, BarChart3 } from "lucide-react";
import { Select } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { PlatformAdminLayout } from "@/components/templates";

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

export default function AnalyticsPage() {
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
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Value Locked" value={24500000} prefix="$" trend={15.2}
          icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Total Users" value={5247} trend={8.5}
          icon={<Users className="h-5 w-5" />} />
        <StatCard label="Fee Revenue (YTD)" value={1688000} prefix="$" trend={22.3}
          icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Active Tokens" value={12}
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
