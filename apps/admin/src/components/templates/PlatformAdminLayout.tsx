"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Coins,
  ShoppingCart,
  Shield,
  Settings,
  LogOut,
  Menu,
  ChevronRight,
  Wallet,
  Users,
  LayoutDashboard,
  UserCog,
} from "lucide-react";
import { CiretaLogo, Button, Badge } from "@/components/atoms";
import { cn } from "@/lib/utils";

const SIDEBAR_LINKS = [
  { href: "/platform/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/platform/tokens", label: "Tokens", icon: Coins },
  { href: "/platform/sales", label: "Sales", icon: ShoppingCart },
  { href: "/platform/compliance", label: "Compliance", icon: Shield },
  { href: "/platform/issuers", label: "Issuers", icon: Building2 },
];

export interface PlatformAdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}

export function PlatformAdminLayout({
  children,
  title,
  description,
  breadcrumbs,
  actions,
}: PlatformAdminLayoutProps) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-darkBlack shadow-sidebar flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-auto",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full p-6">
          <Link href="/platform/overview" className="flex items-center gap-2 mb-10">
            <CiretaLogo variant="icon" color="teal" className="w-8 h-8" />
            <span className="text-xl font-bold text-white">Cireta</span>
            <Badge variant="dark" size="sm" className="ml-1 bg-gold/20 text-gold">Admin</Badge>
          </Link>
          <nav className="flex-1 space-y-1">
            {SIDEBAR_LINKS.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link key={link.href} href={link.href} onClick={() => setIsSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                    isActive && "font-semibold"
                  )}
                  style={isActive
                    ? { backgroundColor: "rgba(19,99,111,0.3)", color: "#fff", border: "1px solid rgba(19,99,111,0.4)" }
                    : { color: "rgba(255,255,255,0.7)" }
                  }>
                  <link.icon className="h-5 w-5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto pt-6 border-t border-white/10 space-y-1">
            <Link href="/platform/admins"
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium"
              style={{ color: "rgba(255,255,255,0.7)" }}>
              <UserCog className="h-5 w-5" />Admin Accounts
            </Link>
            <Link href="/platform/settings"
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium"
              style={{ color: "rgba(255,255,255,0.7)" }}>
              <Settings className="h-5 w-5" />Settings
            </Link>
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                window.location.href = "/login";
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium w-full"
              style={{ color: "#f87171" }}>
              <LogOut className="h-5 w-5" />Disconnect
            </button>
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 bg-box">
        <header className="sticky top-0 z-20 bg-box border-b border-darkBlack/5 px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-darkBlack/5 transition-colors">
                <Menu className="h-6 w-6" />
              </button>
              <div>
                {breadcrumbs && breadcrumbs.length > 0 && (
                  <nav className="flex items-center gap-1 text-sm text-gray-500 mb-1">
                    {breadcrumbs.map((crumb, index) => (
                      <React.Fragment key={index}>
                        {crumb.href ? (
                          <Link href={crumb.href} className="hover:text-darkAqua transition-colors">{crumb.label}</Link>
                        ) : (
                          <span className="text-text">{crumb.label}</span>
                        )}
                        {index < breadcrumbs.length - 1 && <ChevronRight className="h-4 w-4" />}
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
              <Button variant="outline" size="sm"><Wallet className="h-4 w-4 mr-2" />0xAdmin...9876</Button>
            </div>
          </div>
        </header>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
