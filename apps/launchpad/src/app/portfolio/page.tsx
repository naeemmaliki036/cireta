"use client";

import { motion } from "framer-motion";
import { Coins, TrendingUp, Clock, DollarSign } from "lucide-react";
import { StatCard } from "@/components/molecules";
import { PortfolioTable, type HoldingItem } from "@/components/organisms";
import { DashboardLayout } from "@/components/templates";

const MOCK_HOLDINGS: HoldingItem[] = [
  {
    id: "1",
    tokenName: "West African Gold Reserve",
    tokenSymbol: "WAGR",
    projectSlug: "west-african-gold",
    balance: 1250,
    value: 125000,
    claimable: 125,
    vestingProgress: 45,
  },
  {
    id: "2",
    tokenName: "Chilean Copper Fund",
    tokenSymbol: "CCF",
    projectSlug: "chilean-copper",
    balance: 500,
    value: 50000,
    claimable: 0,
    vestingProgress: 20,
  },
  {
    id: "3",
    tokenName: "Moroccan Steel",
    tokenSymbol: "MSTL",
    projectSlug: "moroccan-steel",
    balance: 2000,
    value: 80000,
    claimable: 500,
    vestingProgress: 75,
  },
];

const STATS = [
  {
    label: "Total Portfolio Value",
    value: 255000,
    prefix: "$",
    trend: 12.5,
    icon: <DollarSign className="h-5 w-5" />,
  },
  {
    label: "Total Invested",
    value: 200000,
    prefix: "$",
    icon: <Coins className="h-5 w-5" />,
  },
  {
    label: "Unrealized Gains",
    value: 55000,
    prefix: "$",
    trend: 27.5,
    icon: <TrendingUp className="h-5 w-5" />,
  },
  {
    label: "Claimable Tokens",
    value: 625,
    suffix: " tokens",
    icon: <Clock className="h-5 w-5" />,
  },
];

export default function PortfolioPage() {
  return (
    <DashboardLayout
      title="Portfolio"
      description="View and manage your tokenized assets"
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {STATS.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <StatCard {...stat} />
          </motion.div>
        ))}
      </div>

      {/* Holdings Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-3xl border border-darkBlack/10 overflow-hidden"
      >
        <div className="p-6 border-b border-darkBlack/5">
          <h2 className="text-xl font-semibold text-text">Your Holdings</h2>
        </div>
        <PortfolioTable holdings={MOCK_HOLDINGS} />
      </motion.div>
    </DashboardLayout>
  );
}
