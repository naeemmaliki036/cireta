"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  TrendingUp,
  Users,
  Clock,
  DollarSign,
  Play,
  Pause,
  Settings,
  Plus,
  Edit,
  CheckCircle2,
} from "lucide-react";
import { Button, Badge, ProgressBar } from "@/components/atoms";
import { StatCard, DataTable, type Column } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency, formatDate } from "@/lib/utils";

const MOCK_SALE = {
  id: "1",
  tokenName: "West African Gold Reserve",
  tokenSymbol: "WAGR",
  status: "active" as const,
  softCap: 2000000,
  hardCap: 5000000,
  totalRaised: 2450000,
  investors: 89,
  paymentToken: "USDC",
  createdAt: "2024-02-01",
};

const MOCK_PHASES = [
  {
    id: "1",
    name: "Seed Round",
    pricePerToken: 80,
    allocation: 20000,
    sold: 18500,
    minContribution: 100,
    maxContribution: 10000,
    startTime: "2024-02-01",
    endTime: "2024-02-28",
    whitelistOnly: true,
    status: "completed" as const,
  },
  {
    id: "2",
    name: "Private Sale",
    pricePerToken: 90,
    allocation: 15000,
    sold: 8200,
    minContribution: 500,
    maxContribution: 25000,
    startTime: "2024-03-01",
    endTime: "2024-03-31",
    whitelistOnly: false,
    status: "active" as const,
  },
  {
    id: "3",
    name: "Public Sale",
    pricePerToken: 100,
    allocation: 15000,
    sold: 0,
    minContribution: 100,
    maxContribution: 50000,
    startTime: "2024-04-01",
    endTime: "2024-04-15",
    whitelistOnly: false,
    status: "upcoming" as const,
  },
];

const MOCK_CONTRIBUTIONS = [
  { wallet: "0x1234...5678", amount: 25000, tokens: 278, status: "confirmed", time: "2 hours ago" },
  { wallet: "0xabcd...ef12", amount: 10000, tokens: 111, status: "confirmed", time: "5 hours ago" },
  { wallet: "0x9876...4321", amount: 5000, tokens: 56, status: "pending", time: "8 hours ago" },
];

export default function SaleDetailPage() {
  const progress = (MOCK_SALE.totalRaised / MOCK_SALE.hardCap) * 100;
  const softCapReached = MOCK_SALE.totalRaised >= MOCK_SALE.softCap;

  const contributionColumns: Column<typeof MOCK_CONTRIBUTIONS[0]>[] = [
    {
      key: "wallet",
      header: "Investor",
      render: (row) => <code className="font-mono text-sm">{row.wallet}</code>,
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => <span className="font-semibold">{formatCurrency(row.amount)}</span>,
    },
    {
      key: "tokens",
      header: "Tokens",
      render: (row) => <span className="text-darkAqua font-medium">{row.tokens} {MOCK_SALE.tokenSymbol}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={row.status === "confirmed" ? "success" : "pending"} size="sm">
          {row.status}
        </Badge>
      ),
    },
    {
      key: "time",
      header: "Time",
      render: (row) => <span className="text-gray-500 text-sm">{row.time}</span>,
    },
  ];

  return (
    <IssuerDashboardLayout
      title={`${MOCK_SALE.tokenName} Sale`}
      description="Manage sale phases and track contributions"
      breadcrumbs={[
        { label: "Sales", href: "/issuer/sales" },
        { label: MOCK_SALE.tokenSymbol },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant={MOCK_SALE.status === "active" ? "dangerOutline" : "primary"}
            size="sm"
            leftIcon={MOCK_SALE.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          >
            {MOCK_SALE.status === "active" ? "Pause Sale" : "Resume Sale"}
          </Button>
          <Button variant="outline" size="sm" leftIcon={<Settings className="h-4 w-4" />}>
            Settings
          </Button>
        </div>
      }
    >
      {/* Sale Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-text">{MOCK_SALE.tokenName}</h2>
              <Badge variant={MOCK_SALE.status === "active" ? "success" : "pending"}>
                {MOCK_SALE.status}
              </Badge>
            </div>
            <p className="text-gray-500">Payment: {MOCK_SALE.paymentToken} • Started {formatDate(MOCK_SALE.createdAt)}</p>
          </div>
          {softCapReached && (
            <div className="flex items-center gap-2 text-green-600 bg-green-100 px-4 py-2 rounded-full">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Soft Cap Reached!</span>
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500">Progress</span>
            <span className="font-semibold text-darkAqua">
              {formatCurrency(MOCK_SALE.totalRaised)} / {formatCurrency(MOCK_SALE.hardCap)}
            </span>
          </div>
          <ProgressBar value={progress} size="lg" />
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>Soft Cap: {formatCurrency(MOCK_SALE.softCap)}</span>
            <span>{Math.round(progress)}%</span>
            <span>Hard Cap: {formatCurrency(MOCK_SALE.hardCap)}</span>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Total Raised"
          value={MOCK_SALE.totalRaised}
          prefix="$"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          label="Investors"
          value={MOCK_SALE.investors}
          trend={15}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Avg Investment"
          value={Math.round(MOCK_SALE.totalRaised / MOCK_SALE.investors)}
          prefix="$"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Days Left"
          value={45}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Phases */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-8"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-text">Sale Phases</h3>
          <Button variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />}>
            Add Phase
          </Button>
        </div>

        <div className="space-y-4">
          {MOCK_PHASES.map((phase, index) => (
            <motion.div
              key={phase.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-5 rounded-2xl border-2 transition-colors ${
                phase.status === "active"
                  ? "border-darkAqua bg-darkAqua/5"
                  : "border-darkBlack/10"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-semibold text-text">{phase.name}</h4>
                    <Badge
                      variant={
                        phase.status === "completed"
                          ? "success"
                          : phase.status === "active"
                          ? "active"
                          : "outline"
                      }
                      size="sm"
                    >
                      {phase.status}
                    </Badge>
                    {phase.whitelistOnly && (
                      <Badge variant="pending" size="sm">Whitelist</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {formatDate(phase.startTime)} - {formatDate(phase.endTime)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" leftIcon={<Edit className="h-4 w-4" />}>
                  Edit
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Price</p>
                  <p className="font-semibold">{formatCurrency(phase.pricePerToken)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Allocation</p>
                  <p className="font-semibold">{phase.allocation.toLocaleString()} tokens</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Sold</p>
                  <p className="font-semibold text-darkAqua">{phase.sold.toLocaleString()} tokens</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Limits</p>
                  <p className="font-semibold text-sm">
                    {formatCurrency(phase.minContribution)} - {formatCurrency(phase.maxContribution)}
                  </p>
                </div>
              </div>

              <ProgressBar
                value={(phase.sold / phase.allocation) * 100}
                size="sm"
                variant={phase.status === "completed" ? "success" : "default"}
              />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Recent Contributions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text">Recent Contributions</h3>
          <Link href={`/issuer/investors?sale=${MOCK_SALE.id}`}>
            <Button variant="ghost" size="sm">View All</Button>
          </Link>
        </div>
        <DataTable columns={contributionColumns} data={MOCK_CONTRIBUTIONS} />
      </motion.div>
    </IssuerDashboardLayout>
  );
}
