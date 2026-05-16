"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Clock,
  FileText,
  User,
  ShoppingBag,
  FolderOpen,
  Send,
  Wallet,
  Shield,
  Bell,
  MapPin,
} from "lucide-react";
import { Navbar, Footer } from "@/components/organisms";
import { cn } from "@/lib/utils";

const SIDEBAR_LINKS = [
  { href: "/projects", label: "Sales", icon: ShoppingBag },
  { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
];

const ACCOUNT_LINKS = [
  { href: "/account", label: "Account", icon: User },
  { href: "/portfolio", label: "Holdings", icon: LayoutDashboard },
  { href: "/portfolio/vesting", label: "Vesting", icon: Clock },
  { href: "/portfolio/transfer", label: "Transfer", icon: Send },
  { href: "/portfolio/fraction-transfer", label: "Fraction Transfer", icon: Send },
  { href: "/portfolio/transactions", label: "Transactions", icon: FileText },
];

const SETTINGS_LINKS = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/wallets", label: "Wallets", icon: Wallet },
  { href: "/settings/addresses", label: "Shipping Addresses", icon: MapPin },
  { href: "/settings/verification", label: "Verification", icon: Shield },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
];

export interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export function DashboardLayout({
  children,
  title,
  description,
}: DashboardLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar variant="light" />

      <div className="flex pt-16 flex-1">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-44 border-r border-gray-100 flex-col p-4 sticky top-16 h-[calc(100vh-4rem)]">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 px-2">Buyer</p>
          <nav className="space-y-1">
            {SIDEBAR_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive ? "bg-gray-100 text-text" : "text-gray-500 hover:bg-gray-50 hover:text-text"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 px-2">Account</p>
            <nav className="space-y-1">
              {ACCOUNT_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href + link.label}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive ? "bg-gray-100 text-text" : "text-gray-500 hover:bg-gray-50 hover:text-text"
                    )}
                  >
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-6">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 px-2">Settings</p>
            <nav className="space-y-1">
              {SETTINGS_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive ? "bg-gray-100 text-text" : "text-gray-500 hover:bg-gray-50 hover:text-text"
                    )}
                  >
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {title && (
            <header className="border-b border-gray-100 px-6 py-4">
              <h1 className="text-lg font-semibold text-text">{title}</h1>
              {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
            </header>
          )}
          <main className="p-6">{children}</main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
