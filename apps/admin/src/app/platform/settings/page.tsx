"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { PlatformAdminLayout } from "@/components/templates";
import { Button } from "@/components/atoms";
import { apiFetch } from "@/lib/api/client";

const RichTextEditor = dynamic(
  () => import("@/components/molecules/RichTextEditor"),
  { ssr: false }
);

const DEFAULT_OTC_TEMPLATE = `<h2>OTC & Bank Transfer Instructions</h2>
<p>This sale accepts investments via bank wire transfer and OTC allocation.</p>
<h3>Wire Transfer Details</h3>
<ul>
<li><strong>Beneficiary:</strong> Cireta Holdings Ltd</li>
<li><strong>Bank:</strong> [Bank Name]</li>
<li><strong>IBAN:</strong> [IBAN]</li>
<li><strong>SWIFT/BIC:</strong> [SWIFT Code]</li>
<li><strong>Reference:</strong> Your registered email address</li>
</ul>
<h3>Process</h3>
<ol>
<li>Complete KYC verification on the platform</li>
<li>Initiate a wire transfer with the details above</li>
<li>Email confirmation to <strong>otc@cireta.com</strong> with your transfer receipt</li>
<li>Tokens will be allocated within 2-3 business days of confirmed receipt</li>
</ol>
<h3>Minimum Investment</h3>
<p>Bank transfer minimum: <strong>$5,000</strong></p>
<h3>Large Allocations ($50,000+)</h3>
<p>For allocations over $50,000, contact our OTC desk directly for preferential pricing and dedicated support:</p>
<ul>
<li><strong>Email:</strong> otc@cireta.com</li>
<li><strong>Response time:</strong> Within 2 business hours</li>
</ul>`;

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState({
    default_fee_bps: "200",
    blocked_countries: "US",
    kyc_min_level: "2",
  });
  const [otcTemplate, setOtcTemplate] = useState(DEFAULT_OTC_TEMPLATE);
  const [saved, setSaved] = useState(false);
  const [otcSaved, setOtcSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<Record<string, string>>("/api/v1/admin/platform/settings");
        setSettings({
          default_fee_bps: data.default_fee_bps ?? "200",
          blocked_countries: data.blocked_countries ?? "US",
          kyc_min_level: data.kyc_min_level ?? "2",
        });
        if (data.otc_default_content) {
          setOtcTemplate(data.otc_default_content);
        }
      } catch {
        // Use defaults on load failure
      }
    })();
  }, []);

  const handleSave = async () => {
    setError("");
    try {
      await apiFetch("/api/v1/admin/platform/settings", {
        method: "PATCH",
        body: settings,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    }
  };

  const handleSaveOtc = async () => {
    setError("");
    try {
      await apiFetch("/api/v1/admin/platform/settings", {
        method: "PATCH",
        body: { otc_default_content: otcTemplate },
      });
      setOtcSaved(true);
      setTimeout(() => setOtcSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save OTC template");
    }
  };

  return (
    <PlatformAdminLayout
      title="Platform Settings"
      description="Configure global platform defaults"
      breadcrumbs={[{ label: "Platform" }, { label: "Settings" }]}
    >
      <div className="max-w-3xl space-y-8">
        {error && <p className="text-red-600 text-sm mb-4 p-3 bg-red-50 rounded-lg border border-red-200">{error}</p>}

        {/* General Settings */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-zinc-800">General</h2>
          <div>
            <label className="block text-sm font-medium text-zinc-600 mb-1">Default Fee Rate (basis points)</label>
            <input
              value={settings.default_fee_bps}
              onChange={(e) => setSettings((s) => ({ ...s, default_fee_bps: e.target.value }))}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 max-w-xs"
              placeholder="200 = 2.0%"
            />
            <p className="text-zinc-400 text-xs mt-1">100 basis points = 1%. Applied to new issuers.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-600 mb-1">Globally Blocked Countries (comma-separated ISO codes)</label>
            <input
              value={settings.blocked_countries}
              onChange={(e) => setSettings((s) => ({ ...s, blocked_countries: e.target.value }))}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder="US, IR, KP"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-600 mb-1">Minimum KYC Level to Invest</label>
            <select
              value={settings.kyc_min_level}
              onChange={(e) => setSettings((s) => ({ ...s, kyc_min_level: e.target.value }))}
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="1">Level 1 — Basic KYC</option>
              <option value="2">Level 2 — Enhanced KYC</option>
              <option value="3">Level 3 — Accredited</option>
            </select>
          </div>
          <Button variant="primary" onClick={handleSave}>
            {saved ? "Saved" : "Save Settings"}
          </Button>
        </div>

        {/* OTC Default Template */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-800">OTC & Bank Transfer Template</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Default content auto-loaded when an issuer enables OTC on a new sale. Issuers can customize per sale.
            </p>
          </div>
          <RichTextEditor
            content={otcTemplate}
            onChange={setOtcTemplate}
            placeholder="Enter default OTC instructions..."
          />
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={handleSaveOtc}>
              {otcSaved ? "Saved" : "Save OTC Template"}
            </Button>
            <button
              type="button"
              onClick={() => setOtcTemplate(DEFAULT_OTC_TEMPLATE)}
              className="text-sm text-zinc-500 hover:text-zinc-700 underline"
            >
              Reset to default
            </button>
          </div>
        </div>
      </div>
    </PlatformAdminLayout>
  );
}
