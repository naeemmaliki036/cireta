"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { isAddress, type Abi } from "viem";
import { useReadContract } from "wagmi";
import {
  recoverTokens,
  recoverFractions,
  forceTransferERC3643,
  type RecoveryResponse,
} from "@/lib/api/repositories/compliance";
import { getTokens, type Token } from "@/lib/api/repositories/tokens";
import { SIMPLE_IDENTITY_REGISTRY_ABI } from "@/lib/contracts/abis/simpleIdentityRegistry";

type TokenType = "erc3643_recovery" | "erc3643_force" | "fraction_1155";

const truncateAddr = (a: string): string =>
  a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

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

  // Token picker state: dropdown of issuer tokens with a "Custom address" fallback
  // for tokens not yet in the portfolio. Only the UUID is sent to the backend
  // (which enforces issuer-ownership via _verify_authorization).
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [pickerMode, setPickerMode] = useState<"select" | "custom">("select");
  const [customAddress, setCustomAddress] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getTokens(1, 100);
        if (!cancelled) {
          setTokens(res.items.filter((t) => t.contract_address));
        }
      } finally {
        if (!cancelled) setTokensLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When a custom address is typed, try to resolve it to a Token UUID — the
  // backend keys recoveries off the UUID and verifies issuer ownership through it.
  const customAddressMatch = pickerMode === "custom" && customAddress
    ? tokens.find((t) => t.contract_address?.toLowerCase() === customAddress.toLowerCase())
    : undefined;

  const customAddressIsValid = pickerMode === "custom" && isAddress(customAddress);
  const customAddressNotFound = customAddressIsValid && !customAddressMatch;

  // Keep form.token_id in sync with the picker
  useEffect(() => {
    if (pickerMode === "custom") {
      const id = customAddressMatch?.id ?? "";
      setForm((f) => (f.token_id === id ? f : { ...f, token_id: id }));
    }
  }, [pickerMode, customAddressMatch]);

  // Pre-flight KYC check for the destination wallet using platform default registry.
  // The actual on-chain call uses the per-token / per-sale registry, but the simple-mode
  // default registry is the canonical source of truth for whitelist status.
  const defaultRegistry = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS;
  const toWalletValid = form.to_wallet && isAddress(form.to_wallet);
  const { data: toIsVerified } = useReadContract({
    address: defaultRegistry as `0x${string}` | undefined,
    abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
    functionName: "isVerified",
    args: toWalletValid ? [form.to_wallet as `0x${string}`] : undefined,
    query: { enabled: !!defaultRegistry && !!toWalletValid },
  });

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
      <h1 className="text-2xl font-bold text-text mb-2">Token Recovery & Settlement Transfers</h1>
      <p className="text-black/40 text-sm mb-6">
        Force-transfer tokens or fractions between wallets. Use cases:
        OTC fraction settlement (deliver ID-2 fractions to verified buyers after off-chain payment),
        wallet recovery (lost keys), inheritance, court orders, compliance actions.
        All actions are recorded in the audit log.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 text-xs">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
          <p className="font-semibold text-emerald-900 mb-1">OTC settlement</p>
          <p className="text-emerald-800/80">Pick &ldquo;Fraction (ERC-1155)&rdquo;, fraction id 2, deliver from operator wallet to buyer.</p>
        </div>
        <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
          <p className="font-semibold text-purple-900 mb-1">Wallet recovery</p>
          <p className="text-purple-800/80">Pick &ldquo;ERC-3643 Wallet Recovery&rdquo; to move all tokens from a lost wallet to the same user&apos;s new wallet.</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
          <p className="font-semibold text-amber-900 mb-1">Compliance / court order</p>
          <p className="text-amber-800/80">Pick &ldquo;ERC-3643 Force Transfer&rdquo; for cross-user moves (sanctions, inheritance, etc).</p>
        </div>
      </div>

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
                ? "bg-darkAqua text-white border-darkAqua"
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
          {toWalletValid && defaultRegistry && (
            <div className="mt-2">
              {toIsVerified === true ? (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                  <ShieldCheck className="h-3.5 w-3.5" /> Recipient is whitelisted on the identity registry.
                </div>
              ) : toIsVerified === false ? (
                <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 px-3 py-2 rounded-lg">
                  <ShieldAlert className="h-3.5 w-3.5" /> Recipient is NOT whitelisted on the platform default registry. The transfer will revert unless they are whitelisted on the per-sale/per-token registry.
                </div>
              ) : null}
            </div>
          )}
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm text-black/60">Token</label>
              <button
                type="button"
                onClick={() => {
                  setPickerMode((m) => (m === "select" ? "custom" : "select"));
                  setForm((f) => ({ ...f, token_id: "" }));
                  setCustomAddress("");
                }}
                className="text-xs font-medium text-darkAqua hover:underline"
              >
                {pickerMode === "select" ? "Use custom address" : "Pick from list"}
              </button>
            </div>

            {pickerMode === "select" ? (
              <select
                value={form.token_id}
                onChange={(e) => setForm((f) => ({ ...f, token_id: e.target.value }))}
                className="w-full bg-box border border-black/10 rounded-lg px-3 py-2 text-text text-sm"
                required
              >
                <option value="">
                  {tokensLoading ? "Loading tokens…" : tokens.length === 0 ? "No tokens — paste an address instead" : "Select a token…"}
                </option>
                {tokens.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.symbol} — {t.name} ({truncateAddr(t.contract_address ?? "")})
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  value={customAddress}
                  onChange={(e) => setCustomAddress(e.target.value.trim())}
                  placeholder="0x… token contract address"
                  className="w-full bg-box border border-black/10 rounded-lg px-3 py-2 text-text text-sm font-mono"
                  required
                  maxLength={42}
                />
                {customAddress && !isAddress(customAddress) && (
                  <p className="text-xs text-red-600 mt-1">Not a valid EVM address.</p>
                )}
                {customAddressMatch && (
                  <p className="text-xs text-emerald-700 mt-1">
                    Matched: <strong>{customAddressMatch.symbol}</strong> — {customAddressMatch.name}
                  </p>
                )}
                {customAddressNotFound && (
                  <p className="text-xs text-amber-700 mt-1">
                    No token found with this address in your portfolio. Add it via the{" "}
                    <Link href="/issuer/tokens" className="underline font-medium">Tokens page</Link>{" "}
                    first — recovery requires an existing token record for ownership verification.
                  </p>
                )}
              </>
            )}
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
                      ? "bg-darkAqua text-white border-darkAqua"
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
