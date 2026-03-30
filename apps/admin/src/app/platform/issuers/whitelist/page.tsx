"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Mail, Building2, User, ShieldCheck, ShieldOff, CheckCircle2, Clock } from "lucide-react";
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

  const fetchEntries = async () => {
    try {
      const data = await getWhitelist();
      setEntries(data.items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEntries(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError("");
    try {
      await addToWhitelist(email, issuerType, kycRequired);
      setEmail("");
      await fetchEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (entryId: string) => {
    try {
      await removeFromWhitelist(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  return (
    <PlatformAdminLayout
      title="Issuer Whitelist"
      description="Pre-approve emails for issuer registration"
      breadcrumbs={[{ label: "Issuers", href: "/platform/issuers" }, { label: "Whitelist" }]}
    >
      <div className="max-w-4xl">
        {/* Add Form */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-8 mb-8">
          <h2 className="text-lg font-semibold text-zinc-900 mb-6">Add to Whitelist</h2>
          {error && <p className="text-red-600 text-sm mb-4 p-3 bg-red-50 rounded-xl border border-red-100">{error}</p>}
          <form onSubmit={handleAdd} className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="issuer@company.com"
                required
                className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Issuer Type — pill toggle */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">Issuer Type</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIssuerType("individual")}
                  className={`flex items-center gap-2.5 px-5 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    issuerType === "individual"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
                  }`}
                >
                  <User className="h-4 w-4" />
                  Individual
                  <span className="text-xs opacity-60">KYC</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIssuerType("corporate")}
                  className={`flex items-center gap-2.5 px-5 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    issuerType === "corporate"
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  Corporate
                  <span className="text-xs opacity-60">KYB</span>
                </button>
              </div>
            </div>

            {/* KYC Required Toggle */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Identity Verification ({issuerType === "corporate" ? "KYB" : "KYC"})
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setKycRequired(true)}
                  className={`flex items-center gap-2.5 px-5 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    kycRequired
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
                  }`}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Required
                </button>
                <button
                  type="button"
                  onClick={() => setKycRequired(false)}
                  className={`flex items-center gap-2.5 px-5 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    !kycRequired
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
                  }`}
                >
                  <ShieldOff className="h-4 w-4" />
                  Skip Verification
                </button>
              </div>
              <p className="text-xs text-zinc-400 mt-2">
                {kycRequired
                  ? `Issuer must complete ${issuerType === "corporate" ? "KYB (business verification)" : "KYC (identity verification)"} before they can deploy tokens.`
                  : "Issuer can start creating tokens immediately without identity verification. Use for trusted partners only."}
              </p>
            </div>

            <Button type="submit" variant="primary" isLoading={adding} className="px-8">
              <Plus className="h-4 w-4 mr-2" />
              Add to Whitelist
            </Button>
          </form>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          <div className="px-8 py-5 border-b border-zinc-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Whitelisted Emails</h2>
              <p className="text-sm text-zinc-400 mt-0.5">{entries.length} {entries.length === 1 ? "entry" : "entries"}</p>
            </div>
          </div>
          {loading ? (
            <div className="p-12 text-center text-zinc-400">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center">
              <Mail className="h-10 w-10 text-zinc-200 mx-auto mb-3" />
              <p className="text-zinc-400">No whitelisted emails yet</p>
              <p className="text-xs text-zinc-300 mt-1">Add an email above to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between px-8 py-4 hover:bg-zinc-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      entry.registered_at ? "bg-green-50" : "bg-zinc-100"
                    }`}>
                      <Mail className={`h-4 w-4 ${entry.registered_at ? "text-green-600" : "text-zinc-400"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{entry.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          entry.issuer_type === "corporate"
                            ? "bg-purple-50 text-purple-600"
                            : "bg-blue-50 text-blue-600"
                        }`}>
                          {entry.issuer_type === "corporate" ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
                          {entry.issuer_type === "corporate" ? "Corporate" : "Individual"}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          entry.kyc_required
                            ? "bg-green-50 text-green-600"
                            : "bg-amber-50 text-amber-600"
                        }`}>
                          {entry.kyc_required ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                          {entry.kyc_required ? (entry.issuer_type === "corporate" ? "KYB" : "KYC") : "No verification"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {entry.registered_at ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
                        <CheckCircle2 className="h-3 w-3" /> Registered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full">
                        <Clock className="h-3 w-3" /> Pending
                      </span>
                    )}
                    <span className="text-xs text-zinc-400">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </span>
                    {!entry.registered_at && (
                      <button
                        onClick={() => handleRemove(entry.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
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
