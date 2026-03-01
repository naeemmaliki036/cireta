"use client";

import React from "react";
import { Navbar, Footer } from "@/components/organisms";
import { cn } from "@/lib/utils";

export interface PageLayoutProps {
  children: React.ReactNode;
  variant?: "dark" | "light";
  showFooter?: boolean;
  className?: string;
}

export function PageLayout({
  children,
  variant = "dark",
  showFooter = true,
  className,
}: PageLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar variant={variant} />
      <main className={cn("flex-1", className)}>{children}</main>
      {showFooter && <Footer />}
    </div>
  );
}
