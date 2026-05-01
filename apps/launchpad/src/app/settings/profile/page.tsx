"use client";

import { useState, useEffect } from "react";
import { Button, Input, Spinner, Badge } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
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
        <p className="text-sm text-text mb-4">{error}</p>
        <Button variant="primary" size="sm" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text mb-0.5">Profile</h2>
        <p className="text-sm text-black/60">Manage your account details.</p>
      </div>

      {error && (
        <p className="text-sm text-text p-3 bg-box rounded-xl border border-black/10">{error}</p>
      )}

      <div className="bg-white rounded-2xl border border-black/10 p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-text mb-1 uppercase tracking-wider">Email</label>
          <p className="text-sm font-medium text-text">{user.email}</p>
          <p className="text-xs text-black/40 mt-0.5">Email cannot be changed after verification.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-text mb-1 uppercase tracking-wider">Display Name</label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="max-w-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-text mb-1 uppercase tracking-wider">KYC Status</label>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${
            user.kyc_status === "approved"
              ? "bg-darkAqua/10 text-darkAqua border border-darkAqua/20"
              : user.kyc_status === "pending"
              ? "bg-box text-darkAqua border border-black/10"
              : "bg-box text-black/60 border border-black/10"
          }`}>
            {user.kyc_status === "approved" ? "Verified" : user.kyc_status === "pending" ? "Pending review" : user.kyc_status}
          </span>
        </div>
        <Button onClick={handleSave} disabled={saving} variant="primary" size="sm">
          {saving ? "Saving..." : saved ? "Saved ✓" : "Save Changes"}
        </Button>
      </div>

      {/* Linked Wallets */}
      <div className="bg-white rounded-2xl border border-black/10 p-6">
        <h3 className="text-sm font-semibold text-text mb-3">Linked Wallets</h3>
        {wallets.length === 0 ? (
          <p className="text-sm text-black/40">No wallets linked. Go to Settings &gt; Wallets to link one.</p>
        ) : (
          <div className="space-y-0">
            {wallets.map((w) => (
              <div key={w.id} className="flex items-center gap-3 py-2.5 border-b border-black/5 last:border-0">
                <CopyableAddress address={w.address} truncate className="text-sm text-text" />
                {w.is_primary && <Badge variant="active" size="sm">Primary</Badge>}
                {w.screening_status && (
                  <Badge variant={w.screening_status === "clear" ? "default" : "pending"} size="sm">
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
