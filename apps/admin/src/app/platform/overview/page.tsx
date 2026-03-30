"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Coins,
  ShoppingCart,
  Users,
  TrendingUp,
  ArrowUpRight,
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
    { label: "Issuers", value: stats.total_issuers, sub: "registered", icon: Building2, color: "text-blue-600", bg: "bg-blue-50", href: "/platform/issuers" },
    { label: "Active Sales", value: stats.active_sales, sub: "live now", icon: ShoppingCart, color: "text-purple-600", bg: "bg-purple-50", href: "/platform/sales" },
    { label: "Users", value: stats.total_users, sub: "registered", icon: Users, color: "text-amber-600", bg: "bg-amber-50", href: "/platform/users" },
    { label: "Fees Collected", value: formatUsd(String(stats.platform_fees_collected_usdc)), sub: "platform fees", icon: Coins, color: "text-teal-600", bg: "bg-teal-50", href: "/platform/settings" },
  ];

  return (
    <PlatformAdminLayout
      title="Platform Overview"
      description="Cireta platform health and key metrics"
      breadcrumbs={[{ label: "Platform" }, { label: "Overview" }]}
    >
      {/* Total Raised Banner */}
      <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 rounded-2xl p-8 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/60 text-sm font-medium mb-1">Total Value Raised</p>
            <p className="text-4xl font-bold">{loading ? "..." : formatUsd(String(stats.total_raised_usdc))}</p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
            <TrendingUp className="h-8 w-8 text-white/80" />
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="bg-white rounded-2xl border border-zinc-100 p-6 hover:shadow-md hover:border-zinc-200 transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <ArrowUpRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
            </div>
            <p className="text-2xl font-bold text-zinc-900">{loading ? "..." : card.value}</p>
            <p className="text-sm text-zinc-400 mt-1">{card.label} &middot; {card.sub}</p>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-8">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/platform/issuers" className="flex items-center gap-3 p-4 rounded-xl border border-zinc-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all">
            <Building2 className="h-5 w-5 text-blue-600" />
            <div>
              <p className="font-medium text-sm text-zinc-900">Manage Issuers</p>
              <p className="text-xs text-zinc-400">Approve, activate, review</p>
            </div>
          </Link>
          <Link href="/platform/compliance" className="flex items-center gap-3 p-4 rounded-xl border border-zinc-100 hover:border-purple-200 hover:bg-purple-50/50 transition-all">
            <Shield className="h-5 w-5 text-purple-600" />
            <div>
              <p className="font-medium text-sm text-zinc-900">Compliance</p>
              <p className="text-xs text-zinc-400">Audit logs, freeze, recover</p>
            </div>
          </Link>
          <Link href="/platform/settings" className="flex items-center gap-3 p-4 rounded-xl border border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50 transition-all">
            <Globe className="h-5 w-5 text-zinc-600" />
            <div>
              <p className="font-medium text-sm text-zinc-900">Platform Settings</p>
              <p className="text-xs text-zinc-400">Fees, KYC, OTC templates</p>
            </div>
          </Link>
        </div>
      </div>
    </PlatformAdminLayout>
  );
}
