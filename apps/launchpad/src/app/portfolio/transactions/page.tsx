"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowUpRight,
  RefreshCw,
  Receipt,
  ChevronLeft,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpFromLine,
  Wallet,
  Undo2,
} from "lucide-react";
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

const TYPE_ICONS: Record<string, React.ElementType> = {
  investment: ArrowDownLeft,
  claim: ArrowUpFromLine,
  redemption: Wallet,
  refund: Undo2,
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  claimed: "Claimed",
  pending: "Pending",
  processing: "Processing",
  fulfilled: "Fulfilled",
  refunded: "Refunded",
  failed: "Failed",
  cancelled: "Cancelled",
};

export default function TransactionsPage() {
  const chainId = useChainId();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterType, setFilterType] = useState("");
  const [filterTokenId, setFilterTokenId] = useState("");

  const [tokenOptions, setTokenOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    getPortfolio()
      .then((data) => {
        const opts = data.holdings.map((h: Holding) => ({
          value: h.token_id,
          label: `${h.token_symbol} — ${h.token_name}`,
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

  useEffect(() => {
    setPage(0);
  }, [filterType, filterTokenId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <DashboardLayout
      title="Transactions"
      description="Newly purchased tokens may take a few minutes to appear here"
    >
      <div className="max-w-5xl py-2">
        {/* Header strip with inline filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="w-44">
            <Select
              options={tokenOptions}
              value={filterTokenId}
              onChange={(e) => setFilterTokenId(e.target.value)}
            />
          </div>
          <div className="w-36">
            <Select
              options={TYPE_OPTIONS}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            />
          </div>
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Content */}
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
        ) : txs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black/10 p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-box flex items-center justify-center mx-auto mb-3">
              <Receipt className="w-5 h-5 text-darkAqua" />
            </div>
            <p className="text-base font-semibold text-text">No transactions yet</p>
            <p className="text-sm text-black/50 mt-1">Your activity will appear here after you buy.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-black/50 bg-box">
                      <th className="text-left px-4 py-3 font-medium rounded-tl-2xl">Date</th>
                      <th className="text-left px-4 py-3 font-medium">Type</th>
                      <th className="hidden sm:table-cell text-left px-4 py-3 font-medium">Token</th>
                      <th className="text-right px-4 py-3 font-medium">Amount</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="hidden md:table-cell text-left px-4 py-3 font-medium rounded-tr-2xl">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx) => {
                      const Icon = TYPE_ICONS[tx.type] ?? Receipt;
                      const isOtc = tx.is_otc || tx.tx_hash?.startsWith("otc-");
                      const hasOnChainHash = tx.tx_hash && !tx.tx_hash.startsWith("otc-");
                      return (
                        <tr
                          key={tx.id}
                          className="border-t border-black/5 hover:bg-box/50 transition-colors"
                        >
                          {/* Date */}
                          <td className="px-4 py-3.5">
                            <p className="text-sm text-text">{formatDate(tx.created_at)}</p>
                            <p className="text-xs text-black/50">{formatTime(tx.created_at)}</p>
                          </td>

                          {/* Type */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-box flex items-center justify-center shrink-0">
                                <Icon className="h-3.5 w-3.5 text-darkAqua" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-text">
                                  {TYPE_LABELS[tx.type] ?? tx.type}
                                </span>
                                {isOtc && (
                                  <span className="text-[10px] uppercase tracking-wider text-black/50">
                                    OTC
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Token */}
                          <td className="hidden sm:table-cell px-4 py-3.5">
                            {tx.token_symbol ? (
                              <span className="text-sm font-medium text-text">{tx.token_symbol}</span>
                            ) : (
                              <span className="text-sm text-black/40">—</span>
                            )}
                          </td>

                          {/* Amount */}
                          <td className="px-4 py-3.5 text-right">
                            <p className="text-sm font-semibold text-text tabular-nums">
                              {Number(tx.amount).toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              })}
                              <span className="text-xs font-normal text-black/50 ml-1">USDC</span>
                            </p>
                            {tx.tokens_allocated &&
                              Number(tx.tokens_allocated) > 0 &&
                              tx.type === "investment" && (
                                <p className="text-xs text-black/50 tabular-nums">
                                  {formatTokenDisplay(tx.tokens_allocated)} tokens
                                </p>
                              )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5">
                            <span className="text-xs text-text/80 capitalize">
                              {STATUS_LABELS[tx.status] ?? tx.status}
                            </span>
                          </td>

                          {/* Tx hash */}
                          <td className="hidden md:table-cell px-4 py-3.5">
                            {hasOnChainHash ? (
                              <a
                                href={getTxUrl(chainId, tx.tx_hash as string) ?? undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-mono text-darkAqua hover:underline"
                              >
                                {truncateAddress(tx.tx_hash as string, 6)}
                                <ArrowUpRight className="w-3 h-3" />
                              </a>
                            ) : isOtc ? (
                              <span className="text-xs text-black/40">Off-chain</span>
                            ) : (
                              <span className="text-xs text-black/40">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-black/50">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs text-black/60 tabular-nums">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
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
