"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/atoms";

const FEATURES = [
  "KYC/AML via Sumsub + ONCHAINID",
  "Permissioned transfers with compliance modules",
  "Full audit trail on-chain",
  "Regulatory reporting capabilities",
];

const FEATURE_STATS = [
  { label: "Total Value Locked", value: "$2.4B" },
  { label: "Active Investors", value: "12K+" },
  { label: "Countries", value: "45+" },
  { label: "Compliance Rate", value: "100%" },
];

export function ComplianceFeatures() {
  return (
    <section className="py-20 px-4 bg-black text-white">
      <div className="max-w-inner mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-xxl font-semibold tracking-tight mb-6">
              Institutional-Grade<span className="text-darkAqua"> Compliance</span>
            </h2>
            <p className="text-white/60 text-lg mb-8">
              Every token on Cireta is a fully compliant ERC-3643 security token with
              built-in transfer restrictions and identity verification.
            </p>
            <div className="space-y-4">
              {FEATURES.map((feat, i) => (
                <motion.div key={feat} initial={{ opacity: 1, x: 0 }}
                  whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-darkAqua flex-shrink-0" />
                  <span className="text-white/80">{feat}</span>
                </motion.div>
              ))}
            </div>
            <div className="mt-10">
              <Link href="/register"><Button variant="primary" size="lg">Get Started</Button></Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-darkAqua/20 rounded-3xl blur-[60px]" />
            <div className="relative bg-black/50 border border-white/10 rounded-3xl p-8">
              <div className="grid grid-cols-2 gap-6">
                {FEATURE_STATS.map((s) => (
                  <div key={s.label} className="text-center p-4">
                    <div className="text-2xl font-bold text-darkAqua mb-1">{s.value}</div>
                    <div className="text-sm text-white/50">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
