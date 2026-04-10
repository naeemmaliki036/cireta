"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User, Wallet, Bell, ShieldCheck, ChevronRight } from "lucide-react";
import { Spinner } from "@/components/atoms";
import { KYCBadge } from "@/components/molecules";
import { DashboardLayout } from "@/components/templates";
import { me, type User as AuthUser } from "@/lib/api/repositories/auth.repository";

const ACCOUNT_CARDS = [
  {
    href: "/settings/profile",
    icon: User,
    title: "Profile",
    description: "Display name, email, and basic info",
  },
  {
    href: "/settings/wallets",
    icon: Wallet,
    title: "Connected Wallets",
    description: "Manage your linked blockchain wallets",
  },
  {
    href: "/settings/verification",
    icon: ShieldCheck,
    title: "Identity Verification",
    description: "Complete or review your KYC status",
  },
  {
    href: "/settings/notifications",
    icon: Bell,
    title: "Notifications",
    description: "Email, SMS and in-app preferences",
  },
];

export default function AccountPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await me();
        setUser(data);
      } catch (err) {
        console.error("Failed to load user:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <DashboardLayout title="Account">
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }
  if (!user) {
    return (
      <DashboardLayout title="Account">
        <p className="text-center text-gray-400 py-24">Please log in</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Account" description="Your profile and preferences">
      {/* User header card */}
      <div className="bg-gradient-to-r from-darkAqua to-darkAqua/80 rounded-2xl p-6 mb-8 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl font-bold">
            {(user.display_name || user.email).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">{user.display_name || "Investor"}</h2>
            <p className="text-white/70 text-sm truncate">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <KYCBadge status={user.kyc_status} level={user.kyc_level} />
          </div>
        </div>
      </div>

      {/* Quick links to settings sub-pages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ACCOUNT_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group bg-white border border-gray-100 rounded-2xl p-5 hover:border-darkAqua/30 hover:shadow-sm transition-all flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl bg-darkAqua/10 flex items-center justify-center flex-shrink-0">
              <card.icon className="h-5 w-5 text-darkAqua" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-text">{card.title}</p>
              <p className="text-sm text-gray-500 truncate">{card.description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-darkAqua transition-colors" />
          </Link>
        ))}
      </div>
    </DashboardLayout>
  );
}
