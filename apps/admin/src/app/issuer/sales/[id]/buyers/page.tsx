"use client";

import { useEffect, useState, use } from "react";
import { ArrowLeft, RefreshCw, Users, ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button, Spinner, Badge } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { IssuerDashboardLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";

interface BuyerRow {
  wallet_address: string;
  user_email: string | null;
  is_otc: boolean;
  total_usdc_contributed: string;
  total_tokens_allocated: string;
  contribution_count: number;
  last_contribution_at: string | null;
  fractions_delivered: boolean;
}

export default function SaleBuyersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: saleId } = use(params);
  const [rows, setRows] = useState<BuyerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "onchain" | "otc" | "otc-pending">("all");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<BuyerRow[]>(`/api/v1/admin/sales/${saleId}/buyers`);
      setRows(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load buyers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [saleId]);

  const filtered = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "onchain") return !r.is_otc;
    if (filter === "otc") return r.is_otc;
    if (filter === "otc-pending") return r.is_otc && !r.fractions_delivered;
    return true;
  });

  const onchainCount = rows.filter((r) => !r.is_otc).length;
  const otcCount = rows.filter((r) => r.is_otc).length;
  const otcPendingCount = rows.filter((r) => r.is_otc && !r.fractions_delivered).length;

  return (
    <IssuerDashboardLayout
      title="Buyers — Per-Sale View"
      description="All wallets that contributed to this sale, with on-chain vs OTC attribution and delivery status."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Link href={`/issuer/sales/${saleId}`}>
            <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>Back to Sale</Button>
          </Link>
        </div>
      }
    >
      {/* Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <button onClick={() => setFilter("all")} className={`text-left rounded-lg border p-3 transition-colors ${filter === "all" ? "border-darkAqua bg-darkAqua/5" : "border-zinc-200 hover:border-zinc-300"}`}>
          <p className="text-xs text-zinc-500">All buyers</p>
          <p className="text-lg font-semibold text-text">{rows.length}</p>
        </button>
        <button onClick={() => setFilter("onchain")} className={`text-left rounded-lg border p-3 transition-colors ${filter === "onchain" ? "border-emerald-500 bg-emerald-50" : "border-zinc-200 hover:border-zinc-300"}`}>
          <p className="text-xs text-zinc-500">On-chain (USDC)</p>
          <p className="text-lg font-semibold text-text">{onchainCount}</p>
        </button>
        <button onClick={() => setFilter("otc")} className={`text-left rounded-lg border p-3 transition-colors ${filter === "otc" ? "border-amber-500 bg-amber-50" : "border-zinc-200 hover:border-zinc-300"}`}>
          <p className="text-xs text-zinc-500">OTC</p>
          <p className="text-lg font-semibold text-text">{otcCount}</p>
        </button>
        <button onClick={() => setFilter("otc-pending")} className={`text-left rounded-lg border p-3 transition-colors ${filter === "otc-pending" ? "border-red-500 bg-red-50" : "border-zinc-200 hover:border-zinc-300"}`}>
          <p className="text-xs text-zinc-500">OTC awaiting delivery</p>
          <p className={`text-lg font-semibold ${otcPendingCount > 0 ? "text-red-600" : "text-text"}`}>{otcPendingCount}</p>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-zinc-100 p-12 text-center">
          <Users className="h-10 w-10 text-zinc-200 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">No buyers match this filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-zinc-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5">Wallet</th>
                <th className="text-left px-4 py-2.5">User</th>
                <th className="text-left px-4 py-2.5">Source</th>
                <th className="text-right px-4 py-2.5">Total USDC</th>
                <th className="text-right px-4 py-2.5">Tokens</th>
                <th className="text-right px-4 py-2.5">Contribs</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.wallet_address}-${r.is_otc}`} className="border-t border-zinc-100 hover:bg-zinc-50/40">
                  <td className="px-4 py-3"><CopyableAddress address={r.wallet_address} truncate /></td>
                  <td className="px-4 py-3 text-zinc-600">{r.user_email ?? <span className="text-zinc-300">unknown</span>}</td>
                  <td className="px-4 py-3">
                    {r.is_otc ? (
                      <Badge variant="default" size="sm" className="bg-amber-100 text-amber-700">OTC</Badge>
                    ) : (
                      <Badge variant="default" size="sm" className="bg-emerald-100 text-emerald-700">On-chain</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-text">{Number(r.total_usdc_contributed).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-text">{Number(r.total_tokens_allocated).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-zinc-600">{r.contribution_count}</td>
                  <td className="px-4 py-3">
                    {r.is_otc ? (
                      r.fractions_delivered ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <ShieldCheck className="h-3.5 w-3.5" /> Delivered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700">
                          <ShieldAlert className="h-3.5 w-3.5" /> Awaiting delivery
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" /> On-chain settled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.is_otc && !r.fractions_delivered && (
                      <Link
                        href={`/issuer/compliance/recovery?to=${r.wallet_address}&fraction_id=2&sale_id=${saleId}`}
                        className="inline-flex items-center gap-1 text-xs text-darkAqua hover:underline"
                      >
                        Deliver fractions <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </IssuerDashboardLayout>
  );
}
