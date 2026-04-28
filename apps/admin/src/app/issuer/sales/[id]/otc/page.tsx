"use client";

import { useState, useEffect, use } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";

interface OTCRecord {
  id: string;
  wallet_address: string;
  tokens_allocated: string;
  otc_reference: string;
  created_at: string;
}

export default function OTCPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [form, setForm] = useState({ investor_wallet: "", token_amount: "", payment_reference: "", notes: "" });
  const [records, setRecords] = useState<OTCRecord[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchRecords = async () => {
    try {
      const data = await apiFetch<{ items: OTCRecord[] }>(`/api/v1/sales/${id}/contributions?is_otc=true`);
      setRecords(data.items ?? []);
    } catch {
      setRecords([]);
    }
  };

  useEffect(() => { fetchRecords(); }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiFetch(`/api/v1/sales/${id}/otc`, {
        method: "POST",
        body: { ...form, token_amount: form.token_amount },
      });
      setSuccess("OTC allocation recorded successfully.");
      setForm({ investor_wallet: "", token_amount: "", payment_reference: "", notes: "" });
      fetchRecords();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href={`/issuer/sales/${id}`} className="flex items-center gap-2 text-black/40 hover:text-text text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Sale
      </Link>
      <h1 className="text-2xl font-bold text-text mb-2">OTC Allocation</h1>
      <p className="text-sm text-black/50 mb-6">
        Record off-chain bank/wire payments. After recording the allocation here, deliver fraction tokens
        on-chain via the <Link href="/issuer/compliance/recovery" className="text-darkAqua hover:underline">Recovery & Settlement</Link> page (Fraction 1155, ID 2).
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg border border-black/10 p-6">
          <h2 className="text-text font-semibold mb-4">New OTC Allocation</h2>
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          {success && <p className="text-green-600 text-sm mb-4">{success}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { key: "investor_wallet", label: "Buyer Wallet Address", placeholder: "0x..." },
              { key: "token_amount", label: "Token Amount", placeholder: "10000" },
              { key: "payment_reference", label: "Payment Reference", placeholder: "Wire ref / bank transfer ID" },
              { key: "notes", label: "Notes (optional)", placeholder: "Additional notes" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-sm text-black/60 mb-1">{label}</label>
                <input
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-box border border-black/10 rounded-lg px-3 py-2 text-text text-sm"
                  required={key !== "notes"}
                />
              </div>
            ))}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-darkAqua hover:bg-darkAqua/90 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm"
            >
              {submitting ? "Recording..." : "Record OTC Allocation"}
            </button>
          </form>
        </div>
        <div className="bg-white rounded-lg border border-black/10 p-6">
          <h2 className="text-text font-semibold mb-4">OTC History</h2>
          {records.length === 0 ? (
            <p className="text-black/30 text-sm">No OTC allocations for this sale yet.</p>
          ) : (
            <div className="space-y-3">
              {records.map((r) => (
                <div key={r.id} className="border-b border-black/5 pb-3 last:border-0">
                  <CopyableAddress address={r.wallet_address} truncate className="text-text text-sm" />
                  <p className="text-black/40 text-xs">{r.tokens_allocated} tokens · Ref: {r.otc_reference}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
