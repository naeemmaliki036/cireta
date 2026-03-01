"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Coins,
  Users,
  TrendingUp,
  Shield,
  Pause,
  Play,
  ExternalLink,
  Copy,
  Check,
  FileText,
  BarChart3,
} from "lucide-react";
import { useState } from "react";
import { Button, Badge, ProgressBar } from "@/components/atoms";
import { StatCard, DataTable, type Column } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency, truncateAddress } from "@/lib/utils";

const MOCK_TOKEN = {
  id: "1",
  name: "West African Gold Reserve",
  symbol: "WAGR",
  assetType: "commodity",
  contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
  totalSupply: 50000,
  decimals: 18,
  holders: 247,
  isPaused: false,
  chainId: 8453,
  deployedAt: "2024-01-15",
  pricePerToken: 100,
  currentPrice: 105,
  complianceModules: ["country_allow", "max_ownership"],
};

const MOCK_SALES = [
  {
    id: "1",
    phase: "Seed Round",
    raised: 2450000,
    target: 5000000,
    status: "active",
    startDate: "2024-02-01",
    endDate: "2024-04-15",
  },
];

const MOCK_HOLDERS = [
  { wallet: "0x1234567890abcdef1234567890abcdef12345678", balance: 5000, percentage: 10 },
  { wallet: "0xabcdef1234567890abcdef1234567890abcdef12", balance: 3500, percentage: 7 },
  { wallet: "0x9876543210fedcba9876543210fedcba98765432", balance: 2500, percentage: 5 },
];

export default function TokenDetailPage() {
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText(MOCK_TOKEN.contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const holderColumns: Column<typeof MOCK_HOLDERS[0]>[] = [
    {
      key: "wallet",
      header: "Wallet",
      render: (row) => (
        <code className="font-mono text-sm">{truncateAddress(row.wallet, 8)}</code>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      render: (row) => (
        <span className="font-semibold">{row.balance.toLocaleString()} {MOCK_TOKEN.symbol}</span>
      ),
    },
    {
      key: "percentage",
      header: "% of Supply",
      render: (row) => <span className="text-gray-500">{row.percentage}%</span>,
    },
  ];

  return (
    <IssuerDashboardLayout
      title={MOCK_TOKEN.name}
      description={`${MOCK_TOKEN.symbol} Token Management`}
      breadcrumbs={[
        { label: "Tokens", href: "/issuer/tokens" },
        { label: MOCK_TOKEN.symbol },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant={MOCK_TOKEN.isPaused ? "primary" : "dangerOutline"}
            size="sm"
            leftIcon={MOCK_TOKEN.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          >
            {MOCK_TOKEN.isPaused ? "Unpause" : "Pause"}
          </Button>
          <Link href={`/issuer/compliance?token=${MOCK_TOKEN.id}`}>
            <Button variant="outline" size="sm" leftIcon={<Shield className="h-4 w-4" />}>
              Compliance
            </Button>
          </Link>
        </div>
      }
    >
      {/* Token Info Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-darkAqua/10 flex items-center justify-center">
              <Coins className="h-8 w-8 text-darkAqua" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-text">{MOCK_TOKEN.name}</h2>
                <Badge variant={MOCK_TOKEN.isPaused ? "error" : "success"}>
                  {MOCK_TOKEN.isPaused ? "Paused" : "Active"}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="font-medium text-darkAqua">{MOCK_TOKEN.symbol}</span>
                <span>•</span>
                <Badge variant="outline" size="sm">{MOCK_TOKEN.assetType}</Badge>
                <span>•</span>
                <span>Base Mainnet</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <code className="text-sm font-mono bg-box px-3 py-2 rounded-lg">
              {truncateAddress(MOCK_TOKEN.contractAddress, 6)}
            </code>
            <button
              onClick={copyAddress}
              className="p-2 hover:bg-box rounded-lg transition-colors"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-400" />}
            </button>
            <a
              href={`https://basescan.org/address/${MOCK_TOKEN.contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-box rounded-lg transition-colors"
            >
              <ExternalLink className="h-4 w-4 text-gray-400" />
            </a>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Total Supply"
          value={MOCK_TOKEN.totalSupply}
          suffix={` ${MOCK_TOKEN.symbol}`}
          icon={<Coins className="h-5 w-5" />}
        />
        <StatCard
          label="Current Price"
          value={MOCK_TOKEN.currentPrice}
          prefix="$"
          trend={5}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Total Holders"
          value={MOCK_TOKEN.holders}
          trend={12}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Market Cap"
          value={MOCK_TOKEN.totalSupply * MOCK_TOKEN.currentPrice}
          prefix="$"
          icon={<BarChart3 className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Sales */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-text">Active Sales</h3>
            <Link href={`/issuer/sales?token=${MOCK_TOKEN.id}`}>
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </div>

          {MOCK_SALES.map((sale) => (
            <Link
              key={sale.id}
              href={`/issuer/sales/${sale.id}`}
              className="block p-4 rounded-2xl bg-box hover:bg-darkAqua/5 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-text">{sale.phase}</h4>
                <Badge variant="active" size="sm">{sale.status}</Badge>
              </div>
              <ProgressBar value={(sale.raised / sale.target) * 100} size="sm" className="mb-2" />
              <div className="flex justify-between text-sm text-gray-500">
                <span>{formatCurrency(sale.raised)} / {formatCurrency(sale.target)}</span>
                <span>{Math.round((sale.raised / sale.target) * 100)}%</span>
              </div>
            </Link>
          ))}
        </motion.div>

        {/* Compliance Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-text">Compliance Status</h3>
            <Badge variant="success" size="sm">
              <Shield className="h-3 w-3 mr-1" />
              Compliant
            </Badge>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-box">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <Check className="h-4 w-4 text-green-600" />
                </div>
                <span className="font-medium text-text">Country Allow List</span>
              </div>
              <Badge variant="success" size="sm">Active</Badge>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-box">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <Check className="h-4 w-4 text-green-600" />
                </div>
                <span className="font-medium text-text">Max Ownership (10%)</span>
              </div>
              <Badge variant="success" size="sm">Active</Badge>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-box">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-darkAqua/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-darkAqua" />
                </div>
                <span className="font-medium text-text">Proof of Reserve</span>
              </div>
              <Badge variant="active" size="sm">Connected</Badge>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Top Holders */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-8"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text">Top Holders</h3>
          <Link href={`/issuer/investors?token=${MOCK_TOKEN.id}`}>
            <Button variant="ghost" size="sm">View All</Button>
          </Link>
        </div>
        <DataTable columns={holderColumns} data={MOCK_HOLDERS} />
      </motion.div>
    </IssuerDashboardLayout>
  );
}
