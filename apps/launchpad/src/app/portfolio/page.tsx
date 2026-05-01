"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingBag,
  FolderOpen,
  Clock,
  ArrowUpRight,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { useChainId } from "wagmi";
import { Spinner } from "@/components/atoms";
import { Navbar, Footer } from "@/components/organisms";
import { PortfolioTable, type HoldingItem } from "@/components/organisms";
import { VestingMiniCard } from "@/components/molecules";
import { cn, formatCurrency } from "@/lib/utils";
import { getVestingState } from "@/lib/vesting";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPortfolio,
  getTransactions,
  type PortfolioSummary,
  type Transaction,
  type Holding,
} from "@/lib/api/repositories/portfolio.repository";
import { getTxUrl } from "@/lib/contracts/addresses";
import { apiGet } from "@/lib/api/client";

interface RefundEligibleHolding {
  tokenId: string;
  tokenName: string;
  tokenSymbol: string;
}

const SIDEBAR_LINKS = [
  { href: "/projects", label: "Sales", icon: ShoppingBag },
  { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
];

const TX_LABELS: Record<string, string> = {
  investment: "Buy",
  claim: "Claim",
  redemption: "Redemption",
  refund: "Refund",
};

function TransactionRow({ tx, chainId }: { tx: Transaction; chainId: number }) {
  const isOnChain = !!tx.tx_hash && !tx.tx_hash.startsWith("otc-");
  const label = TX_LABELS[tx.type] ?? tx.type;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-black/5 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-box flex items-center justify-center shrink-0">
        <Clock className="h-3.5 w-3.5 text-darkAqua" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="text-xs text-black/50 truncate">
          {tx.token_symbol ? `${tx.token_name} (${tx.token_symbol})` : "—"}
        </p>
      </div>
      <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
        <p className="text-sm font-semibold text-text">
          {tx.type === "investment"
            ? `${parseFloat(tx.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC`
            : `${parseFloat(tx.tokens_allocated).toLocaleString()} ${tx.token_symbol}`}
        </p>
        <div className="flex items-center gap-2 text-xs text-black/50">
          <span>
            {tx.created_at
              ? new Date(tx.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "—"}
          </span>
          {isOnChain && (
            <a
              href={getTxUrl(chainId, tx.tx_hash as string) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-darkAqua hover:underline"
              title="View on BaseScan"
            >
              {tx.tx_hash!.slice(0, 6)}…{tx.tx_hash!.slice(-4)}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {tx.tx_hash?.startsWith("otc-") && <span className="text-black/40">OTC</span>}
        </div>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const pathname = usePathname();
  const chainId = useChainId();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refundEligible, setRefundEligible] = useState<RefundEligibleHolding[]>([]);
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

        const eligible: RefundEligibleHolding[] = [];
        if (data.holdings.length > 0) {
          const checks = data.holdings.map(async (h) => {
            try {
              const res = await apiGet<{ items: Array<{ status: string; refunds_activated_at?: string | null }> }>(
                `/api/v1/sales?token_id=${h.token_id}&size=1`
              );
              const sale = res.items?.[0];
              if (sale?.refunds_activated_at) {
                eligible.push({ tokenId: h.token_id, tokenName: h.token_name, tokenSymbol: h.token_symbol });
              }
            } catch {
              /* ignore */
            }
          });
          await Promise.all(checks);
        }
        setRefundEligible(eligible);
      } catch {
        setError(true);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [isAuthenticated, authLoading]);

  const rawHoldings: Holding[] = portfolio?.holdings ?? [];
  const holdings: HoldingItem[] = rawHoldings.map((h) => ({
    ...h,
    projectSlug: h.token_symbol.toLowerCase(),
  }));
  const vestedHoldings = holdings.filter((h) => h.sale_mode === "vested");
  const totalClaimable = holdings.reduce(
    (sum, h) => sum + parseFloat(h.claimable_amount ?? h.claimable ?? "0"),
    0
  );
  const totalValue = parseFloat(portfolio?.total_value_usd ?? "0");
  const totalInvested = parseFloat(portfolio?.total_invested_usd ?? "0");
  const positionCount = holdings.length;

  const showHero = !isLoading && isAuthenticated && positionCount === 0;

  return (
    <div className="min-h-screen bg-box/40 flex flex-col">
      <Navbar variant="light" />

      <div className="flex pt-16 flex-1">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-48 border-r border-black/10 bg-white flex-col p-4 sticky top-16 h-[calc(100vh-4rem)]">
          <p className="text-[10px] uppercase tracking-widest text-black/50 font-semibold mb-3 px-3">
            Buyer
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
                      : "text-black/60 hover:bg-box hover:text-text"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <main className="p-6 lg:p-8 max-w-6xl">
            {/* Header strip */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-text tracking-tight">Portfolio</h1>
              {!showHero && (
                <p className="text-sm text-black/60 mt-1.5 flex flex-wrap items-center gap-x-1.5">
                  <span>
                    {positionCount} {positionCount === 1 ? "position" : "positions"}
                  </span>
                  <span className="text-black/30">·</span>
                  <span>{formatCurrency(totalInvested)} invested</span>
                  <span className="text-black/30">·</span>
                  <span>{formatCurrency(totalValue)} current value</span>
                  {totalClaimable > 0 && (
                    <>
                      <span className="text-black/30">·</span>
                      <span className="text-darkAqua font-semibold">
                        {totalClaimable.toLocaleString(undefined, { maximumFractionDigits: 2 })} ready to claim
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>

            {/* Loading */}
            {isLoading && (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            )}

            {/* Sign-in gate */}
            {!isLoading && !isAuthenticated && !authLoading && (
              <div className="bg-white rounded-2xl border border-black/10 p-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-box flex items-center justify-center mx-auto mb-4">
                  <FolderOpen className="h-7 w-7 text-darkAqua" />
                </div>
                <h3 className="text-base font-semibold text-text mb-1">Sign in to view your portfolio</h3>
                <p className="text-sm text-black/60 mb-5">Connect your account to track holdings and purchases</p>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 btn-cta text-sm px-6 py-2.5 rounded-full"
                >
                  Sign In <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}

            {/* Empty hero (signed in, zero holdings) */}
            {showHero && (
              <div className="bg-white rounded-2xl border border-black/10 p-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-darkAqua/10 flex items-center justify-center mx-auto mb-4">
                  <FolderOpen className="h-7 w-7 text-darkAqua" />
                </div>
                <h3 className="text-base font-semibold text-text mb-1">Start your investment journey</h3>
                <p className="text-sm text-black/60 mb-5">Buy in a sale to start building your portfolio.</p>
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-1.5 btn-cta text-sm px-6 py-2.5 rounded-full"
                >
                  Browse Sales <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}

            {/* Error */}
            {!isLoading && error && (
              <div className="bg-white rounded-2xl border border-black/10 p-10 text-center">
                <p className="text-sm text-black/60">Could not load portfolio. Please try again later.</p>
              </div>
            )}

            {/* Holdings */}
            {!isLoading && !error && positionCount > 0 && (
              <section className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold text-text">Holdings</h2>
                  {positionCount > 0 && (
                    <Link
                      href="/portfolio/holdings"
                      className="text-xs font-medium text-darkAqua hover:underline"
                    >
                      View all
                    </Link>
                  )}
                </div>
                <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
                  <PortfolioTable holdings={holdings} />
                </div>
              </section>
            )}

            {/* Vesting milestones */}
            {!isLoading && vestedHoldings.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold text-text">Vesting & Lockups</h2>
                  <Link
                    href="/portfolio/vesting"
                    className="text-xs font-medium text-darkAqua hover:underline"
                  >
                    View all
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {vestedHoldings.map((h) => (
                    <VestingMiniCard
                      key={`${h.token_id}-mini`}
                      holding={h}
                    />
                  ))}
                </div>
                {/* Quick legend — helps an investor map the table to these cards */}
                <p className="text-[11px] text-black/40 mt-2.5">
                  {vestedHoldings.filter((h) => getVestingState(h) === "fully-vested").length > 0
                    ? `${vestedHoldings.filter((h) => getVestingState(h) === "fully-vested").length} fully unlocked · `
                    : ""}
                  {vestedHoldings.filter((h) => getVestingState(h) === "vesting").length} vesting ·{" "}
                  {vestedHoldings.filter((h) => getVestingState(h) === "locked").length} locked
                </p>
              </section>
            )}

            {/* Refunds available */}
            {!isLoading && refundEligible.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold text-text">Refunds Available</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {refundEligible.map((item) => (
                    <div
                      key={item.tokenId}
                      className="bg-white rounded-2xl border border-black/15 p-4 flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-xl bg-box flex items-center justify-center shrink-0">
                        <AlertTriangle className="h-4 w-4 text-text" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text truncate">
                          {item.tokenName} ({item.tokenSymbol})
                        </p>
                        <p className="text-xs text-black/60">Sale did not reach soft cap</p>
                      </div>
                      <Link
                        href={`/portfolio/claim/${item.tokenId}`}
                        className="inline-flex items-center gap-1.5 btn-cta text-xs px-4 py-2 rounded-full whitespace-nowrap"
                      >
                        Claim Refund
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recent transactions */}
            {!isLoading && positionCount > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold text-text">Recent Transactions</h2>
                  {transactions.length > 0 && (
                    <Link
                      href="/portfolio/transactions"
                      className="text-xs font-medium text-darkAqua hover:underline"
                    >
                      View all
                    </Link>
                  )}
                </div>
                <div className="bg-white rounded-2xl border border-black/10">
                  {transactions.length > 0 ? (
                    <div className="px-4 py-1">
                      {transactions.map((tx) => (
                        <TransactionRow key={tx.id} tx={tx} chainId={chainId} />
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center">
                      <p className="text-sm text-black/50">No transactions yet</p>
                      <p className="text-xs text-black/40 mt-1">Your purchase activity will appear here</p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
