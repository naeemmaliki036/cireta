"use client";

import { useState } from "react";
import { Button } from "@/components/atoms";
import { getAccessToken } from "@/lib/api/client";

interface Prefs {
  email_investments: boolean;
  email_kyc: boolean;
  email_sales: boolean;
  email_dividends: boolean;
  inapp_investments: boolean;
  inapp_kyc: boolean;
  inapp_sales: boolean;
  inapp_dividends: boolean;
}

const DEFAULTS: Prefs = {
  email_investments: true, email_kyc: true, email_sales: true, email_dividends: true,
  inapp_investments: true, inapp_kyc: true, inapp_sales: true, inapp_dividends: true,
};

const CATEGORIES = [
  { key: "investments", label: "Investment updates" },
  { key: "kyc", label: "KYC status changes" },
  { key: "sales", label: "Sale announcements" },
  { key: "dividends", label: "Dividend notifications" },
] as const;

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  const toggle = (key: keyof Prefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await fetch("/api/v1/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(prefs),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Notifications</h2>
        <p className="text-white/40 text-sm">Choose how you want to be notified.</p>
      </div>
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
