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
  const { user } = useAuth();

  const isCorporate = user?.investor_type === "corporate";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar variant="light" />

      <div className="flex pt-16 flex-1">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-44 border-r border-black/10 flex-col p-4 sticky top-16 h-[calc(100vh-4rem)]">
          <p className="text-[10px] uppercase tracking-wider text-black/50 font-semibold mb-2 px-2">Buyer</p>
          <nav className="space-y-1">
            {SIDEBAR_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive ? "bg-darkAqua/10 text-darkAqua" : "text-black/60 hover:bg-box hover:text-text"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <main className="p-6">
            <h1 className="text-2xl font-bold text-text tracking-tight">Identity Verification</h1>
            <p className="text-sm text-black/60 mt-1.5 mb-5">
              {isCorporate
                ? "Complete KYB (Know Your Business) verification for your corporate account"
                : "Complete KYC (Know Your Customer) verification for your personal account"}
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
              {/* Sumsub widget — give the iframe room without the extra card padding */}
              <div className="min-w-0">
                <Suspense
                  fallback={
                    <div className="flex justify-center py-12">
                      <Spinner />
                    </div>
                  }
                >
                  <SumsubVerification />
                </Suspense>

                <p className="text-[11px] text-black/40 text-center mt-3">
                  Verification is powered by Sumsub, a globally certified identity verification provider.
                  Cireta does not store raw copies of your identity documents.
                </p>
              </div>

              {/* Side rail — why verification is required */}
              <aside className="space-y-3 lg:sticky lg:top-20 self-start">
                <div className="bg-white rounded-2xl border border-black/10 p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-box flex items-center justify-center shrink-0">
                      <ShieldCheck className="h-4 w-4 text-darkAqua" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-text">Why is this required?</h2>
                      <p className="text-xs text-black/60 mt-1 leading-relaxed">
                        Cireta is regulated. We verify every buyer&apos;s identity before granting
                        access to security-token sales.
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-2.5 mt-3">
                    <li className="flex items-start gap-2.5">
                      <Scale className="h-4 w-4 text-darkAqua mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-text">AML/CFT Compliance</p>
                        <p className="text-[11px] text-black/50 mt-0.5">Anti-money-laundering &amp; counter-terrorism-financing rules</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Globe className="h-4 w-4 text-darkAqua mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-text">Securities Regulation</p>
                        <p className="text-[11px] text-black/50 mt-0.5">Regulated security tokens require verified buyers</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Lock className="h-4 w-4 text-darkAqua mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-text">Data Protection</p>
                        <p className="text-[11px] text-black/50 mt-0.5">Documents are encrypted and processed by our certified KYC partner</p>
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <FileCheck className="h-4 w-4 text-darkAqua mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-text">{isCorporate ? "KYB Process" : "KYC Process"}</p>
                        <p className="text-[11px] text-black/50 mt-0.5">
                          {isCorporate
                            ? "Company docs, beneficial ownership &amp; authorised representative ID"
                            : "Government-issued ID, selfie &amp; proof of address — usually under 3 minutes"}
                        </p>
                      </div>
                    </li>
                  </ul>
                </div>
              </aside>
            </div>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
