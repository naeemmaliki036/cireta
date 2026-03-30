"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShoppingBag, FolderOpen, CheckCircle2, Users,
  Shield, Building2, AlertCircle,
} from "lucide-react";
import Image from "next/image";
import { Spinner, Button } from "@/components/atoms";
import { SumsubVerification } from "@/components/organisms/SumsubVerification";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const SIDEBAR_LINKS = [
  { href: "/projects", label: "Sales", icon: ShoppingBag },
  { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
];

type Tab = "personal" | "corporate";

function VerifyErrorFallback() {
  return (
    <div className="text-center py-12">
      <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-4" />
      <p className="text-gray-500 text-sm mb-4">
        Failed to load verification. Please try again.
      </p>
      <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
        Retry
      </Button>
    </div>
  );
}

export default function VerifyPage() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("personal");
  const [error, setError] = useState(false);

  return (
    <div className="flex min-h-screen bg-white">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-48 border-r border-gray-100 flex-col p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2 mb-8">
          <Link href="/" className="flex items-center">
            <Image src="/images/logo/cireta-colored.png" alt="Cireta" width={120} height={32} className="h-8 w-auto" />
          </Link>
        </div>

        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2 px-2">Investor</p>
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
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-gray-100 px-6 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-text">Identity Verification</h1>
            <div className="flex items-center gap-2">
              <Link
                href="/verify"
                className="inline-flex items-center gap-1.5 border border-gray-200 rounded-full px-4 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Get Verified
              </Link>
              {!isAuthenticated && (
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 bg-darkBlack text-white rounded-full px-4 py-1.5 text-xs font-medium hover:bg-darkBlack/90 transition-colors"
                >
                  <Users className="h-3.5 w-3.5" /> Register
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="p-6 max-w-2xl">
          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-gray-50 rounded-full p-1 max-w-sm">
            <button
              onClick={() => setTab("personal")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-full py-2.5 px-4 text-sm font-medium transition-colors",
                tab === "personal"
                  ? "bg-darkBlack text-white"
                  : "text-gray-500 hover:text-text"
              )}
            >
              <Shield className="h-3.5 w-3.5" />
              Personal
            </button>
            <button
              onClick={() => {
                setTab("corporate");
                router.push("/verify/corporate");
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-full py-2.5 px-4 text-sm font-medium transition-colors",
                tab === "corporate"
                  ? "bg-darkBlack text-white"
                  : "text-gray-500 hover:text-text"
              )}
            >
              <Building2 className="h-3.5 w-3.5" />
              Corporate
            </button>
          </div>

          {/* Sumsub Widget */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            {error ? (
              <VerifyErrorFallback />
            ) : (
              <Suspense
                fallback={
                  <div className="flex justify-center py-12">
                    <Spinner />
                  </div>
                }
              >
                <SumsubVerification />
              </Suspense>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
