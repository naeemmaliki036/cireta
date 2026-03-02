"use client";

import { useState, useEffect } from "react";
import { Button, Input } from "@/components/atoms";
import { me, updateProfile, type User } from "@/lib/api/repositories/auth.repository";
import { getAccessToken } from "@/lib/api/client";

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    me(token).then((u) => {
      setUser(u);
      setDisplayName(u.display_name ?? "");
    });
  }, []);

  const handleSave = async () => {
    const token = getAccessToken();
    if (!token) return;
    setSaving(true);
    try {
      const updated = await updateProfile(token, { display_name: displayName });
      setUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <div className="text-white/40 text-sm">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Profile</h2>
        <p className="text-white/40 text-sm">Manage your account details.</p>
      </div>
      <div className="bg-white/5 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm text-white/60 mb-1">Email</label>
          <p className="text-white font-medium">{user.email}</p>
          <p className="text-xs text-white/30 mt-0.5">Email cannot be changed after verification.</p>
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">Display Name</label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="max-w-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-white/60 mb-1">KYC Status</label>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            user.kyc_status === "approved" ? "bg-green-500/20 text-green-400" :
            user.kyc_status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
            "bg-white/10 text-white/40"
          }`}>
            Level {user.kyc_level} — {user.kyc_status}
          </span>
        </div>
        <Button onClick={handleSave} disabled={saving} variant="primary" size="sm">
          {saving ? "Saving..." : saved ? "Saved ✓" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
