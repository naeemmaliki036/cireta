"use client";

import { useState, useEffect } from "react";
import { parseApiDate } from "@/lib/utils";
import { Plus, Trash2, Mail, Building2, User, ShieldCheck, ShieldOff, CheckCircle2, Clock, Check, X } from "lucide-react";
import { Button } from "@/components/atoms";
import { PlatformAdminLayout } from "@/components/templates";
import {
  getWhitelist,
  addToWhitelist,
  removeFromWhitelist,
  type WhitelistEntry,
} from "@/lib/api/repositories/issuer-onboarding";

export default function WhitelistPage() {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [issuerType, setIssuerType] = useState<"individual" | "corporate">("individual");
  const [kycRequired, setKycRequired] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchEntries = async () => {
    try {
      const data = await getWhitelist();
      setEntries(data.items);
    } catch (err) {
      console.error("Whitelist fetch failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load whitelist");
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEntries(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError("");
    try {
      await addToWhitelist(email, issuerType, kycRequired);
      showToast(`${email} added to whitelist`);
      setEmail("");
      await fetchEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    try {
      await removeFromWhitelist(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      showToast(`${entry?.email || "Entry"} removed from whitelist`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  return (
    <PlatformAdminLayout
      title="Issuer Whitelist"
      description="Pre-approve emails for issuer registration"
    >
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-top-2 ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      <div className="max-w-4xl">
        {/* Add Form */}
        <div className="bg-white rounded-lg border border-zinc-100 p-6 mb-6">
          <h2 className="text-base font-semibold text-zinc-900 mb-4">Add to Whitelist</h2>
          {error && <p className="text-red-600 text-sm mb-3 p-2.5 bg-red-50 rounded-lg border border-red-100">{error}</p>}
          <form onSubmit={handleAdd} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="issuer@company.com"
                required
                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Issuer Type — pill toggle */}
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Issuer Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIssuerType("individual")}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                      issuerType === "individual"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
                    }`}
                  >
                    <User className="h-3.5 w-3.5" />
                    Individual
                    <span className="opacity-60">KYC</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssuerType("corporate")}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                      issuerType === "corporate"
                        ? "border-purple-500 bg-purple-50 text-purple-700"
                        : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Corporate
                    <span className="opacity-60">KYB</span>
                  </button>
                </div>
              </div>

              {/* KYC Required Toggle */}
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Identity Verification ({issuerType === "corporate" ? "KYB" : "KYC"})
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setKycRequired(true)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                      kycRequired
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Required
                  </button>
                  <button
                    type="button"
                    onClick={() => setKycRequired(false)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                      !kycRequired
                        ? "border-amber-500 bg-amber-50 text-amber-700"
                        : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
                    }`}
                  >
                    <ShieldOff className="h-3.5 w-3.5" />
                    Skip
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-zinc-400">
                {kycRequired
                  ? `Issuer must complete ${issuerType === "corporate" ? "KYB" : "KYC"} before deploying tokens.`
                  : "No verification required. Use for trusted partners only."}
              </p>
              <Button type="submit" variant="primary" isLoading={adding} size="sm" className="px-6">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add to Whitelist
              </Button>
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-zinc-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">Whitelisted Emails</h2>
              <p className="text-xs text-zinc-400 mt-0.5">{entries.length} {entries.length === 1 ? "entry" : "entries"}</p>
            </div>
          </div>
          {loading ? (
            <div className="p-8 text-center text-zinc-400 text-sm">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center">
              <Mail className="h-8 w-8 text-zinc-200 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">No whitelisted emails yet</p>
              <p className="text-xs text-zinc-300 mt-1">Add an email above to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between px-6 py-3 hover:bg-zinc-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      entry.registered_at ? "bg-green-50" : "bg-zinc-100"
                    }`}>
                      <Mail className={`h-3.5 w-3.5 ${entry.registered_at ? "text-green-600" : "text-zinc-400"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{entry.email}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                          entry.issuer_type === "corporate"
                            ? "bg-purple-50 text-purple-600"
                            : "bg-blue-50 text-blue-600"
                        }`}>
                          {entry.issuer_type === "corporate" ? <Building2 className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                          {entry.issuer_type === "corporate" ? "Corporate" : "Individual"}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                          entry.kyc_required
                            ? "bg-green-50 text-green-600"
                            : "bg-amber-50 text-amber-600"
                        }`}>
                          {entry.kyc_required ? <ShieldCheck className="h-2.5 w-2.5" /> : <ShieldOff className="h-2.5 w-2.5" />}
                          {entry.kyc_required ? (entry.issuer_type === "corporate" ? "KYB" : "KYC") : "No verification"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {entry.registered_at ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-2 py-1 rounded-md">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Registered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                        <Clock className="h-2.5 w-2.5" /> Pending
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-400">
                      {parseApiDate(entry.created_at).toLocaleDateString()}
                    </span>
                    {!entry.registered_at && (
                      <button
                        onClick={() => handleRemove(entry.id)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PlatformAdminLayout>
  );
}
