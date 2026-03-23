"use client";

import { useState, useEffect, use } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { apiFetch, getAccessToken } from "@/lib/api/client";

interface InvestorDetail {
  id: string;
  email: string;
  display_name: string | null;
  kyc_level: number;
  kyc_status: string;
  country_code: string | null;
  investor_type: string;
  wallet_addresses: string[];
  total_invested: string;
  is_frozen: boolean;
}

export default function InvestorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [investor, setInvestor] = useState<InvestorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    apiFetch<{ investors: InvestorDetail[] }>("/api/v1/admin/investors/", {
      token: getAccessToken() ?? undefined,
    })
      .then((data) => {
        const found = (data.investors ?? []).find((i: InvestorDetail) => i.id === id);
        setInvestor(found ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleFreeze = async () => {
    if (!investor) return;
    const wallet = investor.wallet_addresses[0];
    if (!wallet) { setActionMessage({ type: "error", text: "No wallet to freeze" }); return; }
    const confirmed = window.confirm(
      `Are you sure you want to freeze tokens for wallet ${wallet}? This action will be logged in the audit trail.`
    );
    if (!confirmed) return;
    try {
      await apiFetch("/api/v1/admin/compliance/freeze", {
        method: "POST",
        body: { address: wallet, reason: "Admin action from investor detail" },
      });
      setActionMessage({ type: "success", text: "Freeze action submitted." });
    } catch {
      setActionMessage({ type: "error", text: "Failed to freeze tokens." });
    }
  };

  if (loading) return <div className="p-8 text-white/40 text-sm">Loading...</div>;
  if (!investor) return <div className="p-8 text-white/40 text-sm">Investor not found.</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/issuer/investors" className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Investors
      </Link>
      <h1 className="text-2xl font-bold text-white mb-8">{investor.display_name ?? investor.email}</h1>
      <div className="grid grid-cols-2 gap-4 mb-8">
        {[
          { label: "Email", value: investor.email },
          { label: "KYC Status", value: `Level ${investor.kyc_level} — ${investor.kyc_status}` },
          { label: "Country", value: investor.country_code ?? "—" },
          { label: "Investor Type", value: investor.investor_type },
          { label: "Total Invested", value: `${Number(investor.total_invested).toLocaleString()} USDC` },
          { label: "Status", value: investor.is_frozen ? "🔴 Frozen" : "🟢 Active" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/5 rounded-xl p-4">
            <p className="text-white/40 text-xs mb-1">{label}</p>
            <p className="text-white font-medium text-sm">{value}</p>
          </div>
        ))}
      </div>
      <div className="bg-white/5 rounded-xl p-6 mb-6">
        <h2 className="text-white font-semibold mb-3">Linked Wallets</h2>
        {investor.wallet_addresses.length === 0 ? (
          <p className="text-white/30 text-sm">No wallets linked.</p>
        ) : (
          investor.wallet_addresses.map((addr) => (
            <p key={addr} className="text-white font-mono text-sm py-1">{addr}</p>
          ))
        )}
      </div>
      {actionMessage && (
        <div className={`rounded-lg px-4 py-3 mb-4 text-sm ${
          actionMessage.type === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
        }`}>
          {actionMessage.text}
        </div>
      )}
      <div className="flex gap-3">
        {!investor.is_frozen && (
          <button onClick={handleFreeze}
            className="bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg px-4 py-2">
            Freeze Tokens
          </button>
        )}
      </div>
    </div>
  );
}
