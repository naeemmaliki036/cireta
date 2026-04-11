"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowUpRight, RefreshCw, Receipt, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Spinner, Select } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import {
  getTransactions,
  getPortfolio,
  type Transaction,
  type TransactionFilters,
  type Holding,
} from "@/lib/api/repositories/portfolio.repository";
import { truncateAddress, formatTokenDisplay } from "@/lib/utils";
import { getTxUrl } from "@/lib/contracts/addresses";
import { useChainId } from "wagmi";

const PAGE_SIZE = 20;

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "investment", label: "Buy" },
  { value: "claim", label: "Claim" },
  { value: "redemption", label: "Redemption" },
  { value: "refund", label: "Refund" },
];

const TYPE_LABELS: Record<string, string> = {
  investment: "Buy",
  claim: "Claim",
  redemption: "Redemption",
  refund: "Refund",
};

const TYPE_STYLES: Record<string, string> = {
  investment: "bg-blue-50 text-blue-700",
  claim: "bg-green-50 text-green-700",
  redemption: "bg-purple-50 text-purple-700",
  refund: "bg-orange-50 text-orange-700",
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  claimed: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-yellow-100 text-yellow-700",
  fulfilled: "bg-green-100 text-green-700",
  refunded: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function TransactionsPage() {
  const chainId = useChainId();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState("");
  const [filterTokenId, setFilterTokenId] = useState("");

  // Token options for dropdown
  const [tokenOptions, setTokenOptions] = useState<{ value: string; label: string }[]>([]);

  // Load token options from holdings
  useEffect(() => {
    getPortfolio()
      .then((data) => {
        const opts = data.holdings.map((h: Holding) => ({
          value: h.token_id,
          label: `${h.token_symbol} - ${h.token_name}`,
        }));
        setTokenOptions([{ value: "", label: "All Tokens" }, ...opts]);
      })
      .catch(() => {
        setTokenOptions([{ value: "", label: "All Tokens" }]);
      });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: TransactionFilters = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (filterType) filters.type = filterType;
      if (filterTokenId) filters.token_id = filterTokenId;

      const data = await getTransactions(filters);
      setTxs(data.transactions);
      setTotal(data.total);
    } catch {
      setError("Failed to load transactions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page, filterType, filterTokenId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filterType, filterTokenId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "\u2014";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-text">Transaction History</h1>
          <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <p className="text-xs text-black/40 mb-6">
          Newly purchased tokens may take a few minutes to appear here.
        </p>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="w-48">
            <Select
              options={tokenOptions}
              value={filterTokenId}
              onChange={(e) => setFilterTokenId(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              options={TYPE_OPTIONS}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-black/10 p-12 text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Button variant="primary" size="sm" onClick={fetchData}>
              Retry
            </Button>
          </div>
        ) : txs.length === 0 ? (
          <div className="bg-white rounded-xl border border-black/10 p-12 text-center">
            <Receipt className="w-10 h-10 text-black/20 mx-auto mb-3" />
            <p className="text-black/40 font-medium">No transactions yet</p>
            <p className="text-black/20 text-sm mt-1">
              Your transactions will appear here after you buy.
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-black/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-black/40 text-xs uppercase">
                      <th className="text-left px-4 py-3">Date</th>
                      <th className="text-left px-4 py-3">Type</th>
                      <th className="text-left px-4 py-3">Token</th>
                      <th className="text-right px-4 py-3">Amount</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx) => (
                      <tr
                        key={tx.id}
                        className="border-b border-black/5 last:border-0 hover:bg-gray-50/50 transition-colors"
                      >
                        {/* Date */}
                        <td className="px-4 py-3">
                          <p className="text-text text-sm">{formatDate(tx.created_at)}</p>
                          <p className="text-black/30 text-xs">{formatTime(tx.created_at)}</p>
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              TYPE_STYLES[tx.type] ?? "bg-black/5 text-black/50"
                            }`}
                          >
                            {TYPE_LABELS[tx.type] ?? tx.type}
                          </span>
                        </td>

                        {/* Token */}
                        <td className="px-4 py-3">
                          {tx.token_symbol ? (
                            <span className="text-text font-medium">{tx.token_symbol}</span>
                          ) : (
                            <span className="text-black/30">{"\u2014"}</span>
                          )}
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3 text-right">
                          <p className="text-text font-semibold">
                            {Number(tx.amount).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            <span className="text-black/40 font-normal text-xs">USDC</span>
                          </p>
                          {tx.tokens_allocated &&
                            Number(tx.tokens_allocated) > 0 &&
                            tx.type === "investment" && (
                              <p className="text-black/30 text-xs">
                                {formatTokenDisplay(tx.tokens_allocated)} tokens
                              </p>
                            )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                              STATUS_STYLES[tx.status] ?? "bg-black/5 text-black/40"
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>

                        {/* Tx Hash */}
                        <td className="px-4 py-3">
                          {tx.tx_hash && !tx.tx_hash.startsWith("otc-") ? (
                            <a
                              href={getTxUrl(chainId, tx.tx_hash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-darkAqua hover:text-darkAqua/80 inline-flex items-center gap-1 text-xs font-mono"
                            >
                              {truncateAddress(tx.tx_hash, 6)}
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </a>
                          ) : tx.tx_hash?.startsWith("otc-") ? (
                            <span className="text-black/30 text-xs">OTC</span>
                          ) : (
                            <span className="text-black/30 text-xs">{"\u2014"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-black/40">
                  Showing {page * PAGE_SIZE + 1}
                  {"\u2013"}
                  {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-black/50">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
