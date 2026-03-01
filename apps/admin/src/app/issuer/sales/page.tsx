"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Plus, Search, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { Button, Badge, ProgressBar, Select } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Sale {
  id: string;
  tokenName: string;
  tokenSymbol: string;
  status: "draft" | "active" | "paused" | "finalized" | "failed";
  softCap: number;
  hardCap: number;
  raised: number;
  investors: number;
  startDate: string;
  endDate: string;
}

const MOCK_SALES: Sale[] = [
  {
    id: "1",
    tokenName: "West African Gold Reserve",
    tokenSymbol: "WAGR",
    status: "active",
    softCap: 2000000,
    hardCap: 5000000,
    raised: 2450000,
    investors: 89,
    startDate: "2024-02-01",
    endDate: "2024-04-15",
  },
  {
    id: "2",
    tokenName: "Copper Futures Q2 2024",
    tokenSymbol: "CFQ2",
    status: "active",
    softCap: 500000,
    hardCap: 1000000,
    raised: 750000,
    investors: 45,
    startDate: "2024-02-15",
    endDate: "2024-03-31",
  },
  {
    id: "3",
    tokenName: "Silver Standard",
    tokenSymbol: "SLVR",
    status: "finalized",
    softCap: 1000000,
    hardCap: 2000000,
    raised: 2000000,
    investors: 156,
    startDate: "2024-01-01",
    endDate: "2024-01-31",
  },
];

const statusConfig = {
  draft: { color: "text-gray-500", bg: "bg-gray-100", label: "Draft" },
  active: { color: "text-green-600", bg: "bg-green-100", label: "Active" },
  paused: { color: "text-gold", bg: "bg-gold/10", label: "Paused" },
  finalized: { color: "text-darkAqua", bg: "bg-darkAqua/10", label: "Finalized" },
  failed: { color: "text-red-600", bg: "bg-red-100", label: "Failed" },
};

export default function SalesListPage() {
  return (
    <IssuerDashboardLayout
      title="Token Sales"
      description="Manage your token sales and fundraising"
      actions={
        <Link href="/issuer/sales/new">
          <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
            Start New Sale
          </Button>
        </Link>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Active Sales</p>
              <p className="text-2xl font-bold text-text">
                {MOCK_SALES.filter((s) => s.status === "active").length}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-darkAqua/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-darkAqua" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Raised</p>
              <p className="text-2xl font-bold text-text">
                {formatCurrency(MOCK_SALES.reduce((sum, s) => sum + s.raised, 0))}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <Clock className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Investors</p>
              <p className="text-2xl font-bold text-text">
                {MOCK_SALES.reduce((sum, s) => sum + s.investors, 0)}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6"
      >
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search sales..."
              className="input-field pl-12"
            />
          </div>
          <Select
            options={[
              { value: "all", label: "All Status" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "finalized", label: "Finalized" },
              { value: "failed", label: "Failed" },
            ]}
          />
        </div>
      </motion.div>

      {/* Sales List */}
      <div className="space-y-4">
        {MOCK_SALES.map((sale, index) => {
          const progress = (sale.raised / sale.hardCap) * 100;
          const config = statusConfig[sale.status];
          const softCapReached = sale.raised >= sale.softCap;

          return (
            <motion.div
              key={sale.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index }}
            >
              <Link
                href={`/issuer/sales/${sale.id}`}
                className="block bg-white rounded-3xl p-6 border border-darkBlack/10 hover:shadow-card transition-shadow"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-semibold text-text">{sale.tokenName}</h3>
                      <Badge variant="outline" size="sm">{sale.tokenSymbol}</Badge>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {formatDate(sale.startDate)} - {formatDate(sale.endDate)} • {sale.investors} investors
                    </p>
                  </div>

                  {softCapReached && sale.status === "active" && (
                    <div className="flex items-center gap-2 text-green-600 bg-green-100 px-3 py-1.5 rounded-full text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      Soft Cap Reached
                    </div>
                  )}
                </div>

                <div className="mb-3">
                  <ProgressBar value={progress} size="md" />
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    Raised: <span className="font-semibold text-text">{formatCurrency(sale.raised)}</span>
                  </span>
                  <span className="text-gray-500">
                    Hard Cap: <span className="font-semibold text-text">{formatCurrency(sale.hardCap)}</span>
                  </span>
                  <span className="text-darkAqua font-semibold">{Math.round(progress)}%</span>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </IssuerDashboardLayout>
  );
}
