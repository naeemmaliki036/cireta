"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Coins, TrendingUp, Clock, DollarSign } from "lucide-react";
import { StatCard } from "@/components/molecules";
import { PortfolioTable, type HoldingItem } from "@/components/organisms";
import { DashboardLayout } from "@/components/templates";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPortfolio,
  type PortfolioSummary,
} from "@/lib/api/repositories/portfolio.repository";
import { formatCurrency } from "@/lib/utils";

export default function PortfolioPage() {
  const { accessToken, isAuthenticated } = useAuth();
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      setIsLoading(false);
      return;
    }
    async function load() {
      setIsLoading(true);
      try {
        const data = await getPortfolio();
        setPortfolio(data);
      } catch {
        setError(true);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [isAuthenticated, accessToken]);

  const holdings: HoldingItem[] = (portfolio?.holdings ?? []).map((h) => ({
    id: h.token_id,
    tokenName: h.token_name,
    tokenSymbol: h.token_symbol,
    projectSlug: h.token_symbol.toLowerCase(),
    balance: parseFloat(h.balance),
    value: parseFloat(h.value_usd),
    claimable: parseFloat(h.claimable),
    vestingProgress: 0,
  }));

  const totalValue = parseFloat(portfolio?.total_value_usd ?? "0");
  const totalInvested = parseFloat(portfolio?.total_invested_usd ?? "0");
  const unrealizedGain = totalValue - totalInvested;

  const stats = [
    { title: "Total Portfolio Value", value: formatCurrency(totalValue), icon: DollarSign, trend: { value: 0, positive: true } },
    { title: "Total Invested", value: formatCurrency(totalInvested), icon: Coins, trend: { value: 0, positive: true } },
    { title: "Unrealised P&L", value: formatCurrency(unrealizedGain), icon: TrendingUp, trend: { value: 0, positive: unrealizedGain >= 0 } },
    { title: "Active Positions", value: String(holdings.length), icon: Clock, trend: { value: 0, positive: true } },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-text">Portfolio</h1>
          <p className="text-gray-500 mt-1">Your tokenized asset holdings</p>
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <StatCard key={stat.title} {...stat} isLoading={isLoading} />
            ))}
          </div>
        </motion.div>

        {/* Holdings */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          {!isAuthenticated && !isLoading ? (
            <div className="bg-white rounded-3xl p-12 border border-darkBlack/10 text-center">
              <p className="text-gray-500 text-lg">Sign in to view your portfolio</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-3xl p-12 border border-darkBlack/10 text-center">
              <p className="text-gray-500">Could not load portfolio. Please try again later.</p>
            </div>
          ) : (
            <PortfolioTable holdings={holdings} isLoading={isLoading} />
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
