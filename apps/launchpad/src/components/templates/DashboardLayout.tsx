"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  Clock,
  FileText,
  User,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { CiretaLogo, Button } from "@/components/atoms";
import { cn } from "@/lib/utils";
import { useState } from "react";

const SIDEBAR_LINKS = [
  { href: "/portfolio", label: "Holdings", icon: LayoutDashboard },
  { href: "/portfolio/vesting", label: "Vesting", icon: Clock },
  { href: "/portfolio/transactions", label: "Transactions", icon: FileText },
  { href: "/account", label: "Account", icon: User },
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-box">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-full w-64 bg-darkBlack z-40 transition-transform duration-300 lg:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full p-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 mb-10">
            <CiretaLogo variant="icon" color="teal" className="w-8 h-8" />
            <span className="text-xl font-bold text-white">Cireta</span>
          </Link>

          {/* Navigation */}
          <nav className="flex-1 space-y-1">
            {SIDEBAR_LINKS.map((link) => {
              const isActive = pathname === link.href;
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
          <div className="mt-auto pt-6 border-t border-white/10">
            <Link
              href="/projects"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
            >
              <Wallet className="h-5 w-5" />
              Explore Projects
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
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-box border-b border-darkBlack/5 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-darkBlack/5 transition-colors"
              >
                <Menu className="h-6 w-6" />
              </button>
              <div>
                {title && (
                  <h1 className="text-xl font-semibold text-text">{title}</h1>
                )}
                {description && (
                  <p className="text-sm text-gray-500">{description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm">
                <Wallet className="h-4 w-4 mr-2" />
                Wallet
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
