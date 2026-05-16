"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PackageOpen,
  RefreshCw,
  Truck,
  Banknote,
  CircleHelp,
} from "lucide-react";
import { useChainId } from "wagmi";
import { Button, Spinner, Select } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { InfoSidebar, type InfoSidebarItem } from "@/components/molecules";
import { RedemptionHistoryRow } from "@/components/molecules/RedemptionHistoryRow";
import {
  getRedemptions,
  cancelRedemption,
  type RedemptionRequest,
} from "@/lib/api/repositories/portfolio.repository";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" },
];

const TIPS: InfoSidebarItem[] = [
  {
    icon: Banknote,
    title: "Cash settlement",
    body:
      "The issuer fulfils via off-chain wire / treasury. Your tokens are held by the RedemptionManager and burned on fulfilment.",
  },
  {
    icon: Truck,
    title: "Physical delivery",
    body:
      "Pick a shipping address from your book (or add a new one). The issuer ships to that address and marks each step: processing → shipped → fulfilled.",
  },
  {
    icon: CircleHelp,
    title: "Why can't I cancel?",
    body:
      "Only pending requests are cancellable. Once the issuer marks the request as processing or beyond, cancel is locked. Reach out via support if you need to roll one back.",
  },
];

export default function PortfolioRedemptionsPage() {
  const chainId = useChainId();
  const [rows, setRows] = useState<RedemptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenFilter, setTokenFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRedemptions();
      setRows(data ?? []);
    } catch {
      setError("Failed to load redemptions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const tokenOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (r.token_symbol && !seen.has(r.token_symbol)) {
        seen.set(r.token_symbol, r.token_name || r.token_symbol);
      }
    }
    return [
      { value: "", label: "All tokens" },
      ...Array.from(seen.entries()).map(([symbol, name]) => ({
        value: symbol,
        label: name === symbol ? symbol : `${symbol} — ${name}`,
      })),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (tokenFilter && r.token_symbol !== tokenFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, tokenFilter, statusFilter]);

  const handleCancel = async (id: string) => {
    if (
      !window.confirm(
        "Cancel this redemption request? Your tokens will be returned to your wallet.",
      )
    )
      return;
    setCancellingId(id);
    try {
      await cancelRedemption(id);
      await reload();
    } catch {
      /* swallow — reload will show updated state if it succeeded server-side */
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <DashboardLayout
      title="Redemptions"
      description="Every redemption request you've made, across all your tokens"
    >
      <div className="py-2">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="w-52">
            <Select
              options={tokenOptions}
              value={tokenFilter}
              onChange={(e) => setTokenFilter(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
          </div>
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
          <div className="min-w-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size="lg" />
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-100 rounded-xl p-6 text-center text-red-700 text-sm">
                {error}
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-box border border-black/5 rounded-2xl p-10 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-darkAqua/10 flex items-center justify-center">
                  <PackageOpen className="w-7 h-7 text-darkAqua" />
                </div>
                <h3 className="text-base font-semibold text-text mb-1">
                  {rows.length === 0
                    ? "No redemptions yet"
                    : "No redemptions match those filters"}
                </h3>
                <p className="text-sm text-black/60 max-w-sm mx-auto">
                  {rows.length === 0 ? (
                    <>
                      Start one from the <strong>Holdings</strong> page (click
                      Redeem next to a holding) or from a project&apos;s Redeem
                      tab.
                    </>
                  ) : (
                    "Try clearing one of the filters above."
                  )}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 bg-white border border-black/5 rounded-2xl">
                {filtered.map((r) => (
                  <RedemptionHistoryRow
                    key={r.id}
                    redemption={r}
                    chainId={chainId}
                    onCancel={handleCancel}
                    cancelling={cancellingId === r.id}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="lg:block">
            <InfoSidebar heading="About redemptions" items={TIPS} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
