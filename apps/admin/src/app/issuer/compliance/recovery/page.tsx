"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { recoverTokens } from "@/lib/api/repositories/compliance";

export default function TokenRecoveryPage() {
  const [form, setForm] = useState({
    lost_wallet: "", new_wallet: "", onchain_id: "", reason: "", token_id: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setSubmitting(true);
    setMessage("");
    try {
      await recoverTokens(
        {
          token_id: form.token_id,
          from_address: form.lost_wallet,
          amount: "0", // full recovery — amount determined server-side
          reason: form.reason,
        },
        "", // token ignored — admin uses cookie-based auth via proxy
      );
      setMessage("Token recovery submitted successfully. Tokens will be moved to the new wallet.");
      setForm({ lost_wallet: "", new_wallet: "", onchain_id: "", reason: "", token_id: "" });
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Error submitting recovery");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/issuer/compliance" className="flex items-center gap-2 text-darkBlack/40 hover:text-text text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Compliance
      </Link>
      <h1 className="text-2xl font-bold text-text mb-2">Token Recovery</h1>
      <p className="text-darkBlack/40 text-sm mb-8">
        Move tokens from a lost wallet to a new verified wallet. All actions are logged in the audit trail.
      </p>
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
        <p className="text-yellow-800 text-sm font-medium">Sensitive Action</p>
        <p className="text-yellow-700 text-sm mt-1">
          Ensure investor identity has been verified off-platform before proceeding.
          This action is irreversible and recorded on-chain.
        </p>
      </div>
      {message && (
        <p className={`text-sm mb-4 p-3 rounded-lg ${message.includes("failed") || message.includes("Error") ? "bg-red-50 text-red-600 border border-red-200" : "bg-green-50 text-green-600 border border-green-200"}`}>
          {message}
        </p>
      )}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-darkBlack/10 p-6 space-y-4">
        {[
          { key: "lost_wallet", label: "Lost Wallet Address", placeholder: "0x..." },
          { key: "new_wallet", label: "New Wallet Address", placeholder: "0x..." },
          { key: "token_id", label: "Token ID", placeholder: "UUID of the token" },
          { key: "onchain_id", label: "ONCHAINID Address (optional)", placeholder: "0x..." },
          { key: "reason", label: "Reason", placeholder: "e.g. Investor lost private key, identity verified via KYC docs" },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-sm text-darkBlack/60 mb-1">{label}</label>
            <input
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="w-full bg-box border border-darkBlack/10 rounded-lg px-3 py-2 text-text text-sm"
              required={key !== "onchain_id"}
            />
          </div>
        ))}
        {confirming && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-600 text-sm font-medium">
              Are you sure? This action is irreversible and will be recorded on-chain.
            </p>
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm"
        >
          {submitting ? "Processing..." : confirming ? "Click Again to Confirm" : "Execute Token Recovery"}
        </button>
      </form>
    </div>
  );
}
