"use client";

import { motion } from "framer-motion";
import {
  TrendingUp,
  Users,
  DollarSign,
  BarChart3,
  ArrowUpRight,
} from "lucide-react";
import { Select } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { PlatformAdminLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const TVL_DATA = [
  { date: "Jan", tvl: 5200000 },
  { date: "Feb", tvl: 7800000 },
  { date: "Mar", tvl: 12400000 },
  { date: "Apr", tvl: 15600000 },
  { date: "May", tvl: 18900000 },
  { date: "Jun", tvl: 24500000 },
];

const FEE_DATA = [
  { date: "Jan", fees: 104000 },
  { date: "Feb", fees: 156000 },
  { date: "Mar", fees: 248000 },
  { date: "Apr", fees: 312000 },
  { date: "May", fees: 378000 },
  { date: "Jun", fees: 490000 },
];

const KYC_FUNNEL = [
  { stage: "Started", count: 2500, color: "#13636F" },
  { stage: "Documents", count: 2100, color: "#1a7a89" },
  { stage: "Liveness", count: 1800, color: "#2191a3" },
  { stage: "Approved", count: 1500, color: "#28a8bc" },
];

const TOKEN_DISTRIBUTION = [
  { name: "WAGR", value: 45, color: "#13636F" },
  { name: "CFQ2", value: 25, color: "#C9913D" },
  { name: "SLVR", value: 15, color: "#6366f1" },
  { name: "Others", value: 15, color: "#94a3b8" },
];

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
        <StatCard
          label="Total Value Locked"
          value={24500000}
          prefix="$"
          trend={15.2}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Total Users"
          value={5247}
          trend={8.5}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Fee Revenue (YTD)"
          value={1688000}
          prefix="$"
          trend={22.3}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          label="Active Tokens"
          value={12}
          icon={<BarChart3 className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* TVL Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-text">Total Value Locked</h3>
              <p className="text-sm text-gray-500">Historical TVL trend</p>
            </div>
            <div className="flex items-center gap-1 text-green-600 bg-green-100 px-3 py-1 rounded-full text-sm font-medium">
              <ArrowUpRight className="h-4 w-4" />
              +15.2%
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={TVL_DATA}>
              <defs>
                <linearGradient id="tvlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#13636F" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#13636F" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
              <YAxis
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(val) => `$${(val / 1000000).toFixed(0)}M`}
              />
              <Tooltip
                formatter={(val: number) => [formatCurrency(val), "TVL"]}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                }}
              />
              <Area
                type="monotone"
                dataKey="tvl"
                stroke="#13636F"
                strokeWidth={2}
                fill="url(#tvlGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Fee Revenue Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-text">Fee Revenue</h3>
              <p className="text-sm text-gray-500">Monthly platform fees</p>
            </div>
            <div className="flex items-center gap-1 text-green-600 bg-green-100 px-3 py-1 rounded-full text-sm font-medium">
              <ArrowUpRight className="h-4 w-4" />
              +22.3%
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={FEE_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
              <YAxis
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}K`}
              />
              <Tooltip
                formatter={(val: number) => [formatCurrency(val), "Fees"]}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                }}
              />
              <Bar dataKey="fees" fill="#13636F" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* KYC Funnel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-text">KYC Funnel</h3>
              <p className="text-sm text-gray-500">User verification progress</p>
            </div>
          </div>

          <div className="space-y-4">
            {KYC_FUNNEL.map((stage, index) => {
              const firstStage = KYC_FUNNEL[0];
              const percentage = firstStage ? (stage.count / firstStage.count) * 100 : 0;
              return (
                <motion.div
                  key={stage.stage}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-text">{stage.stage}</span>
                    <span className="text-sm text-gray-500">
                      {stage.count.toLocaleString()} ({percentage.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-3 bg-box rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.8, delay: 0.2 * index }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-6 p-4 rounded-xl bg-box">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Conversion Rate</span>
              <span className="font-bold text-darkAqua text-lg">
                {(() => {
                  const first = KYC_FUNNEL[0];
                  const last = KYC_FUNNEL[3];
                  return first && last ? ((last.count / first.count) * 100).toFixed(1) : "0.0";
                })()}%
              </span>
            </div>
          </div>
        </motion.div>

        {/* Token Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-text">TVL by Token</h3>
              <p className="text-sm text-gray-500">Distribution across tokens</p>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={TOKEN_DISTRIBUTION}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {TOKEN_DISTRIBUTION.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number) => [`${val}%`, "Share"]}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            {TOKEN_DISTRIBUTION.map((token) => (
              <div key={token.name} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: token.color }}
                />
                <span className="text-sm text-gray-600">{token.name}</span>
                <span className="text-sm font-semibold ml-auto">{token.value}%</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </PlatformAdminLayout>
  );
}
