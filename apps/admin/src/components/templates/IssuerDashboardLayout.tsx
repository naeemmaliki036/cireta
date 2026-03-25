"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Coins,
  ShoppingCart,
  Users,
  Shield,
  Wallet,
  Settings,
  LogOut,
  Menu,
  ChevronRight,
} from "lucide-react";
import { CiretaLogo, Button } from "@/components/atoms";
import { cn } from "@/lib/utils";

const SIDEBAR_LINKS = [
  { href: "/issuer/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/issuer/tokens", label: "Tokens", icon: Coins },
  { href: "/issuer/sales", label: "Token Sales", icon: ShoppingCart },
  { href: "/issuer/investors", label: "Investors", icon: Users },
  { href: "/issuer/compliance", label: "Compliance", icon: Shield },
  { href: "/issuer/withdrawals", label: "Withdrawals", icon: Wallet },
];

export interface IssuerDashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}

export function IssuerDashboardLayout({
  children,
  title,
  description,
  breadcrumbs,
  actions,
}: IssuerDashboardLayoutProps) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-darkBlack shadow-sidebar flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-auto",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full p-6">
          {/* Logo */}
          <Link href="/issuer/overview" className="flex items-center gap-2 mb-10">
            <CiretaLogo variant="icon" color="teal" className="w-8 h-8" />
            <span className="text-xl font-bold text-white">Cireta</span>
            <span className="text-xs text-white/70 ml-1">Issuer</span>
          </Link>

          {/* Navigation */}
          <nav className="flex-1 space-y-1">
            {SIDEBAR_LINKS.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                    isActive
                      ? "bg-darkAqua/25 text-darkAqua border border-darkAqua/30 font-semibold"
                      : "text-white hover:text-white hover:bg-white/10"
                  )}
                >
                  <link.icon className="h-5 w-5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Bottom Actions */}
          <div className="mt-auto pt-6 border-t border-white/10 space-y-1">
            <Link
              href="/platform/issuers"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-gold hover:text-gold hover:bg-gold/10 transition-colors text-sm font-medium"
            >
              <Shield className="h-5 w-5" />
              Platform Admin
            </Link>
            <Link
              href="/issuer/settings"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-white hover:text-white hover:bg-white/10 transition-colors text-sm font-medium"
            >
              <Settings className="h-5 w-5" />
              Settings
            </Link>
            <button className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-sm font-medium w-full">
              <LogOut className="h-5 w-5" />
              Disconnect
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-box">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-box border-b border-darkBlack/5 px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-darkBlack/5 transition-colors"
              >
                <Menu className="h-6 w-6" />
              </button>
              <div>
                {breadcrumbs && breadcrumbs.length > 0 && (
                  <nav className="flex items-center gap-1 text-sm text-gray-500 mb-1">
                    {breadcrumbs.map((crumb, index) => (
                      <React.Fragment key={index}>
                        {crumb.href ? (
                          <Link href={crumb.href} className="hover:text-darkAqua transition-colors">
                            {crumb.label}
                          </Link>
                        ) : (
                          <span className="text-text">{crumb.label}</span>
                        )}
                        {index < breadcrumbs.length - 1 && (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </React.Fragment>
                    ))}
                  </nav>
                )}
                {title && <h1 className="text-xl font-semibold text-text">{title}</h1>}
                {description && <p className="text-sm text-gray-500">{description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {actions}
              <Button variant="outline" size="sm">
                <Wallet className="h-4 w-4 mr-2" />
                Wallet
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
