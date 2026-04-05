"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Coins,
  ShoppingCart,
  Users,
  TrendingUp,
  Shield,
  Globe,
} from "lucide-react";
import { PlatformAdminLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";

interface PlatformStats {
  total_users: number;
  total_issuers: number;
  active_sales: number;
  tvl_usdc: number;
  total_raised_usdc: number;
  platform_fees_collected_usdc: number;
}

const defaultStats: PlatformStats = {
  total_users: 0,
  total_issuers: 0,
  active_sales: 0,
  tvl_usdc: 0,
  total_raised_usdc: 0,
  platform_fees_collected_usdc: 0,
};

export default function PlatformOverviewPage() {
  const [stats, setStats] = useState<PlatformStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<PlatformStats>("/api/v1/admin/platform/stats");
        setStats(data);
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const formatUsd = (val: string) => {
    const num = parseFloat(val);
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const statCards = [
    { label: "Total Raised", value: formatUsd(String(stats.total_raised_usdc)), icon: TrendingUp, color: "text-blue-600" },
    { label: "Active Sales", value: stats.active_sales, icon: ShoppingCart, color: "text-amber-600" },
    { label: "Total Users", value: stats.total_users, icon: Users, color: "text-zinc-600" },
    { label: "Fees Earned", value: formatUsd(String(stats.platform_fees_collected_usdc)), icon: Coins, color: "text-teal-600" },
  ];

  return (
    <PlatformAdminLayout
      title="Platform Overview"
      description="Cireta platform health and key metrics"
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-zinc-200 p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">{card.label}</p>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="text-2xl font-bold text-zinc-900">{loading ? "..." : card.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <h2 className="text-sm font-semibold text-zinc-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/platform/sales" className="flex items-center gap-4 p-4 rounded-xl border border-zinc-100 hover:border-zinc-300 transition-all">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-zinc-900">Manage Sales</p>
              <p className="text-xs text-zinc-400">Approve, activate, visibility</p>
            </div>
          </Link>
          <Link href="/platform/compliance" className="flex items-center gap-4 p-4 rounded-xl border border-zinc-100 hover:border-zinc-300 transition-all">
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-zinc-900">Compliance</p>
              <p className="text-xs text-zinc-400">Audit logs, freeze, recover</p>
            </div>
          </Link>
          <Link href="/platform/settings" className="flex items-center gap-4 p-4 rounded-xl border border-zinc-100 hover:border-zinc-300 transition-all">
            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0">
              <Globe className="h-5 w-5 text-zinc-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-zinc-900">Platform Settings</p>
              <p className="text-xs text-zinc-400">Fees, KYC, OTC templates</p>
            </div>
          </Link>
        </div>
      </div>
    </PlatformAdminLayout>
  );
}
