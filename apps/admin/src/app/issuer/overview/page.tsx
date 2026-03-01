"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Coins,
  Users,
  TrendingUp,
  Wallet,
  Plus,
  ArrowUpRight,
  BarChart3,
  Clock,
} from "lucide-react";
import { Button, Badge, ProgressBar } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";

const MOCK_STATS = {
  tvl: 2450000,
  totalRaised: 8200000,
  investors: 1247,
  feesEarned: 164000,
  activeTokens: 4,
  activeSales: 2,
};

const MOCK_RECENT_SALES = [
  {
    id: "1",
    name: "West African Gold Reserve",
    symbol: "WAGR",
    raised: 2450000,
    target: 5000000,
    status: "active" as const,
    endDate: "2024-04-15",
  },
  {
    id: "2",
    name: "Copper Futures Q2 2024",
    symbol: "CFQ2",
    raised: 750000,
    target: 1000000,
    status: "active" as const,
    endDate: "2024-03-30",
  },
];

const MOCK_RECENT_ACTIVITY = [
  { action: "New investment", amount: 25000, time: "2 minutes ago" },
  { action: "KYC approved", wallet: "0x1234...5678", time: "15 minutes ago" },
  { action: "Token claim", amount: 500, symbol: "WAGR", time: "1 hour ago" },
  { action: "New investor", wallet: "0xabcd...ef12", time: "2 hours ago" },
];

export default function IssuerOverviewPage() {
  return (
    <IssuerDashboardLayout
      title="Dashboard Overview"
      description="Monitor your tokens and sales performance"
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Total Value Locked"
          value={MOCK_STATS.tvl}
          prefix="$"
          trend={12.5}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Total Raised"
          value={MOCK_STATS.totalRaised}
          prefix="$"
          trend={8.2}
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <StatCard
          label="Total Investors"
          value={MOCK_STATS.investors}
          trend={15.3}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Fees Earned"
          value={MOCK_STATS.feesEarned}
          prefix="$"
          trend={5.1}
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-8"
      >
        <h2 className="text-lg font-semibold text-text mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/issuer/tokens/new"
            className="flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-darkBlack/10 hover:border-darkAqua hover:bg-darkAqua/5 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-darkAqua/10 flex items-center justify-center group-hover:bg-darkAqua/20 transition-colors">
              <Plus className="h-6 w-6 text-darkAqua" />
            </div>
            <div>
              <p className="font-semibold text-text">Create Token</p>
              <p className="text-sm text-gray-500">Deploy new ERC-3643</p>
            </div>
          </Link>

          <Link
            href="/issuer/sales/new"
            className="flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-darkBlack/10 hover:border-darkAqua hover:bg-darkAqua/5 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center group-hover:bg-gold/20 transition-colors">
              <TrendingUp className="h-6 w-6 text-gold" />
            </div>
            <div>
              <p className="font-semibold text-text">Start Sale</p>
              <p className="text-sm text-gray-500">Launch token sale</p>
            </div>
          </Link>

          <Link
            href="/issuer/compliance"
            className="flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-darkBlack/10 hover:border-darkAqua hover:bg-darkAqua/5 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
              <Coins className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="font-semibold text-text">Manage Compliance</p>
              <p className="text-sm text-gray-500">Freeze, recover tokens</p>
            </div>
          </Link>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Sales */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-text">Active Sales</h2>
            <Link href="/issuer/sales">
              <Button variant="ghost" size="sm" rightIcon={<ArrowUpRight className="h-4 w-4" />}>
                View All
              </Button>
            </Link>
          </div>

          <div className="space-y-4">
            {MOCK_RECENT_SALES.map((sale) => (
              <Link
                key={sale.id}
                href={`/issuer/sales/${sale.id}`}
                className="block p-4 rounded-2xl bg-box hover:bg-darkAqua/5 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-text">{sale.name}</h3>
                    <p className="text-sm text-gray-500">{sale.symbol}</p>
                  </div>
                  <Badge variant="active" size="sm">
                    {sale.status}
                  </Badge>
                </div>

                <div className="mb-2">
                  <ProgressBar
                    value={(sale.raised / sale.target) * 100}
                    size="sm"
                  />
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    {formatCurrency(sale.raised)} / {formatCurrency(sale.target)}
                  </span>
                  <span className="text-gray-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Ends {sale.endDate}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-text">Recent Activity</h2>
          </div>

          <div className="space-y-4">
            {MOCK_RECENT_ACTIVITY.map((activity, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * index }}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-box transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-darkAqua" />
                  <div>
                    <p className="font-medium text-text">{activity.action}</p>
                    <p className="text-sm text-gray-500">
                      {activity.amount && formatCurrency(activity.amount)}
                      {activity.symbol && ` ${activity.symbol}`}
                      {activity.wallet}
                    </p>
                  </div>
                </div>
                <span className="text-sm text-gray-400">{activity.time}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </IssuerDashboardLayout>
  );
}
