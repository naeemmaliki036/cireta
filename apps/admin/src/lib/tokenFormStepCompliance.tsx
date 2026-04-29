"use client";

import React, { useState } from "react";
import { CheckCircle2, Rocket, AlertCircle } from "lucide-react";
import { Input, Badge } from "@/components/atoms";
import { CountrySelector } from "@/components/molecules/CountrySelector";
import { getChainName } from "@/lib/chain";
import type { TokenFormData } from "@/lib/tokenFormSteps";
import { COMPLIANCE_MODULES } from "@/lib/tokenFormSteps";

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
}): React.ReactElement {
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
                <span role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : m.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setExpandedId(isExpanded ? null : m.id); } }}
                  className="text-xs text-darkAqua hover:underline flex-shrink-0 cursor-pointer">
                  {isExpanded ? "Less" : "Learn more"}
                </span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pt-0 ml-8 space-y-2 border-t border-zinc-100 pt-3">
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

              {isSelected && m.id === "country_allow" && (
                <div className="px-4 pb-4 ml-8 border-t border-zinc-100 pt-3">
                  <p className="text-xs font-semibold text-zinc-700 mb-2">Configure allowed countries</p>
                  <CountrySelector selected={complianceConfig.selectedCountries}
                    onChange={(countries) => setComplianceConfig({ ...complianceConfig, selectedCountries: countries })}
                    alreadyAllowed={[]} />
                </div>
              )}

              {isSelected && m.id === "max_ownership" && (
                <div className="px-4 pb-4 ml-8 border-t border-zinc-100 pt-3">
                  <p className="text-xs font-semibold text-zinc-700 mb-2">Configure maximum ownership</p>
                  <Input label="Max tokens per holder" type="number" placeholder="e.g., 100000"
                    value={complianceConfig.maxOwnership}
                    onChange={(e) => setComplianceConfig({ ...complianceConfig, maxOwnership: e.target.value })} />
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
                  <Input label="Maximum number of holders" type="number" placeholder="e.g., 500"
                    value={complianceConfig.maxHolders}
                    onChange={(e) => setComplianceConfig({ ...complianceConfig, maxHolders: e.target.value })} />
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
}: { formData: TokenFormData; selectedModules: string[]; complianceConfig?: ComplianceConfig }): React.ReactElement {
  const isMintable = formData.tokenType === "mintable";
  const initN = Number(formData.initialMintAmount) || 0;

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
            ["Max Supply", formData.maxSupply ? Number(formData.maxSupply).toLocaleString() : "—"],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between">
              <span className="text-gray-500">{label}</span>
              <span className="font-medium">{val || "Not set"}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span className="text-gray-500">Token Type</span>
            <Badge variant={isMintable ? "default" : "active"} size="sm">
              {isMintable ? "Mintable" : "Fixed Supply"}
            </Badge>
          </div>
          {isMintable && (
            <div className="flex justify-between">
              <span className="text-gray-500">Initial Mint</span>
              <span className="font-medium">{initN > 0 ? initN.toLocaleString() : "None (0)"}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Asset Type</span>
            <Badge variant="default" size="sm">{formData.assetType}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Identity Registry</span>
            <span className="font-mono text-xs font-medium">
              {formData.identityRegistry
                ? `${formData.identityRegistry.slice(0, 6)}...${formData.identityRegistry.slice(-4)}`
                : "Platform Default"}
            </span>
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
            <span className="font-medium">{getChainName()}</span>
          </div>
        </div>
      </div>
      <div className="p-4 rounded-lg bg-darkAqua/10 border border-darkAqua/30 text-left">
        <p className="text-sm text-gray-600">
          <strong className="text-darkAqua">Note:</strong>{" "}
          Deploying will create the token contract on-chain and {isMintable
            ? (initN > 0 ? `mint ${initN.toLocaleString()} tokens to your wallet` : "mint no initial supply")
            : "mint the full supply to your wallet"}.
          This action requires a transaction fee and cannot be undone.
        </p>
      </div>
      {!formData.identityRegistry && (
        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700 flex items-start gap-2 text-left">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          No identity registry selected. Go back to step 2 and select a registry.
        </div>
      )}
    </div>
  );
}
