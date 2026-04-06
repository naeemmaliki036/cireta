"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Wallet,
  Bell,
  Download,
  Plus,
  ShieldCheck,
  Clock,
  AlertCircle,
  XCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Button, Badge, Spinner } from "@/components/atoms";
import { KYCBadge, WalletBadge } from "@/components/molecules";
import { DashboardLayout } from "@/components/templates";
import { me, type User as AuthUser } from "@/lib/api/repositories/auth.repository";

const KYC_STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  approved: { icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50", label: "Identity Verified" },
  pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50", label: "Verification in Progress" },
  rejected: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "Verification Rejected" },
  expired: { icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-50", label: "Verification Expired" },
  none: { icon: AlertCircle, color: "text-gray-500", bg: "bg-gray-50", label: "Not Started" },
};

export default function AccountPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");
  const [notifications, setNotifications] = useState({ email: true, sms: false, browser: true });

  useEffect(() => {
    (async () => {
      try {
        const data = await me();
        setUser(data);
      } catch (err) { console.error("Failed to load user:", err); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <DashboardLayout title="Account"><div className="flex justify-center py-24"><Spinner /></div></DashboardLayout>;
  if (!user) return <DashboardLayout title="Account"><p className="text-center text-white/40 py-24">Please log in</p></DashboardLayout>;

  const kycConfig = KYC_STATUS_CONFIG[user.kyc_status] || KYC_STATUS_CONFIG.none;
  const KycIcon = kycConfig.icon;

  return (
    <DashboardLayout
      title="Account Settings"
      description="Manage your profile and preferences"
    >
      {/* User Header Card */}
      <div className="bg-gradient-to-r from-darkAqua to-darkAqua/80 rounded-2xl p-6 mb-8 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl font-bold">
            {(user.display_name || user.email)[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{user.display_name || "Investor"}</h2>
            <p className="text-white/70 text-sm">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <KYCBadge status={user.kyc_status} level={user.kyc_level} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: "profile", label: "Profile", icon: User },
          { id: "wallets", label: "Wallets", icon: Wallet },
          { id: "notifications", label: "Notifications", icon: Bell },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-white text-text shadow-sm"
                : "text-gray-500 hover:text-text"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "profile" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {/* Email Card */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-darkAqua/10 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-darkAqua" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-0.5">Email Address</p>
                  <p className="font-medium text-text">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-600">Verified</span>
              </div>
            </div>
          </div>

          {/* KYC Verification Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className={`px-5 py-4 ${kycConfig.bg} border-b border-gray-100`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <KycIcon className={`h-5 w-5 ${kycConfig.color}`} />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-0.5">Identity Verification</p>
                    <p className={`font-semibold ${kycConfig.color}`}>{kycConfig.label}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="text-xs">
                  View Details
                </Button>
              </div>
            </div>
            {user.kyc_status === "none" && (
              <div className="px-5 py-4">
                <p className="text-sm text-gray-500 mb-3">Complete identity verification to start investing in token sales.</p>
                <Button variant="primary" size="sm">Start Verification</Button>
              </div>
            )}
            {user.kyc_status === "pending" && (
              <div className="px-5 py-4">
                <div className="text-sm text-gray-500">
                  <p>Your documents are being reviewed. This usually takes a few minutes but can take up to 24 hours.</p>
                  <p className="mt-1">In case of delay, contact <a href="https://cireta.com" target="_blank" rel="noopener noreferrer" className="text-darkAqua underline hover:text-darkAqua/80">compliance@cireta.com</a>.</p>
                </div>
              </div>
            )}
            {user.kyc_status === "rejected" && (
              <div className="px-5 py-4">
                <p className="text-sm text-gray-500 mb-3">Your verification was not successful. Please re-submit your documents.</p>
                <Button variant="primary" size="sm">Re-submit</Button>
              </div>
            )}
          </div>

          {/* Export Data Card */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Download className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-medium text-text">Export Your Data</p>
                  <p className="text-sm text-gray-400">Download transactions and holdings as CSV</p>
                </div>
              </div>
              <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />}>
                Export
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === "wallets" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-text">Connected Wallets</h2>
                <p className="text-sm text-gray-400 mt-0.5">Manage your linked blockchain wallets</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Add Wallet
              </Button>
            </div>

            <div className="p-5">
              {user.onchain_id ? (
                <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-darkAqua/10 flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-darkAqua" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-medium text-text">
                          {user.onchain_id.slice(0, 6)}...{user.onchain_id.slice(-4)}
                        </p>
                        <button
                          onClick={() => navigator.clipboard.writeText(user.onchain_id || "")}
                          className="text-gray-400 hover:text-darkAqua transition-colors"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">Primary Wallet</p>
                    </div>
                  </div>
                  <Badge variant="success" size="sm">Connected</Badge>
                </div>
              ) : (
                <div className="text-center py-10">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <Wallet className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="font-medium text-text mb-1">No wallets connected</p>
                  <p className="text-sm text-gray-400 mb-4">Connect a wallet to start investing</p>
                  <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                    Connect Wallet
                  </Button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === "notifications" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-text">Notification Preferences</h2>
              <p className="text-sm text-gray-400 mt-0.5">Choose what updates you want to receive</p>
            </div>

            <div className="divide-y divide-gray-50">
              {[
                {
                  key: "email",
                  label: "Email Notifications",
                  description: "Receive notifications via email",
                  icon: Mail,
                },
                {
                  key: "saleUpdates",
                  label: "Sale Updates",
                  description: "Get notified about new sales and updates",
                  icon: Bell,
                },
                {
                  key: "vestingReminders",
                  label: "Vesting Reminders",
                  description: "Reminders when tokens are ready to claim",
                  icon: Clock,
                },
                {
                  key: "marketing",
                  label: "Marketing",
                  description: "Receive promotional content and news",
                  icon: ExternalLink,
                },
              ].map((pref) => (
                <div
                  key={pref.key}
                  className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                      <pref.icon className="h-4 w-4 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-text">{pref.label}</p>
                      <p className="text-xs text-gray-400">{pref.description}</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifications[pref.key as keyof typeof notifications]}
                      onChange={(e) =>
                        setNotifications({
                          ...notifications,
                          [pref.key]: e.target.checked,
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-darkAqua/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-darkAqua" />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

    </DashboardLayout>
  );
}
