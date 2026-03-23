"use client";

import { useState, useEffect } from "react";
import { ArrowUpRight } from "lucide-react";
import { DashboardLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";

interface Transaction {
  type: string;
  amount: string;
  tx_hash: string | null;
  status: string;
  created_at: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  investment: "Investment",
  redemption: "Redemption",
  claim: "Claim",
  refund: "Refund",
  dividend: "Dividend",
};

export default function TransactionsPage() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ transactions: Transaction[] }>("/api/v1/portfolio/transactions")
      .then((data) => setTxs(data.transactions ?? []))
      .catch((err) => console.error("Failed to load transactions:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-text mb-6">Transaction History</h1>
        {loading ? (
          <div className="text-darkBlack/40 text-sm">Loading...</div>
        ) : txs.length === 0 ? (
          <div className="bg-white rounded-xl border border-darkBlack/10 p-12 text-center">
            <p className="text-darkBlack/40">No transactions yet.</p>
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
                    <td className="px-4 py-3 text-text text-right">{Number(tx.amount).toLocaleString()} USDC</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        tx.status === "confirmed" || tx.status === "claimed" ? "bg-green-100 text-green-700" :
                        tx.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        "bg-darkBlack/5 text-darkBlack/40"
                      }`}>{tx.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {tx.tx_hash && !tx.tx_hash.startsWith("otc-") && (
                        <a
                          href={`https://basescan.org/tx/${tx.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-darkAqua hover:text-darkAqua/80"
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
