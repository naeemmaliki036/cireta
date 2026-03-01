"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Shield,
  Wallet,
  Bell,
  Download,
  ChevronRight,
  Plus,
} from "lucide-react";
import { Button, Badge, Input, Spinner } from "@/components/atoms";
import { KYCBadge, WalletBadge } from "@/components/molecules";
import { DashboardLayout } from "@/components/templates";
import { me, type User as AuthUser } from "@/lib/api/repositories/auth.repository";


export default function AccountPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("token");
      if (!token) { setLoading(false); return; }
      try {
        const data = await me(token);
        setUser(data);
      } catch { /* redirect to login */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <DashboardLayout title="Account"><div className="flex justify-center py-24"><Spinner /></div></DashboardLayout>;
  if (!user) return <DashboardLayout title="Account"><p className="text-center text-white/40 py-24">Please log in</p></DashboardLayout>;

  const [activeTab, setActiveTab] = useState("profile");
  const [notifications, setNotifications] = useState({ email: true, sms: false, browser: true });

  return (
    <DashboardLayout
      title="Account Settings"
      description="Manage your profile and preferences"
    >
      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {[
          { id: "profile", label: "Profile", icon: User },
          { id: "wallets", label: "Wallets", icon: Wallet },
          { id: "notifications", label: "Notifications", icon: Bell },
          { id: "security", label: "Security", icon: Shield },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-darkAqua text-white"
                : "bg-white text-gray-500 hover:text-text"
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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Email */}
          <div className="bg-white rounded-3xl p-6 border border-darkBlack/10">
            <h2 className="text-lg font-semibold text-text mb-4">
              Email Address
            </h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-box flex items-center justify-center">
                  <Mail className="h-5 w-5 text-darkAqua" />
                </div>
                <div>
                  <p className="font-medium">{user.email}</p>
                  <p className="text-sm text-gray-500">Primary email</p>
                </div>
              </div>
              <Badge variant="success">Verified</Badge>
            </div>
          </div>

          {/* KYC Status */}
          <div className="bg-white rounded-3xl p-6 border border-darkBlack/10">
            <h2 className="text-lg font-semibold text-text mb-4">
              KYC Verification
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <KYCBadge
                  status={user.kyc_status}
                  level={user.kyc_level}
                />
                <p className="text-sm text-gray-500 mt-2">
                  Verified on March 1, 2024
                </p>
              </div>
              <Button variant="outline" size="sm">
                View Details
              </Button>
            </div>
          </div>

          {/* Export Data */}
          <div className="bg-white rounded-3xl p-6 border border-darkBlack/10">
            <h2 className="text-lg font-semibold text-text mb-4">
              Export Your Data
            </h2>
            <p className="text-gray-500 mb-4">
              Download a CSV file of all your transactions and holdings.
            </p>
            <Button
              variant="outline"
              leftIcon={<Download className="h-4 w-4" />}
            >
              Export to CSV
            </Button>
          </div>
        </motion.div>
      )}

      {activeTab === "wallets" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="bg-white rounded-3xl p-6 border border-darkBlack/10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-text">
                Connected Wallets
              </h2>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Add Wallet
              </Button>
            </div>

            <div className="space-y-4">
              {user.onchain_id ? (
                <div className="flex items-center justify-between p-4 rounded-xl bg-box">
                  <WalletBadge address={user.onchain_id} isPrimary={true} />
                </div>
              ) : (
                <p className="text-sm text-darkBlack/40 text-center py-4">No wallet connected yet</p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === "notifications" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <h2 className="text-lg font-semibold text-text mb-6">
            Notification Preferences
          </h2>

          <div className="space-y-4">
            {[
              {
                key: "email",
                label: "Email Notifications",
                description: "Receive notifications via email",
              },
              {
                key: "saleUpdates",
                label: "Sale Updates",
                description: "Get notified about new sales and updates",
              },
              {
                key: "vestingReminders",
                label: "Vesting Reminders",
                description: "Reminders when tokens are ready to claim",
              },
              {
                key: "marketing",
                label: "Marketing",
                description: "Receive promotional content and news",
              },
            ].map((pref) => (
              <div
                key={pref.key}
                className="flex items-center justify-between py-4 border-b border-darkBlack/5 last:border-0"
              >
                <div>
                  <p className="font-medium text-text">{pref.label}</p>
                  <p className="text-sm text-gray-500">{pref.description}</p>
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
        </motion.div>
      )}

      {activeTab === "security" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="bg-white rounded-3xl p-6 border border-darkBlack/10">
            <h2 className="text-lg font-semibold text-text mb-4">
              Change Password
            </h2>
            <form className="space-y-4 max-w-md">
              <Input
                type="password"
                label="Current Password"
                placeholder="Enter current password"
              />
              <Input
                type="password"
                label="New Password"
                placeholder="Enter new password"
              />
              <Input
                type="password"
                label="Confirm New Password"
                placeholder="Confirm new password"
              />
              <Button variant="primary">Update Password</Button>
            </form>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-darkBlack/10">
            <h2 className="text-lg font-semibold text-text mb-4">
              Two-Factor Authentication
            </h2>
            <p className="text-gray-500 mb-4">
              Add an extra layer of security to your account.
            </p>
            <Button variant="outline">Enable 2FA</Button>
          </div>

          <div className="bg-red-50 rounded-3xl p-6 border border-red-200">
            <h2 className="text-lg font-semibold text-red-700 mb-2">
              Danger Zone
            </h2>
            <p className="text-red-600 text-sm mb-4">
              Once you delete your account, there is no going back.
            </p>
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              Delete Account
            </Button>
          </div>
        </motion.div>
      )}
    </DashboardLayout>
  );
}
