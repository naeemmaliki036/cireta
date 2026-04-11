"use client";

import { useState, useEffect } from "react";
import { Button, Spinner } from "@/components/atoms";
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
  { key: "investment_updates", label: "Purchase confirmations" },
  { key: "kyc_status", label: "KYC reminders" },
  { key: "sale_announcements", label: "Sale updates" },
  { key: "dividends", label: "Dividend notifications" },
] as const;

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<Prefs>("/api/v1/notifications/preferences");
        setPrefs({ ...DEFAULTS, ...data });
      } catch {
        // API may not exist yet — use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const toggle = (key: keyof Prefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      await apiFetch("/api/v1/notifications/preferences", {
        method: "PATCH",
        body: prefs,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Notifications</h2>
        <p className="text-gray-500 text-sm">Choose how you want to be notified.</p>
      </div>
      {error && <p className="text-red-600 text-sm p-3 bg-red-50 rounded-lg border border-red-200">{error}</p>}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="grid grid-cols-3 gap-4 mb-4 text-xs text-gray-400 font-medium uppercase tracking-wider">
          <div>Category</div>
          <div className="text-center">Email</div>
          <div className="text-center">In-App</div>
        </div>
        {CATEGORIES.map(({ key, label }) => {
          const emailOn = prefs[`email_${key}` as keyof Prefs];
          const inappOn = prefs[`inapp_${key}` as keyof Prefs];
          return (
            <div key={key} className="grid grid-cols-3 gap-4 py-3.5 border-b border-gray-100 last:border-0 items-center">
              <span className="text-sm text-gray-700">{label}</span>
              <div className="flex justify-center">
                <button
                  onClick={() => toggle(`email_${key}` as keyof Prefs)}
                  className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${emailOn ? "bg-emerald-500" : "bg-gray-300"}`}
                  role="switch"
                  aria-checked={emailOn}
                  aria-label={`Email ${label}`}
                >
                  <span className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${emailOn ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => toggle(`inapp_${key}` as keyof Prefs)}
                  className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${inappOn ? "bg-emerald-500" : "bg-gray-300"}`}
                  role="switch"
                  aria-checked={inappOn}
                  aria-label={`In-app ${label}`}
                >
                  <span className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${inappOn ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            </div>
          );
        })}
        <p className="text-xs text-gray-400 mt-4">Security alerts are always enabled and cannot be disabled.</p>
      </div>
      <Button onClick={handleSave} disabled={saving} variant="primary" size="sm">
        {saving ? "Saving..." : saved ? "Saved \u2713" : "Save Preferences"}
      </Button>
    </div>
  );
}
