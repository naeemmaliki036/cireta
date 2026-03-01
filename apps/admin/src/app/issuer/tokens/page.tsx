"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Button, Select } from "@/components/atoms";
import { TokenCard } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";

const MOCK_TOKENS = [
  {
    id: "1",
    name: "West African Gold Reserve",
    symbol: "WAGR",
    assetType: "commodity" as const,
    totalSupply: 50000,
    currentPrice: 105,
    holders: 247,
    isPaused: false,
    raised: 2450000,
    target: 5000000,
  },
  {
    id: "2",
    name: "Copper Futures Q2 2024",
    symbol: "CFQ2",
    assetType: "futures" as const,
    totalSupply: 25000,
    currentPrice: 45,
    holders: 89,
    isPaused: false,
    raised: 750000,
    target: 1000000,
  },
  {
    id: "3",
    name: "Silver Standard",
    symbol: "SLVR",
    assetType: "commodity" as const,
    totalSupply: 100000,
    currentPrice: 28,
    holders: 156,
    isPaused: true,
  },
];

export default function TokensListPage() {
  return (
    <IssuerDashboardLayout
      title="Tokens"
      description="Manage your tokenized assets"
      actions={
        <Link href="/issuer/tokens/new">
          <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
            Create Token
          </Button>
        </Link>
      }
    >
      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-8"
      >
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tokens..."
              className="input-field pl-12"
            />
          </div>
          <Select
            options={[
              { value: "all", label: "All Types" },
              { value: "commodity", label: "Commodity" },
              { value: "futures", label: "Futures" },
            ]}
          />
          <Select
            options={[
              { value: "all", label: "All Status" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
            ]}
          />
        </div>
      </motion.div>

      {/* Tokens Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {MOCK_TOKENS.map((token, index) => (
          <motion.div
            key={token.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <TokenCard {...token} />
          </motion.div>
        ))}

        {/* Create New Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: MOCK_TOKENS.length * 0.1 }}
        >
          <Link
            href="/issuer/tokens/new"
            className="flex flex-col items-center justify-center h-full min-h-[300px] bg-white rounded-3xl border-2 border-dashed border-darkBlack/20 hover:border-darkAqua hover:bg-darkAqua/5 transition-colors p-8"
          >
            <div className="w-16 h-16 rounded-2xl bg-darkAqua/10 flex items-center justify-center mb-4">
              <Plus className="h-8 w-8 text-darkAqua" />
            </div>
            <p className="font-semibold text-text mb-1">Create New Token</p>
            <p className="text-sm text-gray-500 text-center">
              Deploy a new ERC-3643 security token
            </p>
          </Link>
        </motion.div>
      </div>
    </IssuerDashboardLayout>
  );
}
