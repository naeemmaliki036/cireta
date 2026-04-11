"use client";

import { useState, useEffect, useCallback } from "react";
import { Coins, RefreshCw, Lock, Unlock } from "lucide-react";
import { Button, Spinner, Badge } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { getPortfolio, type Holding } from "@/lib/api/repositories/portfolio.repository";
import { formatCurrency } from "@/lib/utils";

function HoldingsTable({ rows, locked }: { rows: Holding[]; locked: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-black/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-black/40 text-xs uppercase">
            <th className="text-left px-4 py-3">Token</th>
            <th className="text-right px-4 py-3">Balance</th>
            <th className="text-right px-4 py-3">Value (USD)</th>
            <th className="text-right px-4 py-3">{locked ? "Status" : "Claimable"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={`${h.token_id}-${locked ? "l" : "u"}`} className="border-b border-black/5 last:border-0">
              <td className="px-4 py-4">
                <p className="text-text font-medium">{h.token_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-black/40 text-xs">{h.token_symbol}</span>
                  <Badge variant="outline" size="sm">{h.asset_type}</Badge>
                </div>
              </td>
              <td className="px-4 py-4 text-right font-semibold text-text">
                {Number(h.balance).toLocaleString()}
              </td>
              <td className="px-4 py-4 text-right text-text">
                {formatCurrency(parseFloat(h.value_usd))}
              </td>
              <td className="px-4 py-4 text-right">
                {locked ? (
                  <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
                    <Lock className="w-3 h-3" /> Vesting
                  </span>
                ) : parseFloat(h.claimable) > 0 ? (
                  <span className="text-green-600 font-semibold">{Number(h.claimable).toLocaleString()}</span>
                ) : (
                  <span className="text-black/30">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text">Holdings</h1>
          <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-black/10 p-12 text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Button variant="primary" size="sm" onClick={fetchData}>Retry</Button>
          </div>
        ) : holdings.length === 0 ? (
          <div className="bg-white rounded-xl border border-black/10 p-12 text-center">
            <Coins className="w-10 h-10 text-black/20 mx-auto mb-3" />
            <p className="text-black/40 font-medium">No holdings yet</p>
            <p className="text-black/20 text-sm mt-1">Buy in a token sale to see your holdings here.</p>
          </div>
        ) : (() => {
          const lockedHoldings = holdings.filter((h) => h.locked);
          const unlockedHoldings = holdings.filter((h) => !h.locked);
          return (
            <div className="space-y-8">
              {lockedHoldings.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Lock className="w-4 h-4 text-amber-600" />
                    <h2 className="text-sm font-semibold text-text">Locked / Vesting</h2>
                    <span className="text-xs text-black/40">
                      Soul-bound fraction tokens. Claim after the vesting cliff to unlock.
                    </span>
                  </div>
                  <HoldingsTable rows={lockedHoldings} locked />
                </section>
              )}

              {unlockedHoldings.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Unlock className="w-4 h-4 text-emerald-600" />
                    <h2 className="text-sm font-semibold text-text">Available (Transferable)</h2>
                  </div>
                  <HoldingsTable rows={unlockedHoldings} locked={false} />
                </section>
              )}
            </div>
          );
        })()}
      </div>
    </DashboardLayout>
  );
}
