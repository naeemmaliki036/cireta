"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { isAddress } from "viem";
import {
  recoverTokens,
  recoverFractions,
  forceTransferERC3643,
  type RecoveryResponse,
} from "@/lib/api/repositories/compliance";

type TokenType = "erc3643_recovery" | "erc3643_force" | "fraction_1155";

export default function TokenRecoveryPage() {
  const [tokenType, setTokenType] = useState<TokenType>("erc3643_recovery");
  const [form, setForm] = useState({
    from_wallet: "",
    to_wallet: "",
    token_id: "",
    sale_id: "",
    onchain_id: "",
    fraction_id: 1,
    amount: "",
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<RecoveryResponse | null>(null);

  const isFraction = tokenType === "fraction_1155";
  const isForceTransfer = tokenType === "erc3643_force";
  const isRecovery = tokenType === "erc3643_recovery";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setSubmitting(true);
    setMessage("");
    setResult(null);

    try {
      let res: RecoveryResponse;

      if (isFraction) {
        res = await recoverFractions(
          {
            sale_id: form.sale_id,
            from_address: form.from_wallet,
            to_address: form.to_wallet,
            fraction_id: form.fraction_id,
            amount: form.amount,
            reason: form.reason,
          },
          "",
        );
      } else if (isForceTransfer) {
        res = await forceTransferERC3643(
          {
            token_id: form.token_id,
            from_address: form.from_wallet,
            to_address: form.to_wallet,
            amount: form.amount,
            reason: form.reason,
          },
          "",
        );
      } else {
        await recoverTokens(
          {
            token_id: form.token_id,
            from_address: form.from_wallet,
            amount: "0",
            reason: form.reason,
          },
          "",
        );
        setMessage("Wallet recovery submitted successfully.");
        return;
      }

      setResult(res);
      setMessage(`Recovery complete. TX: ${res.tx_hash}`);
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Error submitting recovery");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        href="/issuer/compliance"
        className="flex items-center gap-2 text-black/40 hover:text-text text-sm mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Compliance
      </Link>
      <h1 className="text-2xl font-bold text-text mb-2">Token Recovery</h1>
      <p className="text-black/40 text-sm mb-6">
        Force-transfer tokens between wallets. Supports cross-user transfers for
        inheritance, court orders, and compliance actions. All actions are logged.
      </p>

      {/* Token type selector */}
      <div className="flex gap-2 mb-6">
        {[
          { value: "erc3643_recovery" as const, label: "ERC-3643 Wallet Recovery" },
          { value: "erc3643_force" as const, label: "ERC-3643 Force Transfer" },
          { value: "fraction_1155" as const, label: "Fraction (ERC-1155)" },
        ].map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTokenType(value);
              setConfirming(false);
              setMessage("");
              setResult(null);
            }}
            className={`px-3 py-1.5 text-sm rounded-lg border ${
              tokenType === value
                ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]"
                : "bg-white text-black/60 border-black/10 hover:border-black/20"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Warning banner */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
        <p className="text-yellow-800 text-sm font-medium">Sensitive Action</p>
        <p className="text-yellow-700 text-sm mt-1">
          {isFraction
            ? "This will force-transfer fraction tokens (ERC-1155) between wallets. The destination must be verified in the identity registry."
            : isForceTransfer
              ? "This will force-transfer project tokens (ERC-3643) between wallets. Wallets can belong to different users. The destination must be verified."
              : "This will move ALL tokens + frozen status from the lost wallet to the new wallet (same-user recovery)."}
        </p>
      </div>

      {message && (
        <p
          className={`text-sm mb-4 p-3 rounded-lg ${
            message.includes("Error") || message.includes("failed")
              ? "bg-red-50 text-red-600 border border-red-200"
              : "bg-green-50 text-green-600 border border-green-200"
          }`}
        >
          {message}
        </p>
      )}

      {result && (
        <div className="bg-white border border-black/10 rounded-xl p-4 mb-6 text-sm space-y-1">
          <p>
            <span className="text-black/40">From:</span> {result.from_address}
            {result.from_user_email && (
              <span className="text-black/40 ml-2">({result.from_user_email})</span>
            )}
          </p>
          <p>
            <span className="text-black/40">To:</span> {result.to_address}
            {result.to_user_email && (
              <span className="text-black/40 ml-2">({result.to_user_email})</span>
            )}
          </p>
          <p>
            <span className="text-black/40">TX:</span>{" "}
            <code className="text-xs">{result.tx_hash}</code>
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-black/10 p-6 space-y-4"
      >
        {/* From wallet */}
        <div>
          <label className="block text-sm text-black/60 mb-1">
            {isRecovery ? "Lost Wallet Address" : "From Wallet Address"}
          </label>
          <input
            value={form.from_wallet}
            onChange={(e) => setForm((f) => ({ ...f, from_wallet: e.target.value }))}
            placeholder="0x..."
            maxLength={42}
            className={`w-full bg-box border rounded-lg px-3 py-2 text-text text-sm ${
              form.from_wallet && !isAddress(form.from_wallet)
                ? "border-red-300"
                : "border-black/10"
            }`}
            required
          />
        </div>

        {/* To wallet */}
        <div>
          <label className="block text-sm text-black/60 mb-1">
            {isRecovery ? "New Wallet Address" : "To Wallet Address"}
          </label>
          <input
            value={form.to_wallet}
            onChange={(e) => setForm((f) => ({ ...f, to_wallet: e.target.value }))}
            placeholder="0x..."
            maxLength={42}
            className={`w-full bg-box border rounded-lg px-3 py-2 text-text text-sm ${
              form.to_wallet && !isAddress(form.to_wallet)
                ? "border-red-300"
                : "border-black/10"
            }`}
            required
          />
        </div>

        {/* Token ID (ERC-3643) or Sale ID (fractions) */}
        {isFraction ? (
          <div>
            <label className="block text-sm text-black/60 mb-1">Sale ID</label>
            <input
              value={form.sale_id}
              onChange={(e) => setForm((f) => ({ ...f, sale_id: e.target.value }))}
              placeholder="UUID of the sale"
              className="w-full bg-box border border-black/10 rounded-lg px-3 py-2 text-text text-sm"
              required
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm text-black/60 mb-1">Token ID</label>
            <input
              value={form.token_id}
              onChange={(e) => setForm((f) => ({ ...f, token_id: e.target.value }))}
              placeholder="UUID of the token"
              className="w-full bg-box border border-black/10 rounded-lg px-3 py-2 text-text text-sm"
              required
            />
          </div>
        )}

        {/* Fraction ID selector */}
        {isFraction && (
          <div>
            <label className="block text-sm text-black/60 mb-1">Fraction ID</label>
            <div className="flex gap-3">
              {[
                { id: 1, label: "ID 1 — USDC Path" },
                { id: 2, label: "ID 2 — OTC Path" },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, fraction_id: id }))}
                  className={`flex-1 py-2 text-sm rounded-lg border ${
                    form.fraction_id === id
                      ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]"
                      : "bg-white text-black/60 border-black/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Amount (force transfer + fractions only) */}
        {!isRecovery && (
          <div>
            <label className="block text-sm text-black/60 mb-1">
              Amount (raw token units)
            </label>
            <input
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="e.g. 1000000000000000000 for 1 token (18 decimals)"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="w-full bg-box border border-black/10 rounded-lg px-3 py-2 text-text text-sm"
              required
            />
          </div>
        )}

        {/* ONCHAINID (ERC-3643 recovery only) */}
        {isRecovery && (
          <div>
            <label className="block text-sm text-black/60 mb-1">
              ONCHAINID Address (optional — leave empty for simple whitelist mode)
            </label>
            <input
              value={form.onchain_id}
              onChange={(e) => setForm((f) => ({ ...f, onchain_id: e.target.value }))}
              placeholder="0x... or leave empty"
              maxLength={42}
              className="w-full bg-box border border-black/10 rounded-lg px-3 py-2 text-text text-sm"
            />
          </div>
        )}

        {/* Reason */}
        <div>
          <label className="block text-sm text-black/60 mb-1">Reason</label>
          <textarea
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="e.g. Court order #12345, inheritance transfer to next of kin"
            rows={3}
            className="w-full bg-box border border-black/10 rounded-lg px-3 py-2 text-text text-sm resize-none"
            required
          />
        </div>

        {/* Confirmation */}
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
          {submitting
            ? "Processing..."
            : confirming
              ? "Click Again to Confirm"
              : isFraction
                ? "Execute Fraction Recovery"
                : isForceTransfer
                  ? "Execute Force Transfer"
                  : "Execute Wallet Recovery"}
        </button>
      </form>
    </div>
  );
}
