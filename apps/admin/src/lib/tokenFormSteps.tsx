"use client";

import React from "react";
import { CheckCircle2, Upload, Rocket } from "lucide-react";
import { Input, Select, Textarea, Badge } from "@/components/atoms";

export interface TokenFormData {
  name: string;
  symbol: string;
  assetType: string;
  totalSupply: string;
  decimals: string;
  description: string;
}

const ASSET_TYPES = [
  { value: "commodity", label: "Commodity (Gold, Copper, etc.)" },
  { value: "futures", label: "Futures Contract" },
];

export const COMPLIANCE_MODULES = [
  { id: "country_allow", name: "Country Allow List", description: "Restrict to specific countries" },
  { id: "max_ownership", name: "Max Ownership", description: "Limit maximum token ownership per holder" },
  { id: "max_holders", name: "Max Holder Count", description: "Limit total number of token holders" },
  { id: "conditional_transfer", name: "Conditional Transfer", description: "Require approval for transfers" },
  { id: "time_limit", name: "Time-Based Limits", description: "Restrict transfers to certain periods" },
];

export function StepTokenDetails({
  formData, setFormData,
}: { formData: TokenFormData; setFormData: (d: TokenFormData) => void }) {
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-text mb-6">Token Details</h2>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Token Name" placeholder="e.g., West African Gold Reserve"
            value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          <Input label="Token Symbol" placeholder="e.g., WAGR"
            value={formData.symbol} onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })} />
        </div>
        <Select label="Asset Type" options={ASSET_TYPES} value={formData.assetType}
          onChange={(e) => setFormData({ ...formData, assetType: e.target.value })} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Total Supply" type="number" placeholder="e.g., 1000000"
            value={formData.totalSupply} onChange={(e) => setFormData({ ...formData, totalSupply: e.target.value })} />
          <Input label="Decimals" type="number" value={formData.decimals}
            onChange={(e) => setFormData({ ...formData, decimals: e.target.value })} />
        </div>
        <Textarea label="Description" placeholder="Describe the underlying asset..."
          value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
      </div>
    </div>
  );
}

export function StepDocumentation() {
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-text mb-6">Documentation</h2>
      <div className="space-y-6">
        <div>
          <label className="input-label">Legal Documents</label>
          <div className="border-2 border-dashed border-darkBlack/20 rounded-2xl p-8 text-center hover:border-darkAqua transition-colors cursor-pointer">
            <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
            <p className="font-medium text-text mb-1">Upload legal documents</p>
            <p className="text-sm text-gray-500">PDF, DOC up to 10MB each</p>
          </div>
        </div>
        <div>
          <label className="input-label">Proof of Reserve</label>
          <div className="border-2 border-dashed border-darkBlack/20 rounded-2xl p-8 text-center hover:border-darkAqua transition-colors cursor-pointer">
            <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
            <p className="font-medium text-text mb-1">Upload proof of reserve</p>
            <p className="text-sm text-gray-500">Audit reports, custody certificates</p>
          </div>
        </div>
        <Input label="Chainlink PoR Feed Address (Optional)" placeholder="0x..."
          helperText="Connect to Chainlink Proof of Reserve for real-time verification" />
      </div>
    </div>
  );
}

export function StepCompliance({
  selectedModules, toggleModule,
}: { selectedModules: string[]; toggleModule: (id: string) => void }) {
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-text mb-2">Compliance Modules</h2>
      <p className="text-gray-500 mb-6">Select the compliance rules for your token</p>
      <div className="space-y-4">
        {COMPLIANCE_MODULES.map((m) => (
          <button key={m.id} type="button" onClick={() => toggleModule(m.id)}
            className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-colors text-left ${
              selectedModules.includes(m.id) ? "border-darkAqua bg-darkAqua/5" : "border-darkBlack/10 hover:border-darkBlack/20"
            }`}>
            <div className="flex items-center gap-4">
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                selectedModules.includes(m.id) ? "border-darkAqua bg-darkAqua" : "border-gray-300"
              }`}>
                {selectedModules.includes(m.id) && <CheckCircle2 className="h-4 w-4 text-white" />}
              </div>
              <div>
                <p className="font-semibold text-text">{m.name}</p>
                <p className="text-sm text-gray-500">{m.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function StepDeploy({
  formData, selectedModules,
}: { formData: TokenFormData; selectedModules: string[] }) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="w-20 h-20 rounded-full bg-darkAqua/10 flex items-center justify-center mx-auto mb-6">
        <Rocket className="h-10 w-10 text-darkAqua" />
      </div>
      <h2 className="text-xl font-semibold text-text mb-2">Ready to Deploy</h2>
      <p className="text-gray-500 mb-8">Review your token configuration before deployment</p>
      <div className="bg-box rounded-2xl p-6 text-left mb-8">
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
          <div className="flex justify-between">
            <span className="text-gray-500">Network</span>
            <span className="font-medium">Base Mainnet</span>
          </div>
        </div>
      </div>
      <div className="p-4 rounded-xl bg-gold/10 border border-gold/30 text-left">
        <p className="text-sm text-gray-600">
          <strong className="text-gold">Note:</strong>{" "}
          Deploying will create the token contract on Base Mainnet.
          This action requires a transaction fee and cannot be undone.
        </p>
      </div>
    </div>
  );
}
