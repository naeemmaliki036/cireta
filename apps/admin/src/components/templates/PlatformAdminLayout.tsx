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
  Menu,
  ChevronRight,
  Wallet,
  Users,
  LayoutDashboard,
  UserCog,
  Mail,
  DollarSign,
  BarChart3,
  Handshake,
} from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button, Badge } from "@/components/atoms";
import { SidebarUserProfile } from "@/components/molecules/SidebarUserProfile";
import { NotificationBell } from "@/components/molecules/NotificationBell";
import { cn } from "@/lib/utils";

const PLATFORM_LINKS = [
  { href: "/platform/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/platform/tokens", label: "Tokens", icon: Coins },
  { href: "/platform/sales", label: "Sales", icon: ShoppingCart },
  { href: "/platform/compliance", label: "Compliance", icon: Shield },
  { href: "/platform/fees", label: "Fees", icon: DollarSign },
  { href: "/platform/stats", label: "Stats", icon: BarChart3 },
  { href: "/platform/partners", label: "Partners", icon: Handshake },
  { href: "/platform/team", label: "Team", icon: Users },
];

const MANAGE_LINKS = [
  { href: "/platform/issuers", label: "Issuers", icon: Building2 },
  { href: "/platform/users", label: "Users", icon: Users },
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

  const NavLink = ({ href, label, icon: Icon }: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) => {
    const isActive = pathname.startsWith(href);
    return (
      <Link
        href={href}
        onClick={() => setIsSidebarOpen(false)}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors",
          isActive
            ? "bg-zinc-100 text-zinc-900"
            : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen">
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar — always fixed */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-56 bg-white border-r border-zinc-200 flex flex-col transition-transform duration-300 lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full px-4 py-5 overflow-y-auto">
          {/* Logo */}
          <Link href="/platform/overview" className="flex items-center gap-2 mb-6 px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo/cireta-logo.svg" alt="Cireta" className="h-7 w-auto" />
            <Badge variant="dark" size="sm" className="ml-auto text-[10px] bg-amber-100 text-amber-600 border border-amber-200">Admin</Badge>
          </Link>

          {/* Platform section */}
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-3 mb-2">Platform</p>
          <nav className="space-y-0.5 mb-5">
            {PLATFORM_LINKS.map((link) => (
              <NavLink key={link.href} {...link} />
            ))}
          </nav>

          {/* Manage section */}
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-3 mb-2">Manage</p>
          <nav className="space-y-0.5">
            {MANAGE_LINKS.map((link) => (
              <NavLink key={link.href} {...link} />
            ))}
          </nav>

          {/* Navigation bottom */}
          <div className="mt-auto pt-4 border-t border-zinc-200 space-y-0.5">
            <NavLink href="/platform/email-templates" label="Email Management" icon={Mail} />
            <NavLink href="/platform/admins" label="Admin Accounts" icon={UserCog} />
            <NavLink href="/platform/settings" label="Settings" icon={Settings} />
          </div>

          {/* User profile */}
          <SidebarUserProfile />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-50 lg:ml-56">
        <header className="sticky top-0 z-20 bg-white border-b border-zinc-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-1.5 rounded-md hover:bg-zinc-100 transition-colors">
                <Menu className="h-5 w-5" />
              </button>
              <div>
                {breadcrumbs && breadcrumbs.length > 0 && (
                  <nav className="flex items-center gap-1 text-xs text-zinc-400 mb-0.5">
                    {breadcrumbs.map((crumb, index) => (
                      <React.Fragment key={index}>
                        {crumb.href ? (
                          <Link href={crumb.href} className="hover:text-zinc-600 transition-colors">{crumb.label}</Link>
                        ) : (
                          <span className="text-zinc-600">{crumb.label}</span>
                        )}
                        {index < breadcrumbs.length - 1 && <ChevronRight className="h-3 w-3" />}
                      </React.Fragment>
                    ))}
                  </nav>
                )}
                {title && <h1 className="text-base font-semibold text-zinc-900">{title}</h1>}
                {description && <p className="text-xs text-zinc-500">{description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <NotificationBell />
              <ConnectButton.Custom>
                {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
                  const connected = mounted && account && chain;
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={connected ? openAccountModal : openConnectModal}
                    >
                      <Wallet className="h-3.5 w-3.5 mr-1.5" />
                      {connected
                        ? `${account.displayName}${chain.unsupported ? " (Wrong Network)" : ""}`
                        : "Connect Wallet"
                      }
                    </Button>
                  );
                }}
              </ConnectButton.Custom>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
