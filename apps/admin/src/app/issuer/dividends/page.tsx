"use client";

import { useState, useEffect } from "react";

interface Distribution {
  id: string;
  token_id: string;
  epoch_index: number;
  total_amount: string;
  created_at: string;
}

export default function DividendsPage() {
  const [form, setForm] = useState({ token_id: "", amount_usdc: "", contract_address: "" });
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") ?? "" : "";
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  const fetchDistributions = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/dividends`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setDistributions(data.distributions ?? []);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchDistributions(); }, []);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/dividends/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, amount_usdc: parseFloat(form.amount_usdc) }),
      });
      if (!res.ok) throw new Error("Failed to record deposit");
      setMessage("Dividend deposit recorded.");
      setForm({ token_id: "", amount_usdc: "", contract_address: "" });
      fetchDistributions();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-8">Dividend Management</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white/5 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Deposit Dividends</h2>
          {message && <p className={`text-sm mb-4 ${message.includes("Error") || message.includes("Failed") ? "text-red-400" : "text-green-400"}`}>{message}</p>}
          <form onSubmit={handleDeposit} className="space-y-4">
            {[
              { key: "token_id", label: "Token ID", placeholder: "UUID of the token" },
              { key: "amount_usdc", label: "Amount (USDC)", placeholder: "10000" },
              { key: "contract_address", label: "DividendDistributor Address (optional)", placeholder: "0x..." },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-sm text-white/60 mb-1">{label}</label>
                <input
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                  required={key !== "contract_address"}
                />
              </div>
            ))}
            <button type="submit" disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm">
              {submitting ? "Recording..." : "Record Deposit"}
            </button>
          </form>
        </div>
        <div className="bg-white/5 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Distribution History</h2>
          {distributions.length === 0 ? (
            <p className="text-white/30 text-sm">No distributions recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {distributions.map((d) => (
                <div key={d.id} className="border-b border-white/5 pb-3 last:border-0">
                  <p className="text-white text-sm font-medium">{Number(d.total_amount).toLocaleString()} USDC</p>
                  <p className="text-white/30 text-xs">Epoch {d.epoch_index} · {new Date(d.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
