"use client";

import { useState } from "react";

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState({
    default_fee_bps: "200",
    blocked_countries: "US",
    kyc_min_level: "2",
  });
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const token = localStorage.getItem("admin_token") ?? "";
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
    try {
      await fetch(`${apiBase}/api/v1/admin/platform/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Platform Settings</h1>
      <p className="text-white/40 text-sm mb-8">Configure global platform defaults.</p>
      <div className="bg-white/5 rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm text-white/60 mb-1">Default Fee Rate (basis points)</label>
          <input
            value={settings.default_fee_bps}
            onChange={(e) => setSettings((s) => ({ ...s, default_fee_bps: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm max-w-xs"
            placeholder="200 = 2.0%"
          />
          <p className="text-white/30 text-xs mt-1">100 basis points = 1%. Applied to new issuers.</p>
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">Globally Blocked Countries (comma-separated ISO codes)</label>
          <input
            value={settings.blocked_countries}
            onChange={(e) => setSettings((s) => ({ ...s, blocked_countries: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="US, IR, KP"
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">Minimum KYC Level to Invest</label>
          <select
            value={settings.kyc_min_level}
            onChange={(e) => setSettings((s) => ({ ...s, kyc_min_level: e.target.value }))}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="1">Level 1 — Basic KYC</option>
            <option value="2">Level 2 — Enhanced KYC</option>
            <option value="3">Level 3 — Accredited</option>
          </select>
        </div>
        <button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg px-6 py-2.5 text-sm"
        >
          {saved ? "Saved ✓" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
