"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Wallet, Shield, Bell } from "lucide-react";
import { DashboardLayout } from "@/components/templates";

const NAV = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/wallets", label: "Wallets", icon: Wallet },
  { href: "/settings/verification", label: "Verification", icon: Shield },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>
        <div className="flex gap-8">
          <nav className="w-48 shrink-0">
            <ul className="space-y-1">
              {NAV.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      pathname === href
                        ? "bg-white/10 text-white font-medium"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </DashboardLayout>
  );
}
