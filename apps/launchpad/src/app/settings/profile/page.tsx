"use client";

import { useState, useEffect } from "react";
import { Button, Input, Spinner, Badge } from "@/components/atoms";
import { me, updateProfile, type User } from "@/lib/api/repositories/auth.repository";
import { listWallets, type Wallet } from "@/lib/api/repositories/wallets.repository";

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [u, w] = await Promise.all([me(), listWallets().catch(() => [])]);
        setUser(u);
        setDisplayName(u.display_name ?? "");
        setWallets(w);
      } catch {
        setError("Failed to load profile.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile({ display_name: displayName });
      setUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (error && !user) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 text-sm mb-4">{error}</p>
        <Button variant="primary" size="sm" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Profile</h2>
        <p className="text-gray-500 text-sm">Manage your account details.</p>
      </div>

      {error && <p className="text-red-600 text-sm p-3 bg-red-50 rounded-lg border border-red-200">{error}</p>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">Email</label>
          <p className="text-gray-900 font-medium">{user.email}</p>
          <p className="text-xs text-gray-400 mt-0.5">Email cannot be changed after verification.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">Display Name</label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="max-w-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">KYC Status</label>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${
            user.kyc_status === "approved" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
            user.kyc_status === "pending" ? "bg-amber-50 text-amber-700 border border-amber-200" :
            "bg-gray-100 text-gray-600 border border-gray-200"
          }`}>
            {user.kyc_status === "approved" ? "Verified" : user.kyc_status === "pending" ? "Pending review" : user.kyc_status}
          </span>
        </div>
        <Button onClick={handleSave} disabled={saving} variant="primary" size="sm">
          {saving ? "Saving..." : saved ? "Saved \u2713" : "Save Changes"}
        </Button>
      </div>

      {/* Linked Wallets */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Linked Wallets</h3>
        {wallets.length === 0 ? (
          <p className="text-gray-400 text-sm">No wallets linked. Go to Settings &gt; Wallets to link one.</p>
        ) : (
          <div className="space-y-2">
            {wallets.map((w) => (
              <div key={w.id} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                <span className="text-gray-900 font-mono text-sm">
                  {w.address.slice(0, 6)}...{w.address.slice(-4)}
                </span>
                {w.is_primary && <Badge variant="active" size="sm">Primary</Badge>}
                {w.screening_status && (
                  <Badge variant={w.screening_status === "clear" ? "success" : "pending"} size="sm">
                    {w.screening_status}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
