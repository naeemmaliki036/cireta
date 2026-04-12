"use client";

import React, { useState, useEffect } from "react";
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
  Menu,
  ChevronRight,
  Lock,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/atoms";
import { SidebarUserProfile } from "@/components/molecules/SidebarUserProfile";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { NotificationBell } from "@/components/molecules/NotificationBell";
import { cn } from "@/lib/utils";
import { getOnboardingStatus } from "@/lib/api/repositories/issuer-onboarding";

const SIDEBAR_LINKS = [
  { href: "/issuer/overview", label: "Overview", icon: LayoutDashboard, requiresOnboarding: false },
  { href: "/issuer/tokens", label: "Tokens", icon: Coins, requiresOnboarding: true },
  { href: "/issuer/sales", label: "Token Sales", icon: ShoppingCart, requiresOnboarding: true },
  { href: "/issuer/buyers", label: "Buyers", icon: Users, requiresOnboarding: true },
  { href: "/issuer/compliance", label: "Compliance", icon: Shield, requiresOnboarding: true },
  { href: "/issuer/compliance/wallet-deletions", label: "Wallet Removals", icon: Trash2, requiresOnboarding: true },
  { href: "/issuer/compliance/identity-registry", label: "Identity Registry", icon: ShieldAlert, requiresOnboarding: true },
  { href: "/issuer/withdrawals", label: "Withdrawals", icon: Wallet, requiresOnboarding: true },
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
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [canDeploy, setCanDeploy] = useState<boolean | null>(null);

  useEffect(() => {
    getOnboardingStatus()
      .then((s) => setCanDeploy(s.can_deploy))
      .catch(() => setCanDeploy(false));
  }, []);

  const isLocked = canDeploy === false;

  const NavLink = ({
    href,
    label,
    icon: Icon,
    disabled,
  }: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    disabled?: boolean;
  }) => {
    const isActive = pathname.startsWith(href);

    if (disabled) {
      return (
        <div
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium text-zinc-300 cursor-not-allowed select-none"
          title="Complete onboarding to unlock"
        >
          <Icon className="h-4 w-4" />
          <span className="flex-1">{label}</span>
          <Lock className="h-3 w-3 text-zinc-300" />
        </div>
      );
    }

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

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-56 bg-white border-r border-zinc-200 flex flex-col transition-transform duration-300 lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full px-4 py-5 overflow-y-auto">
          <Link href="/issuer/overview" className="flex items-center gap-2 mb-6 px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo/cireta-logo.svg" alt="Cireta" className="h-7 w-auto" />
            <span className="text-xs text-zinc-400 font-medium ml-auto">Issuer</span>
          </Link>

          <nav className="space-y-0.5 flex-1">
            {SIDEBAR_LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                icon={link.icon}
                disabled={link.requiresOnboarding && isLocked}
              />
            ))}
          </nav>

          {/* Locked notice */}
          {isLocked && (
            <div className="mx-1 mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
              <p className="text-[11px] text-amber-700 leading-tight">
                Complete onboarding and get admin approval to unlock all features.
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-zinc-200 space-y-0.5">
            {isAdmin && (
              <Link
                href="/platform/overview"
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium text-amber-600 hover:bg-amber-50 transition-colors"
              >
                <Shield className="h-4 w-4" />
                Platform Admin
              </Link>
            )}
            <NavLink href="/issuer/settings" label="Settings" icon={Settings} />
          </div>

          {/* User profile */}
          <SidebarUserProfile />
        </div>
      </aside>

      {/* Main Content */}
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
                        : "Wallet"
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
