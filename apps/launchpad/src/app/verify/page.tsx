"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Shield, Building2 } from "lucide-react";
import { Navbar, Footer } from "@/components/organisms";
import { SumsubVerification } from "@/components/organisms/SumsubVerification";

type Tab = "personal" | "corporate";

export default function VerifyPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("personal");

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
            <SumsubVerification />
          </div>
        </motion.div>
      </div>
      <Footer />
    </div>
  );
}
