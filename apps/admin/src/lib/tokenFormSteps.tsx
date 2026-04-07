"use client";

import React, { useState } from "react";
import { CheckCircle2, Rocket } from "lucide-react";
import { Input, Select, Textarea, Badge } from "@/components/atoms";
import { CountrySelector } from "@/components/molecules/CountrySelector";

export interface TokenFormData {
  name: string;
  symbol: string;
  assetType: string;
  totalSupply: string;
  decimals: string;
  description: string;
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

export function StepTokenDetails({
  formData, setFormData,
}: { formData: TokenFormData; setFormData: (d: TokenFormData) => void }) {
  const [dupWarning, setDupWarning] = useState<{ symbol_exists?: boolean; symbol_used_by?: string; name_exists?: boolean; name_used_by?: string } | null>(null);
  const [checkTimer, setCheckTimer] = useState<NodeJS.Timeout | null>(null);

  const checkDuplicates = (name: string, symbol: string) => {
    if (checkTimer) clearTimeout(checkTimer);
    if ((!symbol || symbol.length < 2) && (!name || name.length < 3)) { setDupWarning(null); return; }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (symbol && symbol.length >= 2) params.set("symbol", symbol);
        if (name && name.length >= 3) params.set("name", name);
        const res = await fetch(`/api/proxy/api/v1/tokens/check-symbol?${params}`);
        if (res.ok) setDupWarning(await res.json());
      } catch { /* ignore */ }
    }, 500);
    setCheckTimer(timer);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-text mb-6">Token Details</h2>
      <div className="space-y-6">
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Input label="Total Supply" type="number" placeholder="e.g., 1000000"
              value={formData.totalSupply} onChange={(e) => setFormData({ ...formData, totalSupply: e.target.value })} />
            {formData.totalSupply && Number(formData.totalSupply) > 0 && (() => {
              const n = Number(formData.totalSupply);
              const fmt = (v: number) => v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
              const word = n >= 1_000_000_000 ? `${fmt(n / 1_000_000_000)} billion`
                : n >= 1_000_000 ? `${fmt(n / 1_000_000)} million`
                : n >= 1_000 ? `${fmt(n / 1_000)} thousand`
                : "";
              const formatted = n.toLocaleString("en-US");
              return <p className="text-sm font-medium text-darkAqua mt-1.5 ml-1">{formatted}{word ? ` (${word})` : ""} tokens</p>;
            })()}
          </div>
          <Select label="Decimals (max 6)" options={[
            { value: "6", label: "6 (recommended — matches USDC)" },
            { value: "0", label: "0 (whole units only)" },
            { value: "2", label: "2 (cents precision)" },
            { value: "4", label: "4" },
          ]} value={formData.decimals}
            onChange={(e) => setFormData({ ...formData, decimals: e.target.value })} />
        </div>
        <Textarea label="Description" placeholder="Describe the underlying asset..."
          value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
      </div>
    </div>
  );
}

export interface ComplianceConfig {
  selectedCountries: Set<number>;
  maxOwnership: string;
  maxHolders: string;
}

export function StepCompliance({
  selectedModules, toggleModule, complianceConfig, setComplianceConfig,
}: {
  selectedModules: string[];
  toggleModule: (id: string) => void;
  complianceConfig: ComplianceConfig;
  setComplianceConfig: (config: ComplianceConfig) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const tagColors: Record<string, string> = {
    Regulatory: "bg-blue-100 text-blue-700",
    Risk: "bg-amber-100 text-amber-700",
    Restrictive: "bg-red-100 text-red-700",
    "Lock-up": "bg-purple-100 text-purple-700",
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-text mb-1">Compliance Modules</h2>
      <p className="text-gray-500 text-sm mb-2">These rules are enforced on-chain for every token transfer. Click to learn more.</p>
      <p className="text-xs text-darkAqua mb-6">{selectedModules.length} module{selectedModules.length !== 1 ? "s" : ""} selected</p>

      <div className="space-y-3">
        {COMPLIANCE_MODULES.map((m) => {
          const isSelected = selectedModules.includes(m.id);
          const isExpanded = expandedId === m.id;

          return (
            <div key={m.id} className={`rounded-lg border-2 transition-all overflow-hidden ${
              isSelected ? "border-darkAqua bg-darkAqua/5" : "border-zinc-200 hover:border-zinc-300"
            }`}>
              {/* Header — click to toggle selection */}
              <button type="button" onClick={() => toggleModule(m.id)}
                className="w-full flex items-center gap-3 p-4 text-left">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  isSelected ? "border-darkAqua bg-darkAqua" : "border-zinc-300"
                }`}>
                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-text">{m.name}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${tagColors[m.tag] ?? "bg-zinc-100 text-zinc-600"}`}>
                      {m.tag}
                    </span>
                    {m.recommended && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-green-100 text-green-700">Recommended</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{m.description}</p>
                </div>
                <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : m.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setExpandedId(isExpanded ? null : m.id); } }}
                  className="text-xs text-darkAqua hover:underline flex-shrink-0 cursor-pointer">
                  {isExpanded ? "Less" : "Learn more"}
                </span>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0 ml-8 space-y-2 border-t border-zinc-100 mt-0 pt-3">
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Impact</p>
                    <p className="text-xs text-zinc-600">{m.impact}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Example</p>
                    <p className="text-xs text-zinc-600 italic">{m.example}</p>
                  </div>
                </div>
              )}

              {/* Inline configuration — shown when module is selected */}
              {isSelected && m.id === "country_allow" && (
                <div className="px-4 pb-4 ml-8 border-t border-zinc-100 pt-3">
                  <p className="text-xs font-semibold text-zinc-700 mb-2">Configure allowed countries</p>
                  <CountrySelector
                    selected={complianceConfig.selectedCountries}
                    onChange={(countries) => setComplianceConfig({ ...complianceConfig, selectedCountries: countries })}
                    alreadyAllowed={[]}
                  />
                </div>
              )}

              {isSelected && m.id === "max_ownership" && (
                <div className="px-4 pb-4 ml-8 border-t border-zinc-100 pt-3">
                  <p className="text-xs font-semibold text-zinc-700 mb-2">Configure maximum ownership</p>
                  <Input
                    label="Max tokens per holder"
                    type="number"
                    placeholder="e.g., 100000"
                    value={complianceConfig.maxOwnership}
                    onChange={(e) => setComplianceConfig({ ...complianceConfig, maxOwnership: e.target.value })}
                  />
                  {complianceConfig.maxOwnership && Number(complianceConfig.maxOwnership) > 0 && (
                    <p className="text-xs text-zinc-500 mt-1">
                      No single wallet can hold more than {Number(complianceConfig.maxOwnership).toLocaleString("en-US")} tokens.
                    </p>
                  )}
                </div>
              )}

              {isSelected && m.id === "max_holders" && (
                <div className="px-4 pb-4 ml-8 border-t border-zinc-100 pt-3">
                  <p className="text-xs font-semibold text-zinc-700 mb-2">Configure maximum holder count</p>
                  <Input
                    label="Maximum number of holders"
                    type="number"
                    placeholder="e.g., 500"
                    value={complianceConfig.maxHolders}
                    onChange={(e) => setComplianceConfig({ ...complianceConfig, maxHolders: e.target.value })}
                  />
                  {complianceConfig.maxHolders && Number(complianceConfig.maxHolders) > 0 && (
                    <p className="text-xs text-zinc-500 mt-1">
                      Once {Number(complianceConfig.maxHolders).toLocaleString("en-US")} unique holders exist, new holders will be blocked.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StepDeploy({
  formData, selectedModules, complianceConfig,
}: { formData: TokenFormData; selectedModules: string[]; complianceConfig?: ComplianceConfig }) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="w-20 h-20 rounded-md bg-darkAqua/10 flex items-center justify-center mx-auto mb-6">
        <Rocket className="h-10 w-10 text-darkAqua" />
      </div>
      <h2 className="text-xl font-semibold text-text mb-2">Ready to Deploy</h2>
      <p className="text-gray-500 mb-8">Review your token configuration before deployment</p>
      <div className="bg-box rounded-lg p-6 text-left mb-8">
        <h3 className="font-semibold text-text mb-4">Token Summary</h3>
        <div className="space-y-3 text-sm">
          {[
            ["Name", formData.name],
            ["Symbol", formData.symbol],
            ["Total Supply", formData.totalSupply],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between">
              <span className="text-gray-500">{label}</span>
              <span className="font-medium">{val || "Not set"}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span className="text-gray-500">Asset Type</span>
            <Badge variant="default" size="sm">{formData.assetType}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Compliance Modules</span>
            <span className="font-medium">{selectedModules.length} selected</span>
          </div>
          {complianceConfig && selectedModules.includes("country_allow") && complianceConfig.selectedCountries.size > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500 pl-4">Allowed Countries</span>
              <span className="font-medium">{complianceConfig.selectedCountries.size} countries</span>
            </div>
          )}
          {complianceConfig && selectedModules.includes("max_ownership") && complianceConfig.maxOwnership && (
            <div className="flex justify-between">
              <span className="text-gray-500 pl-4">Max Ownership</span>
              <span className="font-medium">{Number(complianceConfig.maxOwnership).toLocaleString("en-US")} tokens/holder</span>
            </div>
          )}
          {complianceConfig && selectedModules.includes("max_holders") && complianceConfig.maxHolders && (
            <div className="flex justify-between">
              <span className="text-gray-500 pl-4">Max Holders</span>
              <span className="font-medium">{Number(complianceConfig.maxHolders).toLocaleString("en-US")} holders</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Network</span>
            <span className="font-medium">{
              typeof window !== "undefined" && parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "8453") === 84532
                ? "Base Sepolia (Testnet)"
                : "Base (Mainnet)"
            }</span>
          </div>
        </div>
      </div>
      <div className="p-4 rounded-lg bg-gold/10 border border-gold/30 text-left">
        <p className="text-sm text-gray-600">
          <strong className="text-gold">Note:</strong>{" "}
          Deploying will create the token contract on-chain.
          This action requires a transaction fee and cannot be undone.
        </p>
      </div>
    </div>
  );
}
