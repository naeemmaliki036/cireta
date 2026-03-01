"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/atoms";
import { VestingCard } from "@/components/organisms";
import { TxRow } from "@/components/molecules";
import { DashboardLayout } from "@/components/templates";

const MOCK_VESTING = {
  tokenName: "West African Gold Reserve",
  tokenSymbol: "WAGR",
  totalAmount: 1250,
  claimedAmount: 500,
  claimableAmount: 125,
  cliffEnd: new Date("2024-03-01"),
  vestingEnd: new Date("2025-03-01"),
  lastClaimDate: new Date("2024-02-15"),
};

const MOCK_TRANSACTIONS: any[] = [
  {
    txHash: "0x1234567890abcdef1234567890abcdef12345678",
    type: "claim",
    status: "confirmed",
    amount: 250,
    tokenSymbol: "WAGR",
    timestamp: new Date("2024-02-15"),
  },
  {
    txHash: "0xabcdef1234567890abcdef1234567890abcdef12",
    type: "claim",
    status: "confirmed",
    amount: 250,
    tokenSymbol: "WAGR",
    timestamp: new Date("2024-01-15"),
  },
];

export default function ClaimTokenPage() {
  const [isClaimLoading, setIsClaimLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleClaim = async () => {
    setIsClaimLoading(true);
    // Simulate claim transaction
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsClaimLoading(false);
    setShowSuccess(true);
  };

  if (showSuccess) {
    return (
      <DashboardLayout title="Claim Tokens">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-auto text-center py-20"
        >
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold text-text mb-4">
            Tokens Claimed!
          </h1>
          <p className="text-gray-500 mb-8">
            125 WAGR tokens have been successfully claimed to your wallet.
          </p>
          <div className="space-y-3">
            <Button
              variant="primary"
              className="w-full"
              onClick={() => setShowSuccess(false)}
            >
              Claim More
            </Button>
            <Link href="/portfolio">
              <Button variant="outline" className="w-full">
                Back to Portfolio
              </Button>
            </Link>
          </div>
        </motion.div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Claim Tokens">
      <Link
        href="/portfolio"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-text transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Portfolio
      </Link>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Vesting Card */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <VestingCard
            {...MOCK_VESTING}
            onClaim={handleClaim}
            isClaimLoading={isClaimLoading}
          />
        </motion.div>

        {/* Claim History */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white rounded-3xl border border-darkBlack/10 overflow-hidden"
        >
          <div className="p-6 border-b border-darkBlack/5">
            <h2 className="text-xl font-semibold text-text">Claim History</h2>
          </div>
          <div>
            {MOCK_TRANSACTIONS.map((tx) => (
              <TxRow key={tx.txHash} {...tx} />
            ))}
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
