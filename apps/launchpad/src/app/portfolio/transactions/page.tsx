"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowUpRight, RefreshCw, Receipt } from "lucide-react";
import { Button, Spinner } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { getTransactions, type Transaction } from "@/lib/api/repositories/portfolio.repository";

const TYPE_LABELS: Record<string, string> = {
  investment: "Investment",
  redemption: "Redemption",
  claim: "Claim",
  refund: "Refund",
  dividend: "Dividend",
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  claimed: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export default function TransactionsPage() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTxs(await getTransactions());
    } catch {
      setError("Failed to load transactions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text">Transaction History</h1>
          <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-darkBlack/10 p-12 text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Button variant="primary" size="sm" onClick={fetchData}>Retry</Button>
          </div>
        ) : txs.length === 0 ? (
          <div className="bg-white rounded-xl border border-darkBlack/10 p-12 text-center">
            <Receipt className="w-10 h-10 text-darkBlack/20 mx-auto mb-3" />
            <p className="text-darkBlack/40 font-medium">No transactions yet</p>
            <p className="text-darkBlack/20 text-sm mt-1">Your on-chain transactions will appear here after you invest.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-darkBlack/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-darkBlack/10 text-darkBlack/40 text-xs uppercase">
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {txs.map((tx, i) => (
                  <tr key={i} className="border-b border-darkBlack/5 last:border-0">
                    <td className="px-4 py-3 text-darkBlack/50">
                      {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-text">{TYPE_LABELS[tx.type] ?? tx.type}</td>
                    <td className="px-4 py-3 text-text text-right font-medium">
                      {Number(tx.amount).toLocaleString()} USDC
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[tx.status] ?? "bg-darkBlack/5 text-darkBlack/40"}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {tx.tx_hash && !tx.tx_hash.startsWith("otc-") && (
                        <a
                          href={`https://basescan.org/tx/${tx.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-darkAqua hover:text-darkAqua/80 inline-flex items-center gap-1"
                          title="View on BaseScan"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
