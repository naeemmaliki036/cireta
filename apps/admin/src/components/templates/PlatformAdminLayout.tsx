"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Shield,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  ChevronRight,
  Wallet,
  Users,
} from "lucide-react";
import { CiretaLogo, Button, Badge } from "@/components/atoms";
import { cn } from "@/lib/utils";

const SIDEBAR_LINKS = [
  { href: "/platform/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/platform/issuers", label: "Issuers", icon: Building2 },
  { href: "/platform/compliance", label: "Compliance", icon: Shield },
  { href: "/platform/analytics", label: "Analytics", icon: BarChart3 },
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

  return (
    <div className="min-h-screen bg-box">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-full w-64 bg-darkBlack z-40 transition-transform duration-300 shadow-sidebar",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex flex-col h-full p-6">
          {/* Logo */}
          <Link href="/platform/overview" className="flex items-center gap-2 mb-10">
            <CiretaLogo variant="icon" color="teal" className="w-8 h-8" />
            <span className="text-xl font-bold text-white">Cireta</span>
            <Badge variant="dark" size="sm" className="ml-1 bg-gold/20 text-gold">
              Admin
            </Badge>
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
                      ? "bg-darkAqua/20 text-darkAqua"
                      : "text-white/70 hover:text-white hover:bg-white/5"
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
              href="/platform/settings"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
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

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 sidebar-mobile-only"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-box border-b border-darkBlack/5 px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="sidebar-overlay-btn p-2 rounded-lg hover:bg-darkBlack/5 transition-colors"
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
                {title && (
                  <h1 className="text-xl font-semibold text-text">{title}</h1>
                )}
                {description && (
                  <p className="text-sm text-gray-500">{description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {actions}
              <Button variant="outline" size="sm">
                <Wallet className="h-4 w-4 mr-2" />
                0xAdmin...9876
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-8 min-h-screen">{children}</main>
      </div>
    </div>
  );
}
