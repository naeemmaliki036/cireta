"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, FolderOpen, ShieldCheck, Scale, Lock, Globe, FileCheck } from "lucide-react";
import { Spinner } from "@/components/atoms";
import { Navbar, Footer } from "@/components/organisms";
import { SumsubVerification } from "@/components/organisms/SumsubVerification";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const SIDEBAR_LINKS = [
  { href: "/projects", label: "Sales", icon: ShoppingBag },
  { href: "/portfolio", label: "Portfolio", icon: FolderOpen },
];

export default function VerifyPage() {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuth();

  // Auto-detect verification type from user's investor_type
  const isCorperate = user?.investor_type === "corporate";

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
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <main className="p-6 max-w-6xl">
            <h1 className="text-lg font-semibold text-text mb-1">Identity Verification</h1>
            <p className="text-sm text-gray-500 mb-6">
              {isCorperate
                ? "Complete KYB (Know Your Business) verification for your corporate account"
                : "Complete KYC (Know Your Customer) verification for your personal account"}
            </p>

            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left — Sumsub Widget */}
              <div className="flex-1 min-w-0">
                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                  <Suspense
                    fallback={
                      <div className="flex justify-center py-12">
                        <Spinner />
                      </div>
                    }
                  >
                    <SumsubVerification />
                  </Suspense>
                </div>

                <p className="text-[11px] text-gray-400 text-center mt-4">
                  Verification is powered by Sumsub, a globally certified identity verification provider.
                  Cireta does not store raw copies of your identity documents.
                </p>
              </div>

              {/* Right — Why is verification required? */}
              <div className="w-full lg:w-80 flex-shrink-0">
                <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl border border-gray-100 p-5 sticky top-20">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Why is verification required?</h2>
                      <p className="text-xs text-gray-500 mt-1">
                        Cireta operates under strict regulatory standards for real-world asset tokenization.
                        We are legally required to verify the identity of every buyer before granting access
                        to purchase opportunities.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-2.5 bg-white rounded-xl p-3 border border-gray-100">
                      <Scale className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-gray-800">AML/CFT Compliance</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Anti-money laundering and counter-terrorism financing regulations</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 bg-white rounded-xl p-3 border border-gray-100">
                      <Globe className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-gray-800">Securities Regulation</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Regulated security tokens require verified buyers</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 bg-white rounded-xl p-3 border border-gray-100">
                      <Lock className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-gray-800">Data Protection</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Your data is encrypted at rest and processed by our certified KYC partner</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 bg-white rounded-xl p-3 border border-gray-100">
                      <FileCheck className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-gray-800">{isCorperate ? "KYB Process" : "KYC Process"}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {isCorperate
                            ? "Company incorporation docs, beneficial ownership & authorised representative ID"
                            : "Government-issued ID, selfie verification & proof of address — usually under 3 minutes"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
