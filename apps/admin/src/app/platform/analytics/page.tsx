"use client";

import { TrendingUp, Users, DollarSign, BarChart3 } from "lucide-react";
import { Select } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { PlatformAdminLayout } from "@/components/templates";
import {
  TVLChart, FeeRevenueChart, KYCFunnelChart, TokenDistributionChart,
} from "@/lib/analyticsCharts";

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
      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
