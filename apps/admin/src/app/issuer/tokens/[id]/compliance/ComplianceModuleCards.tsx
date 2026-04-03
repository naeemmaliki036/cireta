"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Globe, Users, Shield, Trash2, Plus, Loader2 } from "lucide-react";
import { Button, Input } from "@/components/atoms";
import {
  updateCountryAllow,
  setMaxHolderCount,
  type ComplianceModule,
} from "@/lib/api/repositories/token-compliance";

const COUNTRY_OPTIONS: { code: number; name: string }[] = [
  { code: 36, name: "Australia" },
  { code: 40, name: "Austria" },
  { code: 56, name: "Belgium" },
  { code: 76, name: "Brazil" },
  { code: 124, name: "Canada" },
  { code: 156, name: "China" },
  { code: 208, name: "Denmark" },
  { code: 246, name: "Finland" },
  { code: 250, name: "France" },
  { code: 276, name: "Germany" },
  { code: 344, name: "Hong Kong" },
  { code: 356, name: "India" },
  { code: 372, name: "Ireland" },
  { code: 380, name: "Italy" },
  { code: 392, name: "Japan" },
  { code: 410, name: "South Korea" },
  { code: 458, name: "Malaysia" },
  { code: 484, name: "Mexico" },
  { code: 528, name: "Netherlands" },
  { code: 554, name: "New Zealand" },
  { code: 578, name: "Norway" },
  { code: 616, name: "Poland" },
  { code: 620, name: "Portugal" },
  { code: 634, name: "Qatar" },
  { code: 682, name: "Saudi Arabia" },
  { code: 702, name: "Singapore" },
  { code: 710, name: "South Africa" },
  { code: 724, name: "Spain" },
  { code: 752, name: "Sweden" },
  { code: 756, name: "Switzerland" },
  { code: 784, name: "UAE" },
  { code: 826, name: "United Kingdom" },
  { code: 840, name: "United States" },
];

function countryName(code: number): string {
  return COUNTRY_OPTIONS.find((c) => c.code === code)?.name ?? `Code ${code}`;
}

function CountryAllowConfig({
  module, tokenId, onRefresh,
}: { module: ComplianceModule; tokenId: string; onRefresh: () => void }) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [selectedCountry, setSelectedCountry] = useState("");
  const allowed = module.config.allowed_countries ?? [];

  const handleAdd = async () => {
    if (!selectedCountry) return;
    setAdding(true);
    try {
      await updateCountryAllow(tokenId, {
        module_address: module.address,
        add_countries: [parseInt(selectedCountry, 10)],
        remove_countries: [],
      });
      setSelectedCountry("");
      onRefresh();
    } catch { /* toast */ }
    setAdding(false);
  };

  const handleRemove = async (code: number) => {
    setRemoving(code);
    try {
      await updateCountryAllow(tokenId, {
        module_address: module.address, add_countries: [], remove_countries: [code],
      });
      onRefresh();
    } catch { /* toast */ }
    setRemoving(null);
  };

  const available = COUNTRY_OPTIONS.filter((c) => !allowed.includes(c.code));

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-darkBlack/60">Allowed Countries ({allowed.length})</h4>
      {allowed.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {allowed.map((code) => (
            <span key={code} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)]/10 px-3 py-1 text-xs font-medium text-[var(--brand-primary)]">
              {countryName(code)}
              <button onClick={() => handleRemove(code)} disabled={removing === code} className="ml-1 hover:text-red-600 disabled:opacity-50">
                {removing === code ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-darkBlack/40">No countries allowed yet. Transfers will be blocked for all countries.</p>
      )}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-darkBlack/50 mb-1">Add Country</label>
          <select value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value)} className="w-full border border-darkBlack/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30">
            <option value="">Select a country...</option>
            {available.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
          </select>
        </div>
        <Button variant="primary" size="sm" onClick={handleAdd} disabled={adding || !selectedCountry}
          leftIcon={adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}>
          Add
        </Button>
      </div>
    </div>
  );
}

function MaxHolderConfig({
  module, tokenId, onRefresh,
}: { module: ComplianceModule; tokenId: string; onRefresh: () => void }) {
  const [maxCount, setMaxCount] = useState(String(module.config.max_holder_count ?? ""));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const count = parseInt(maxCount, 10);
    if (!count || count < 1) return;
    setSaving(true);
    try {
      await setMaxHolderCount(tokenId, { module_address: module.address, max_count: count });
      onRefresh();
    } catch { /* toast */ }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-darkBlack/60">Current Holders:</span>
        <span className="font-semibold text-text">{module.config.current_holder_count ?? 0}</span>
        <span className="text-darkBlack/60">Max:</span>
        <span className="font-semibold text-text">{module.config.max_holder_count || "Not set"}</span>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-darkBlack/50 mb-1">Set Max Holder Count</label>
          <Input type="number" min={1} value={maxCount} onChange={(e) => setMaxCount(e.target.value)} placeholder="e.g. 500" />
        </div>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !maxCount}
          leftIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
          {saving ? "Saving..." : "Set Max"}
        </Button>
      </div>
    </div>
  );
}

export function ModuleCard({
  module, tokenId, onRemove, onRefresh, removing,
}: {
  module: ComplianceModule; tokenId: string;
  onRemove: (addr: string) => void; onRefresh: () => void; removing: boolean;
}) {
  const icon = module.name === "CountryAllowModule"
    ? <Globe className="h-5 w-5 text-[var(--brand-primary)]" />
    : module.name === "MaxHolderCountModule"
    ? <Users className="h-5 w-5 text-[var(--brand-primary)]" />
    : <Shield className="h-5 w-5 text-[var(--brand-primary)]" />;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-darkBlack/10 p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10">{icon}</div>
          <div>
            <h3 className="text-sm font-semibold text-text">{module.name}</h3>
            <p className="text-xs text-darkBlack/40 font-mono">{module.address.slice(0, 6)}...{module.address.slice(-4)}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onRemove(module.address)} disabled={removing}
          leftIcon={removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-red-500" />}>
          Remove
        </Button>
      </div>
      <div className="border-t border-darkBlack/5 pt-4">
        {module.name === "CountryAllowModule" && <CountryAllowConfig module={module} tokenId={tokenId} onRefresh={onRefresh} />}
        {module.name === "MaxHolderCountModule" && <MaxHolderConfig module={module} tokenId={tokenId} onRefresh={onRefresh} />}
        {module.name !== "CountryAllowModule" && module.name !== "MaxHolderCountModule" && (
          <p className="text-xs text-darkBlack/40">No configuration UI available for this module type.</p>
        )}
      </div>
    </motion.div>
  );
}
