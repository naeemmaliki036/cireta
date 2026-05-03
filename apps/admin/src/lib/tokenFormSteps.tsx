"use client";

import React, { useState } from "react";

// Split files (LOC limit compliance)
export { StepIdentityRegistry } from "@/lib/tokenFormStepIdentityRegistry";
export { StepCompliance, StepDeploy } from "@/lib/tokenFormStepCompliance";
export type { ComplianceConfig } from "@/lib/tokenFormStepCompliance";
export { StepRedemption, DEFAULT_REDEMPTION } from "@/lib/tokenFormStepRedemption";
export type { RedemptionFormData } from "@/lib/tokenFormStepRedemption";
import { Input, Select, Textarea } from "@/components/atoms";

export interface TokenFormData {
  name: string;
  symbol: string;
  assetType: string;
  /** Legacy — kept for backward compat with pages that still read it */
  totalSupply: string;
  /** Max supply cap: required, > 0 */
  maxSupply: string;
  /** Initial mint amount (mintable type only). Empty string = 0 */
  initialMintAmount: string;
  /** "mintable" | "fixed" */
  tokenType: "mintable" | "fixed";
  decimals: string;
  description: string;
  /** Chosen identity registry address */
  identityRegistry: string;
}

const ASSET_TYPES = [
  { value: "", label: "Select asset type..." },
  { value: "commodity", label: "Commodity (Gold, Copper, etc.)" },
  { value: "real_estate", label: "Real Estate" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "energy", label: "Energy & Renewables" },
  { value: "agriculture", label: "Agriculture" },
  { value: "futures", label: "Futures Contract" },
  { value: "equity", label: "Equity / Revenue Share" },
  { value: "debt", label: "Debt / Fixed Income" },
  { value: "fund", label: "Fund / Portfolio" },
  { value: "other", label: "Other" },
];

export const COMPLIANCE_MODULES = [
  {
    id: "country_allow",
    name: "Country Allow List",
    description: "Only wallets from approved countries can hold or receive tokens.",
    impact: "Transfers to non-allowed countries will be blocked on-chain.",
    example: "Allow UAE, UK, Singapore — block US, sanctioned jurisdictions.",
    recommended: true,
    tag: "Regulatory",
  },
  {
    id: "max_ownership",
    name: "Max Ownership",
    description: "Caps how many tokens a single wallet can hold.",
    impact: "Any transfer that would push a holder above the limit will revert.",
    example: "Max 100,000 tokens per wallet — prevents concentration risk.",
    recommended: true,
    tag: "Risk",
  },
  {
    id: "max_holders",
    name: "Max Holder Count",
    description: "Limits the total number of unique token holders.",
    impact: "Once the cap is reached, new holders are blocked. Existing holders can still transfer between themselves.",
    example: "Max 500 holders — useful for Reg D or private placement exemptions.",
    recommended: false,
    tag: "Regulatory",
  },
  {
    id: "conditional_transfer",
    name: "Conditional Transfer",
    description: "Both sender and receiver must be explicitly approved before each transfer.",
    impact: "More restrictive than KYC — every transfer needs pre-approval from the issuer.",
    example: "Used for highly restricted securities or inter-institutional transfers.",
    recommended: false,
    tag: "Restrictive",
  },
  {
    id: "time_limit",
    name: "Time-Based Lock",
    description: "Blocks all token transfers until a specific date.",
    impact: "No holder can transfer tokens until the lock-up period ends. Useful for post-sale lock-ups.",
    example: "6-month lock-up after sale: no transfers until October 2026.",
    recommended: false,
    tag: "Lock-up",
  },
];

function formatSupplyHint(raw: string): string {
  const n = Number(raw);
  if (!raw || n <= 0) return "";
  const fmt = (v: number): string => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
  const word = n >= 1_000_000_000
    ? `${fmt(n / 1_000_000_000)} billion`
    : n >= 1_000_000 ? `${fmt(n / 1_000_000)} million`
    : n >= 1_000 ? `${fmt(n / 1_000)} thousand`
    : "";
  return `${n.toLocaleString("en-US")}${word ? ` (${word})` : ""} tokens`;
}

export function StepTokenDetails({
  formData, setFormData,
}: { formData: TokenFormData; setFormData: (d: TokenFormData) => void }) {
  const [dupWarning, setDupWarning] = useState<{
    symbol_exists?: boolean; symbol_used_by?: string;
    name_exists?: boolean; name_used_by?: string;
  } | null>(null);
  const [checkTimer, setCheckTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const checkDuplicates = (name: string, symbol: string): void => {
    if (checkTimer) clearTimeout(checkTimer);
    if ((!symbol || symbol.length < 2) && (!name || name.length < 3)) { setDupWarning(null); return; }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (symbol && symbol.length >= 2) params.set("symbol", symbol);
        if (name && name.length >= 3) params.set("name", name);
        const res = await fetch(`/api/proxy/api/v1/tokens/check-symbol?${params}`);
        if (res.ok) setDupWarning(await res.json() as typeof dupWarning);
      } catch { /* ignore */ }
    }, 500);
    setCheckTimer(timer);
  };

  const isMintable = formData.tokenType === "mintable";
  const maxN = Number(formData.maxSupply);
  const initN = Number(formData.initialMintAmount);
  const initExceedsMax = isMintable && formData.initialMintAmount !== "" && initN > maxN && maxN > 0;

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-text mb-6">Token Details</h2>
      <div className="space-y-6">
        {/* Token type radio */}
        <div>
          <p className="text-sm font-medium text-zinc-700 mb-2">Token Type</p>
          <div className="grid grid-cols-2 gap-3">
            {(["mintable", "fixed"] as const).map((t) => (
              <button key={t} type="button"
                onClick={() => setFormData({
                  ...formData, tokenType: t,
                  ...(t === "fixed" ? { initialMintAmount: "" } : {}),
                })}
                className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all ${
                  formData.tokenType === t ? "border-darkAqua bg-darkAqua/5" : "border-zinc-200 hover:border-zinc-300"
                }`}>
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                  formData.tokenType === t ? "border-darkAqua bg-darkAqua" : "border-zinc-300"
                }`} />
                <div>
                  <p className="font-semibold text-sm text-text">
                    {t === "mintable" ? "Mintable" : "Fixed Supply"}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {t === "mintable"
                      ? "Capped total; issue more tokens later (up to max supply)."
                      : "Full supply minted at deploy, sent to your wallet. No further minting."}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Name + Symbol */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Input label="Token Name" placeholder="e.g., West African Gold Reserve"
              value={formData.name} onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                checkDuplicates(e.target.value, formData.symbol);
              }} />
            {dupWarning?.name_exists && (
              <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-600">
                  A token named &quot;{formData.name}&quot; already exists ({dupWarning.name_used_by}). You can still use this name.
                </p>
              </div>
            )}
          </div>
          <div>
            <Input label="Token Symbol" placeholder="e.g., WAGR"
              value={formData.symbol} onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setFormData({ ...formData, symbol: val });
                checkDuplicates(formData.name, val);
              }} />
            {dupWarning?.symbol_exists && (
              <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-600">
                  &quot;{formData.symbol}&quot; is already used by <strong>{dupWarning.symbol_used_by}</strong>. You can still deploy with this symbol.
                </p>
              </div>
            )}
          </div>
        </div>

        <Select label="Asset Type" options={ASSET_TYPES} value={formData.assetType}
          onChange={(e) => setFormData({ ...formData, assetType: e.target.value })} />

        {/* Supply fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Input label="Max Supply" type="number" placeholder="e.g., 1000000"
              value={formData.maxSupply} onChange={(e) => {
                const v = e.target.value;
                setFormData({
                  ...formData, maxSupply: v,
                  // keep legacy totalSupply in sync
                  totalSupply: v,
                });
              }} />
            {formatSupplyHint(formData.maxSupply) && (
              <p className="text-sm font-medium text-darkAqua mt-1.5 ml-1">{formatSupplyHint(formData.maxSupply)}</p>
            )}
          </div>
          <Select label="Decimals (max 6)" options={[
            { value: "6", label: "6 (recommended — matches USDC)" },
            { value: "0", label: "0 (whole units only)" },
            { value: "2", label: "2 (cents precision)" },
            { value: "4", label: "4" },
          ]} value={formData.decimals}
            onChange={(e) => setFormData({ ...formData, decimals: e.target.value })} />
        </div>

        {/* Initial mint amount — mintable only */}
        {isMintable && (
          <div>
            <Input
              label="Initial Mint Amount (optional)"
              type="number"
              placeholder={`e.g., 0 — up to ${formData.maxSupply || "max supply"}`}
              value={formData.initialMintAmount}
              onChange={(e) => setFormData({ ...formData, initialMintAmount: e.target.value })}
              error={initExceedsMax ? `Cannot exceed max supply (${Number(formData.maxSupply).toLocaleString()})` : undefined}
            />
            <p className="text-xs text-zinc-400 mt-1.5">
              Tokens minted to your wallet immediately at deploy. Leave blank or 0 to mint nothing at launch.
            </p>
          </div>
        )}

        <Textarea label="Description" placeholder="Describe the underlying asset..."
          value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
      </div>
    </div>
  );
}

