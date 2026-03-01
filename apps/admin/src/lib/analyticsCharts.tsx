"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

/* ─── data ─── */
export const TVL_DATA = [
  { date: "Jan", tvl: 5200000 }, { date: "Feb", tvl: 7800000 },
  { date: "Mar", tvl: 12400000 }, { date: "Apr", tvl: 15600000 },
  { date: "May", tvl: 18900000 }, { date: "Jun", tvl: 24500000 },
];

export const FEE_DATA = [
  { date: "Jan", fees: 104000 }, { date: "Feb", fees: 156000 },
  { date: "Mar", fees: 248000 }, { date: "Apr", fees: 312000 },
  { date: "May", fees: 378000 }, { date: "Jun", fees: 490000 },
];

export const KYC_FUNNEL = [
  { stage: "Started", count: 2500, color: "#13636F" },
  { stage: "Documents", count: 2100, color: "#1a7a89" },
  { stage: "Liveness", count: 1800, color: "#2191a3" },
  { stage: "Approved", count: 1500, color: "#28a8bc" },
];

export const TOKEN_DISTRIBUTION = [
  { name: "WAGR", value: 45, color: "#13636F" },
  { name: "CFQ2", value: 25, color: "#C9913D" },
  { name: "SLVR", value: 15, color: "#6366f1" },
  { name: "Others", value: 15, color: "#94a3b8" },
];

const chartTooltipStyle = { backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "12px" };

/* ─── TVL chart ─── */
export function TVLChart({ delay = 0.2 }: { delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-white rounded-3xl p-6 border border-darkBlack/10">
      <div className="flex items-center justify-between mb-6">
        <div><h3 className="text-lg font-semibold text-text">Total Value Locked</h3>
          <p className="text-sm text-gray-500">Historical TVL trend</p></div>
        <div className="flex items-center gap-1 text-green-600 bg-green-100 px-3 py-1 rounded-full text-sm font-medium">
          <ArrowUpRight className="h-4 w-4" />+15.2%</div>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={TVL_DATA}>
          <defs><linearGradient id="tvlGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#13636F" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#13636F" stopOpacity={0} />
          </linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
          <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `$${(v / 1e6).toFixed(0)}M`} />
          <Tooltip formatter={(v: number) => [formatCurrency(v), "TVL"]} contentStyle={chartTooltipStyle} />
          <Area type="monotone" dataKey="tvl" stroke="#13636F" strokeWidth={2} fill="url(#tvlGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

/* ─── Fee chart ─── */
export function FeeRevenueChart({ delay = 0.3 }: { delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-white rounded-3xl p-6 border border-darkBlack/10">
      <div className="flex items-center justify-between mb-6">
        <div><h3 className="text-lg font-semibold text-text">Fee Revenue</h3>
          <p className="text-sm text-gray-500">Monthly platform fees</p></div>
        <div className="flex items-center gap-1 text-green-600 bg-green-100 px-3 py-1 rounded-full text-sm font-medium">
          <ArrowUpRight className="h-4 w-4" />+22.3%</div>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={FEE_DATA}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
          <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `$${(v / 1e3).toFixed(0)}K`} />
          <Tooltip formatter={(v: number) => [formatCurrency(v), "Fees"]} contentStyle={chartTooltipStyle} />
          <Bar dataKey="fees" fill="#13636F" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

/* ─── KYC funnel ─── */
export function KYCFunnelChart({ delay = 0.4 }: { delay?: number }) {
  const first = KYC_FUNNEL[0]; const last = KYC_FUNNEL[3];
  const convRate = first && last ? ((last.count / first.count) * 100).toFixed(1) : "0.0";
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-white rounded-3xl p-6 border border-darkBlack/10">
      <h3 className="text-lg font-semibold text-text mb-1">KYC Funnel</h3>
      <p className="text-sm text-gray-500 mb-6">User verification progress</p>
      <div className="space-y-4">
        {KYC_FUNNEL.map((s, i) => {
          const pct = first ? (s.count / first.count) * 100 : 0;
          return (
            <motion.div key={s.stage} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * i }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-text">{s.stage}</span>
                <span className="text-sm text-gray-500">{s.count.toLocaleString()} ({pct.toFixed(0)}%)</span>
              </div>
              <div className="h-3 bg-box rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.2 * i }}
                  className="h-full rounded-full" style={{ backgroundColor: s.color }} />
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="mt-6 p-4 rounded-xl bg-box flex items-center justify-between">
        <span className="text-sm text-gray-500">Conversion Rate</span>
        <span className="font-bold text-darkAqua text-lg">{convRate}%</span>
      </div>
    </motion.div>
  );
}

/* ─── Token distribution pie ─── */
export function TokenDistributionChart({ delay = 0.5 }: { delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-white rounded-3xl p-6 border border-darkBlack/10">
      <h3 className="text-lg font-semibold text-text mb-1">TVL by Token</h3>
      <p className="text-sm text-gray-500 mb-6">Distribution across tokens</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={TOKEN_DISTRIBUTION} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={4} dataKey="value">
            {TOKEN_DISTRIBUTION.map((e, i) => <Cell key={`c-${i}`} fill={e.color} />)}
          </Pie>
          <Tooltip formatter={(v: number) => [`${v}%`, "Share"]} contentStyle={chartTooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-4 mt-4">
        {TOKEN_DISTRIBUTION.map((t) => (
          <div key={t.name} className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
            <span className="text-sm text-gray-600">{t.name}</span>
            <span className="text-sm font-semibold ml-auto">{t.value}%</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
