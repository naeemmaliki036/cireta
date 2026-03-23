"use client";

import { useState } from "react";
import { Button } from "@/components/atoms";
import { apiFetch } from "@/lib/api/client";

interface Prefs {
  email_investment_updates: boolean;
  email_kyc_status: boolean;
  email_sale_announcements: boolean;
  email_dividends: boolean;
  inapp_investment_updates: boolean;
  inapp_kyc_status: boolean;
  inapp_sale_announcements: boolean;
  inapp_dividends: boolean;
}

const DEFAULTS: Prefs = {
  email_investment_updates: true, email_kyc_status: true, email_sale_announcements: true, email_dividends: true,
  inapp_investment_updates: true, inapp_kyc_status: true, inapp_sale_announcements: true, inapp_dividends: true,
};

const CATEGORIES = [
  { key: "investment_updates", label: "Investment updates" },
  { key: "kyc_status", label: "KYC status changes" },
  { key: "sale_announcements", label: "Sale announcements" },
  { key: "dividends", label: "Dividend notifications" },
] as const;

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const toggle = (key: keyof Prefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    setError("");
    try {
      await apiFetch("/api/v1/notifications/preferences", {
        method: "PATCH",
        body: prefs,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save preferences");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Notifications</h2>
        <p className="text-white/40 text-sm">Choose how you want to be notified.</p>
      </div>
      {error && <p className="text-red-400 text-sm p-3 bg-red-500/10 rounded-lg">{error}</p>}
      <div className="bg-white/5 rounded-xl p-6">
        <div className="grid grid-cols-3 gap-4 mb-4 text-xs text-white/40 font-medium uppercase">
          <div>Category</div>
          <div className="text-center">Email</div>
          <div className="text-center">In-App</div>
        </div>
        {CATEGORIES.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-3 gap-4 py-3 border-b border-white/5 last:border-0 items-center">
            <span className="text-sm text-white">{label}</span>
            <div className="flex justify-center">
              <button
                onClick={() => toggle(`email_${key}` as keyof Prefs)}
                className={`w-10 h-5 rounded-full transition-colors ${prefs[`email_${key}` as keyof Prefs] ? "bg-blue-500" : "bg-white/20"}`}
              />
            </div>
            <div className="flex justify-center">
              <button
                onClick={() => toggle(`inapp_${key}` as keyof Prefs)}
                className={`w-10 h-5 rounded-full transition-colors ${prefs[`inapp_${key}` as keyof Prefs] ? "bg-blue-500" : "bg-white/20"}`}
              />
            </div>
          </div>
        ))}
        <p className="text-xs text-white/30 mt-4">Security alerts are always enabled and cannot be disabled.</p>
      </div>
      <Button onClick={handleSave} variant="primary" size="sm">
        {saved ? "Saved ✓" : "Save Preferences"}
      </Button>
    </div>
  );
}
