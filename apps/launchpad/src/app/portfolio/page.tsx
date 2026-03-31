"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingBag, FolderOpen,
  DollarSign, Coins, TrendingUp, Clock, ArrowUpRight,
} from "lucide-react";
import { Spinner } from "@/components/atoms";
import { Navbar, Footer } from "@/components/organisms";
import { PortfolioTable, type HoldingItem } from "@/components/organisms";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPortfolio,
  type PortfolioSummary,
} from "@/lib/api/repositories/portfolio.repository";
import { formatCurrency } from "@/lib/utils";

const SIDEBAR_LINKS = [
  { href: "/projects", label: "Sales", icon: ShoppingBag },
  { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
];

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  positive?: boolean;
}

function StatCard({ title, value, icon: Icon, positive }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[11px] uppercase tracking-wider font-medium text-gray-400">
          {title}
        </p>
        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
          <Icon className="h-4 w-4 text-darkAqua" />
        </div>
      </div>
      <p className="text-xl font-bold text-text">{value}</p>
      {positive !== undefined && (
        <p className={cn("text-xs mt-1 font-medium", positive ? "text-green-600" : "text-red-500")}>
          {positive ? "+" : "-"} vs. cost basis
        </p>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
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
  }, [isAuthenticated, authLoading]);

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

  const stats: StatCardProps[] = [
    { title: "Total Portfolio Value", value: formatCurrency(totalValue), icon: DollarSign },
    { title: "Total Invested", value: formatCurrency(totalInvested), icon: Coins },
    { title: "Unrealised P&L", value: formatCurrency(unrealizedGain), icon: TrendingUp, positive: unrealizedGain >= 0 },
    { title: "Active Positions", value: String(holdings.length), icon: Clock },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar variant="light" />

      <div className="flex pt-16 flex-1">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-44 border-r border-gray-100 flex-col p-4 sticky top-16 h-[calc(100vh-4rem)]">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 px-2">Investor</p>
          <nav className="space-y-1">
            {SIDEBAR_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive ? "bg-gray-100 text-text" : "text-gray-500 hover:bg-gray-50 hover:text-text"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <main className="p-6 max-w-5xl">
          {/* Stats */}
          <section className="mb-8">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => (
                  <StatCard key={stat.title} {...stat} />
                ))}
              </div>
            )}
          </section>

          {/* Holdings */}
          <section className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-semibold text-text">Holdings</h2>
              <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full">
                {holdings.length} tokens
              </span>
            </div>

            {!isAuthenticated && !isLoading && !authLoading ? (
              <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
                <FolderOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm mb-4">Sign in to view your portfolio</p>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 bg-darkBlack text-white text-xs font-semibold px-5 py-2 rounded-full hover:bg-darkBlack/90 transition-colors"
                >
                  Sign In <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            ) : error ? (
              <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
                <p className="text-gray-500 text-sm">Could not load portfolio. Please try again later.</p>
              </div>
            ) : !isLoading && holdings.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
                <Coins className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm mb-1">No holdings yet</p>
                <p className="text-gray-400 text-xs mb-4">Invest in a sale to start building your portfolio</p>
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-1.5 bg-darkBlack text-white text-xs font-semibold px-5 py-2 rounded-full hover:bg-darkBlack/90 transition-colors"
                >
                  Browse Sales <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <PortfolioTable holdings={holdings} />
            )}
          </section>

          {/* Recent Transactions */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-semibold text-text">Recent Transactions</h2>
            </div>
            <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
              <Clock className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No recent transactions</p>
            </div>
          </section>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
