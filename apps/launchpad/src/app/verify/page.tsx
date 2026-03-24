"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Shield, Building2, AlertCircle } from "lucide-react";
import { Navbar, Footer } from "@/components/organisms";
import { SumsubVerification } from "@/components/organisms/SumsubVerification";
import { Spinner, Button } from "@/components/atoms";

type Tab = "personal" | "corporate";

function VerifyErrorBoundaryFallback() {
  return (
    <div className="text-center py-12">
      <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
      <p className="text-darkBlack/60 text-sm mb-4">Failed to load verification. Please try again.</p>
      <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
        Retry
      </Button>
    </div>
  );
}

export default function VerifyPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("personal");
  const [error, setError] = useState(false);

  return (
    <div className="min-h-screen bg-box">
      <Navbar variant="light" />
      <div className="pt-32 pb-20 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto"
        >
          {/* Tabs */}
          <div className="flex gap-2 mb-6 bg-white rounded-full p-1 border border-darkBlack/10 max-w-sm mx-auto">
            <button
              onClick={() => setTab("personal")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-full py-3 px-4 text-sm font-semibold transition-colors duration-200 ${
                tab === "personal"
                  ? "bg-darkAqua text-white"
                  : "text-darkBlack/50 hover:text-darkBlack"
              }`}
            >
              <Shield className="h-4 w-4" />
              Personal
            </button>
            <button
              onClick={() => {
                setTab("corporate");
                router.push("/verify/corporate");
              }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-full py-3 px-4 text-sm font-semibold transition-colors duration-200 ${
                tab === "corporate"
                  ? "bg-darkAqua text-white"
                  : "text-darkBlack/50 hover:text-darkBlack"
              }`}
            >
              <Building2 className="h-4 w-4" />
              Corporate
            </button>
          </div>

          {/* Personal KYC */}
          <div className="bg-white rounded-3xl p-8 border border-darkBlack/10">
            {error ? (
              <VerifyErrorBoundaryFallback />
            ) : (
              <Suspense fallback={<div className="flex justify-center py-12"><Spinner /></div>}>
                <SumsubVerification />
              </Suspense>
            )}
          </div>
        </motion.div>
      </div>
      <Footer />
    </div>
  );
}
