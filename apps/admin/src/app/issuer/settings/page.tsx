"use client";

import { useState, useEffect } from "react";
import { User, Wallet, Shield, Bell, CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { IssuerDashboardLayout } from "@/components/templates";
import { Button, Badge } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getOnboardingStatus, type OnboardingStatus } from "@/lib/api/repositories/issuer-onboarding";
import { apiFetch } from "@/lib/api/client";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
] as const;

type TabId = (typeof TABS)[number]["id"];

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

export default function IssuerSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const user = useCurrentUser();
  const { address, isConnected } = useAccount();

  useEffect(() => {
    getOnboardingStatus()
      .then(setOnboarding)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.display_name) setDisplayName(user.display_name);
  }, [user]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/v1/auth/me", {
        method: "PATCH",
        body: { display_name: displayName },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: "active" | "pending" | "error" | "default"; label: string }> = {
      approved: { variant: "active", label: "Approved" },
      active: { variant: "active", label: "Active" },
      pending: { variant: "pending", label: "Pending" },
      pending_approval: { variant: "pending", label: "Pending Approval" },
      rejected: { variant: "error", label: "Rejected" },
      none: { variant: "default", label: "Not Started" },
      suspended: { variant: "error", label: "Suspended" },
    };
    const info = map[status] ?? { variant: "default" as const, label: status };
    return <Badge variant={info.variant} size="sm">{info.label}</Badge>;
  };

  return (
    <IssuerDashboardLayout
      title="Settings"
      description="Manage your issuer account"
    >
      {/* Tab bar */}
      <nav className="flex items-center gap-1 border-b border-zinc-200 mb-6 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "text-zinc-900 font-medium"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-zinc-900 rounded-t" />
            )}
          </button>
        ))}
      </nav>

      {error && <p className="text-red-600 text-sm mb-4 p-3 bg-red-50 rounded-lg border border-red-200">{error}</p>}

      <div className="max-w-3xl space-y-6">
        {/* ── Profile Tab ── */}
        {activeTab === "profile" && (
          <>
            <div className="bg-white rounded-lg border border-zinc-200 p-5 space-y-5">
              <h2 className="text-sm font-semibold text-zinc-800">Account Information</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Email</label>
                  <p className="text-sm text-zinc-900 bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-100">
                    {user?.email ?? "—"}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Role</label>
                  <p className="text-sm text-zinc-900 bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-100 capitalize">
                    {user?.role ?? "—"}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Display Name</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 max-w-sm"
                  placeholder="Your name or company"
                />
              </div>

              <Button variant="primary" size="sm" onClick={handleSaveProfile} isLoading={saving}>
                {saved ? "Saved" : "Save Changes"}
              </Button>
            </div>

            {/* Onboarding Status Summary */}
            {onboarding && (
              <div className="bg-white rounded-lg border border-zinc-200 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-zinc-800">Onboarding Status</h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-zinc-100">
                    <span className="text-sm text-zinc-600">Account Status</span>
                    {statusBadge(onboarding.issuer_status)}
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-zinc-100">
                    <span className="text-sm text-zinc-600">Issuer Type</span>
                    <span className="text-sm text-zinc-900 capitalize">{onboarding.issuer_type}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-zinc-100">
                    <span className="text-sm text-zinc-600">Wallet</span>
                    {statusBadge(onboarding.wallet_status)}
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-zinc-100">
                    <span className="text-sm text-zinc-600">Identity Verification</span>
                    {!onboarding.kyc_required
                      ? <Badge variant="active" size="sm">Exempted</Badge>
                      : statusBadge(onboarding.identity_status)
                    }
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-zinc-600">Can Deploy Tokens</span>
                    {onboarding.can_deploy
                      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                      : <span className="text-xs text-zinc-400">Not yet</span>
                    }
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Wallet Tab ── */}
        {activeTab === "wallet" && (
          <div className="space-y-6">
            {/* Connected Wallet */}
            <div className="bg-white rounded-lg border border-zinc-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-800">Connected Wallet</h2>
              {isConnected && address ? (
                <div className="flex items-center gap-3 bg-green-50 rounded-lg p-4 border border-green-100">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800">Wallet Connected</p>
                    <CopyableAddress address={address} truncate className="text-xs text-green-600" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copyToClipboard(address)}
                      title="Copy address"
                      className="p-1.5 rounded hover:bg-green-100 text-green-600 transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={`https://basescan.org/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-green-100 text-green-600 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 bg-zinc-50 rounded-lg border border-zinc-100">
                  <Wallet className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500 mb-3">No wallet connected</p>
                  <ConnectButton.Custom>
                    {({ openConnectModal }) => (
                      <Button variant="primary" size="sm" onClick={openConnectModal}>
                        Connect Wallet
                      </Button>
                    )}
                  </ConnectButton.Custom>
                </div>
              )}
            </div>

            {/* Issuer Wallet Status */}
            {onboarding && (
              <div className="bg-white rounded-lg border border-zinc-200 p-5 space-y-3">
                <h2 className="text-sm font-semibold text-zinc-800">Issuer Wallet Status</h2>
                <p className="text-xs text-zinc-500">
                  This is the wallet registered with Cireta for on-chain token operations.
                </p>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-zinc-600">Approval Status</span>
                  {statusBadge(onboarding.wallet_status)}
                </div>
                {onboarding.wallet_status === "none" && (
                  <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
                    You haven&apos;t submitted a wallet yet. Go to the onboarding page to connect and verify your wallet.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Security Tab ── */}
        {activeTab === "security" && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-zinc-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-800">Authentication</h2>
              <div className="flex items-center justify-between py-3 border-b border-zinc-100">
                <div>
                  <p className="text-sm text-zinc-900 font-medium">Passwordless Login (OTP)</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Sign in via email verification code</p>
                </div>
                <Badge variant="active" size="sm">Enabled</Badge>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-zinc-100">
                <div>
                  <p className="text-sm text-zinc-900 font-medium">Two-Factor Authentication (2FA)</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Add TOTP authenticator for extra security</p>
                </div>
                <Badge variant="default" size="sm">Coming Soon</Badge>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-zinc-900 font-medium">Active Sessions</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Manage devices with active sessions</p>
                </div>
                <Badge variant="default" size="sm">Coming Soon</Badge>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-zinc-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-800">Identity Verification</h2>
              {onboarding && (
                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm text-zinc-900 font-medium">
                      {onboarding.issuer_type === "corporate" ? "KYB (Know Your Business)" : "KYC (Know Your Customer)"}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {!onboarding.kyc_required
                        ? "Identity verification has been exempted by platform admin"
                        : onboarding.identity_status === "approved"
                          ? "Your identity has been verified"
                          : "Complete identity verification to deploy tokens"
                      }
                    </p>
                  </div>
                  {!onboarding.kyc_required
                    ? <Badge variant="active" size="sm">Exempted</Badge>
                    : statusBadge(onboarding.identity_status)
                  }
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Notifications Tab ── */}
        {activeTab === "notifications" && (
          <div className="bg-white rounded-lg border border-zinc-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-800">Email Notifications</h2>
            <div className="space-y-3">
              {[
                { label: "Sale Milestones", desc: "Get notified when your sales hit funding targets" },
                { label: "New Investors", desc: "Alerts when new investors contribute to your sales" },
                { label: "Compliance Alerts", desc: "Updates on compliance actions (freeze, recovery, etc.)" },
                { label: "Platform Announcements", desc: "Important updates from the Cireta platform team" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-3 border-b border-zinc-100 last:border-b-0">
                  <div>
                    <p className="text-sm text-zinc-900 font-medium">{item.label}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{item.desc}</p>
                  </div>
                  <Badge variant="default" size="sm">Coming Soon</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </IssuerDashboardLayout>
  );
}
