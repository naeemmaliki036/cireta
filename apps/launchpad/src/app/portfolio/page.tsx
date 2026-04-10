"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingBag, FolderOpen,
  DollarSign, Coins, BarChart3, Clock, ArrowUpRight,
  Wallet, ArrowDownRight, ArrowUpFromLine,
} from "lucide-react";
import { Spinner } from "@/components/atoms";
import { Navbar, Footer } from "@/components/organisms";
import { PortfolioTable, type HoldingItem } from "@/components/organisms";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPortfolio,
  getTransactions,
  type PortfolioSummary,
  type Transaction,
} from "@/lib/api/repositories/portfolio.repository";
import { formatCurrency } from "@/lib/utils";

const SIDEBAR_LINKS = [
  { href: "/projects", label: "Sales", icon: ShoppingBag },
  { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
];

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  iconColor?: string;
  iconBg?: string;
}

function StatCard({ title, value, subtitle, icon: Icon, iconColor = "text-darkAqua", iconBg = "bg-darkAqua/10" }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-widest font-semibold text-gray-400">
          {title}
        </p>
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
      <p className="text-2xl font-bold text-text tracking-tight">{value}</p>
      {subtitle && (
        <p className="text-xs text-gray-400 mt-1.5">{subtitle}</p>
      )}
    </div>
  );
}

const TX_ICON: Record<string, React.ElementType> = {
  investment: ArrowDownRight,
  claim: ArrowUpFromLine,
  redemption: Wallet,
  refund: ArrowUpRight,
};

const TX_COLOR: Record<string, string> = {
  investment: "text-blue-600 bg-blue-50",
  claim: "text-green-600 bg-green-50",
  redemption: "text-amber-600 bg-amber-50",
  refund: "text-red-500 bg-red-50",
};

function TransactionRow({ tx }: { tx: Transaction }) {
  const Icon = TX_ICON[tx.type] ?? Clock;
  const color = TX_COLOR[tx.type] ?? "text-gray-500 bg-gray-50";
  const [iconBg, iconText] = color.split(" ");

  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-gray-50 last:border-0">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text capitalize">{tx.type}</p>
        <p className="text-xs text-gray-400 truncate">
          {tx.token_symbol ? `${tx.token_name} (${tx.token_symbol})` : "—"}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-text">
          {tx.type === "investment" ? `$${parseFloat(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${parseFloat(tx.tokens_allocated).toLocaleString()} ${tx.token_symbol}`}
        </p>
        <p className="text-xs text-gray-400">
          {tx.created_at ? new Date(tx.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
        </p>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
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
        const [data, txData] = await Promise.all([
          getPortfolio(),
          getTransactions({ limit: 5 }).catch(() => ({ transactions: [], total: 0 })),
        ]);
        setPortfolio(data);
        setTransactions(txData.transactions ?? []);
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

  const stats: StatCardProps[] = [
    {
      title: "Portfolio Value",
      value: formatCurrency(totalValue),
      subtitle: "Current estimated value",
      icon: DollarSign,
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
    },
    {
      title: "Total Invested",
      value: formatCurrency(totalInvested),
      subtitle: "Cumulative contributions",
      icon: Coins,
      iconColor: "text-blue-600",
      iconBg: "bg-blue-50",
    },
    {
      title: "Active Positions",
      value: String(holdings.length),
      subtitle: holdings.length === 1 ? "1 token held" : `${holdings.length} tokens held`,
      icon: BarChart3,
      iconColor: "text-darkAqua",
      iconBg: "bg-darkAqua/10",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <Navbar variant="light" />

      <div className="flex pt-16 flex-1">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-48 border-r border-gray-100 bg-white flex-col p-4 sticky top-16 h-[calc(100vh-4rem)]">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-3 px-3">
            Investor
          </p>
          <nav className="space-y-0.5">
            {SIDEBAR_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                    isActive
                      ? "bg-darkAqua/10 text-darkAqua"
                      : "text-gray-500 hover:bg-gray-50 hover:text-text"
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
          <main className="p-6 lg:p-8 max-w-6xl">
            {/* Page Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-text tracking-tight">Portfolio</h1>
              <p className="text-sm text-gray-400 mt-1">Track your investments and token holdings</p>
            </div>

            {/* Stats */}
            <section className="mb-8">
              {isLoading ? (
                <div className="flex justify-center py-16">
                  <Spinner />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {stats.map((stat) => (
                    <StatCard key={stat.title} {...stat} />
                  ))}
                </div>
              )}
            </section>

            {/* Holdings */}
            <section className="mb-8">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-text">Holdings</h2>
                  <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                    {holdings.length} {holdings.length === 1 ? "token" : "tokens"}
                  </span>
                </div>
                {holdings.length > 0 && (
                  <Link
                    href="/portfolio/holdings"
                    className="text-xs font-medium text-darkAqua hover:text-darkAqua/80 transition-colors"
                  >
                    View All
                  </Link>
                )}
              </div>

              {!isAuthenticated && !isLoading && !authLoading ? (
                <div className="bg-white rounded-2xl p-16 border border-gray-100 shadow-sm text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                    <FolderOpen className="h-8 w-8 text-gray-300" />
                  </div>
                  <h3 className="text-base font-semibold text-text mb-1">Sign in to view your portfolio</h3>
                  <p className="text-sm text-gray-400 mb-6">Connect your account to track holdings and investments</p>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 btn-cta text-sm px-6 py-2.5 rounded-full transition-colors"
                  >
                    Sign In <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : error ? (
                <div className="bg-white rounded-2xl p-16 border border-gray-100 shadow-sm text-center">
                  <p className="text-gray-500 text-sm">Could not load portfolio. Please try again later.</p>
                </div>
              ) : !isLoading && holdings.length === 0 ? (
                <div className="bg-white rounded-2xl p-16 border border-gray-100 shadow-sm text-center">
                  <div className="w-16 h-16 rounded-2xl bg-darkAqua/10 flex items-center justify-center mx-auto mb-4">
                    <Coins className="h-8 w-8 text-darkAqua" />
                  </div>
                  <h3 className="text-base font-semibold text-text mb-1">No holdings yet</h3>
                  <p className="text-sm text-gray-400 mb-6">Invest in a sale to start building your portfolio</p>
                  <Link
                    href="/projects"
                    className="inline-flex items-center gap-1.5 btn-cta text-sm px-6 py-2.5 rounded-full transition-colors"
                  >
                    Browse Sales <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <PortfolioTable holdings={holdings} />
                </div>
              )}
            </section>

            {/* Recent Transactions */}
            <section>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-text">Recent Transactions</h2>
                {transactions.length > 0 && (
                  <Link
                    href="/portfolio/transactions"
                    className="text-xs font-medium text-darkAqua hover:text-darkAqua/80 transition-colors"
                  >
                    View All
                  </Link>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                {transactions.length > 0 ? (
                  <div className="px-5 py-2">
                    {transactions.map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} />
                    ))}
                  </div>
                ) : (
                  <div className="py-14 text-center">
                    <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                      <Clock className="h-5 w-5 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400">No transactions yet</p>
                    <p className="text-xs text-gray-300 mt-1">Your investment activity will appear here</p>
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
