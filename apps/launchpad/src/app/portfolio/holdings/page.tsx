"use client";

import { useState, useEffect, useCallback } from "react";
import { Coins, RefreshCw, Lock, Unlock, Send, ShieldCheck, ArrowUpFromLine } from "lucide-react";
import { Button, Spinner } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { PortfolioTable, type HoldingItem } from "@/components/organisms";
import { InfoSidebar, type InfoSidebarItem } from "@/components/molecules";
import { getPortfolio, type Holding } from "@/lib/api/repositories/portfolio.repository";

const HOLDINGS_TIPS: InfoSidebarItem[] = [
  {
    icon: Unlock,
    title: "Available vs Locked",
    body:
      "Available holdings are project tokens you can transfer. Locked holdings are fraction tokens received during a vesting period — they convert to project tokens when you claim.",
  },
  {
    icon: ArrowUpFromLine,
    title: "Claiming",
    body:
      "Once a vesting cliff is reached, the Claim button appears in the row. Claiming swaps fraction tokens for the underlying project tokens at a 1:1 ratio.",
    href: "/portfolio/vesting",
    hrefLabel: "View vesting schedules",
  },
  {
    icon: Send,
    title: "Transferring",
    body:
      "Use the Transfer page for project tokens, Fraction Transfer for fractions during vesting. Both require the recipient to be KYC-verified on the identity registry.",
    href: "/portfolio/transfer",
    hrefLabel: "Transfer a token",
  },
  {
    icon: ShieldCheck,
    title: "Need a refund?",
    body:
      "If a sale didn't reach its soft cap, a Refund banner appears on your /portfolio page. Refunds return your USDC.",
  },
];

export default function PortfolioHoldingsPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPortfolio();
      setHoldings(data.holdings);
    } catch {
      setError("Failed to load holdings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const lockedHoldings: HoldingItem[] = holdings
    .filter((h) => h.locked)
    .map((h) => ({ ...h, projectSlug: h.token_symbol.toLowerCase() }));
  const unlockedHoldings: HoldingItem[] = holdings
    .filter((h) => !h.locked)
    .map((h) => ({ ...h, projectSlug: h.token_symbol.toLowerCase() }));

  return (
    <DashboardLayout>
      <div className="py-2">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">Holdings</h1>
            {!loading && holdings.length > 0 && (
              <p className="text-sm text-black/60 mt-1.5">
                {unlockedHoldings.length} transferable · {lockedHoldings.length} locked
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-black/10 p-10 text-center">
            <p className="text-text mb-4">{error}</p>
            <Button variant="primary" size="sm" onClick={fetchData}>
              Retry
            </Button>
          </div>
        ) : holdings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black/10 p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-darkAqua/10 flex items-center justify-center mx-auto mb-4">
              <Coins className="w-7 h-7 text-darkAqua" />
            </div>
            <p className="text-base font-semibold text-text mb-1">No holdings yet</p>
            <p className="text-sm text-black/60">Buy in a token sale to see your holdings here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
            <div className="min-w-0 space-y-6">
              {unlockedHoldings.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Unlock className="w-3.5 h-3.5 text-darkAqua" />
                    <h2 className="text-sm font-semibold text-text">Available (Transferable)</h2>
                  </div>
                  <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
                    <PortfolioTable holdings={unlockedHoldings} />
                  </div>
                </section>
              )}

              {lockedHoldings.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Lock className="w-3.5 h-3.5 text-text" />
                    <h2 className="text-sm font-semibold text-text">Locked / Vesting</h2>
                    <span className="text-xs text-black/50">
                      Fraction tokens — claim after the vesting cliff to unlock.
                    </span>
                  </div>
                  <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
                    <PortfolioTable holdings={lockedHoldings} />
                  </div>
                </section>
              )}
            </div>

            <InfoSidebar items={HOLDINGS_TIPS} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
