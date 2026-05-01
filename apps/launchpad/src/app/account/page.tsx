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
    description: "Display name & email",
  },
  {
    href: "/settings/wallets",
    icon: Wallet,
    title: "Connected Wallets",
    description: "Linked blockchain wallets",
  },
  {
    href: "/settings/verification",
    icon: ShieldCheck,
    title: "Identity Verification",
    description: "KYC status",
  },
  {
    href: "/settings/notifications",
    icon: Bell,
    title: "Notifications",
    description: "Email & in-app",
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
        <p className="text-center text-black/50 py-24">Please log in</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Account" description="Your profile and preferences">
      <div className="max-w-4xl py-2">
        {/* Slim hero — about half the previous height, brand colors */}
        <div className="bg-darkAqua rounded-2xl px-5 py-4 mb-5 text-white flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center text-base font-bold shrink-0">
            {(user.display_name || user.email).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold truncate leading-tight">
              {user.display_name || "Buyer"}
            </p>
            <p className="text-white/70 text-xs truncate">{user.email}</p>
          </div>
          <KYCBadge status={user.kyc_status} level={user.kyc_level} className="shrink-0" />
        </div>

        {/* Account cards — denser 4-column grid on lg, 2-column otherwise */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ACCOUNT_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group bg-white border border-black/10 rounded-2xl p-4 hover:border-darkAqua/40 transition-colors flex items-start gap-3"
            >
              <div className="w-9 h-9 rounded-xl bg-box flex items-center justify-center shrink-0">
                <card.icon className="h-4 w-4 text-darkAqua" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1.5 mb-0.5">
                  <p className="text-sm font-semibold text-text truncate">{card.title}</p>
                  <ChevronRight className="h-3.5 w-3.5 text-black/30 group-hover:text-darkAqua transition-colors shrink-0" />
                </div>
                <p className="text-xs text-black/50 truncate">{card.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
