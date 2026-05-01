"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Wallet as WalletIcon, ShieldCheck, Mail } from "lucide-react";
import { Button, Input, Spinner, Badge } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { InfoSidebar, type InfoSidebarItem } from "@/components/molecules";
import { me, updateProfile, type User } from "@/lib/api/repositories/auth.repository";
import { listWallets, type Wallet } from "@/lib/api/repositories/wallets.repository";

const PROFILE_TIPS: InfoSidebarItem[] = [
  {
    icon: Mail,
    title: "Email is locked",
    body:
      "Your email is bound to your KYC record. Contact support if you need to change it.",
  },
  {
    icon: ShieldCheck,
    title: "What \"Verified\" means",
    body:
      "Once your KYC is approved, your linked wallets inherit the status — they can hold and transfer security tokens on Cireta.",
    href: "/settings/verification",
    hrefLabel: "View KYC details",
  },
  {
    icon: WalletIcon,
    title: "Link up to 5 wallets",
    body:
      "Each linked wallet automatically inherits your KYC. You can buy, claim, and transfer from any of them.",
    href: "/settings/wallets",
    hrefLabel: "Manage wallets",
  },
];

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
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-text tracking-tight">Profile</h1>
        <p className="text-sm text-black/60 mt-1.5">Manage your account details.</p>
      </div>

      {error && (
        <p className="text-sm text-text p-3 bg-box rounded-xl border border-black/10 mb-4">{error}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
        <div className="min-w-0 space-y-5">
          {/* Profile card */}
          <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-black/5">
              <h2 className="text-sm font-semibold text-text">Account details</h2>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <label className="block text-[11px] font-semibold text-black/60 mb-1 uppercase tracking-wider">Email</label>
                <p className="text-sm font-medium text-text">{user.email}</p>
                <p className="text-xs text-black/40 mt-0.5">Email cannot be changed after verification.</p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-black/60 mb-1 uppercase tracking-wider">Display name</label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="max-w-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-black/60 mb-1 uppercase tracking-wider">KYC status</label>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                  user.kyc_status === "approved"
                    ? "bg-darkAqua text-white"
                    : user.kyc_status === "pending"
                    ? "bg-darkAqua/10 text-darkAqua border border-darkAqua/30"
                    : "bg-box text-black/60 border border-black/10"
                }`}>
                  <ShieldCheck className="h-3 w-3" />
                  {user.kyc_status === "approved" ? "Verified" : user.kyc_status === "pending" ? "Pending review" : user.kyc_status}
                </span>
              </div>

              <Button onClick={handleSave} disabled={saving} variant="primary" size="sm">
                {saving ? "Saving..." : saved ? "Saved ✓" : "Save changes"}
              </Button>
            </div>
          </div>

          {/* Linked wallets card */}
          <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-black/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WalletIcon className="h-3.5 w-3.5 text-darkAqua" />
                <h2 className="text-sm font-semibold text-text">Linked wallets</h2>
                {wallets.length > 0 && (
                  <span className="text-xs font-medium bg-box text-black/60 px-2 py-0.5 rounded-full">
                    {wallets.length}/5
                  </span>
                )}
              </div>
              <Link
                href="/settings/wallets"
                className="text-xs font-medium text-darkAqua hover:underline"
              >
                Manage →
              </Link>
            </div>
            {wallets.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-11 h-11 rounded-xl bg-box flex items-center justify-center mx-auto mb-3">
                  <WalletIcon className="h-4 w-4 text-darkAqua" />
                </div>
                <p className="text-sm font-semibold text-text mb-1">No wallets linked yet</p>
                <p className="text-xs text-black/50 mb-4 max-w-xs mx-auto">
                  Link an EVM wallet so you can buy, claim, and transfer tokens on Cireta.
                </p>
                <Link href="/settings/wallets">
                  <Button variant="primary" size="sm">Link a wallet</Button>
                </Link>
              </div>
            ) : (
              <ul>
                {wallets.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center gap-3 px-5 py-3 border-t border-black/5 first:border-t-0"
                  >
                    <CopyableAddress address={w.address} truncate className="text-sm text-text flex-1 min-w-0" />
                    {w.is_primary && <Badge variant="active" size="sm">Primary</Badge>}
                    {w.screening_status && (
                      <Badge variant={w.screening_status === "clear" ? "default" : "pending"} size="sm">
                        {w.screening_status}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <InfoSidebar items={PROFILE_TIPS} />
      </div>
    </div>
  );
}
