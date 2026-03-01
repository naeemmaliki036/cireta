"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Package, DollarSign, CheckCircle2, AlertCircle } from "lucide-react";
import { Button, Badge } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";

const MOCK_TOKEN = {
  name: "West African Gold Reserve",
  symbol: "WAGR",
  balance: 1250,
  pricePerToken: 100,
  redeemableTypes: ["physical", "cash"] as const,
};

type FulfillmentMethod = "physical" | "cash";

export default function RedeemTokenPage() {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FulfillmentMethod>("cash");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const numericAmount = parseFloat(amount) || 0;
  const cashValue = numericAmount * MOCK_TOKEN.pricePerToken;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <DashboardLayout title="Redeem Tokens">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-auto text-center py-20"
        >
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold text-text mb-4">
            Redemption Submitted
          </h1>
          <p className="text-gray-500 mb-8">
            Your redemption request has been submitted. We&apos;ll process it
            within 5-7 business days.
          </p>
          <Link href="/portfolio">
            <Button variant="primary" className="w-full">
              Back to Portfolio
            </Button>
          </Link>
        </motion.div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Redeem Tokens">
      <Link
        href="/portfolio"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-text transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Portfolio
      </Link>

      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-8 border border-darkBlack/10"
        >
          <h1 className="text-2xl font-semibold text-text mb-2">
            Redeem {MOCK_TOKEN.name}
          </h1>
          <p className="text-gray-500 mb-8">
            Convert your tokens back to cash or physical delivery
          </p>

          {/* Balance */}
          <div className="bg-box rounded-2xl p-6 mb-8">
            <p className="text-sm text-gray-500 mb-1">Available Balance</p>
            <p className="text-3xl font-bold text-text">
              {MOCK_TOKEN.balance.toLocaleString()}{" "}
              <span className="text-lg text-gray-500">{MOCK_TOKEN.symbol}</span>
            </p>
            <p className="text-sm text-gray-500 mt-1">
              ≈ {formatCurrency(MOCK_TOKEN.balance * MOCK_TOKEN.pricePerToken)}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Amount */}
            <div>
              <label className="block text-sm font-semibold text-text mb-2">
                Amount to Redeem
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  max={MOCK_TOKEN.balance}
                  className="input-field pr-20"
                />
                <button
                  type="button"
                  onClick={() => setAmount(MOCK_TOKEN.balance.toString())}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-darkAqua hover:underline"
                >
                  MAX
                </button>
              </div>
              {numericAmount > 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  Cash value: {formatCurrency(cashValue)}
                </p>
              )}
            </div>

            {/* Fulfillment Method */}
            <div>
              <label className="block text-sm font-semibold text-text mb-3">
                Fulfillment Method
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setMethod("cash")}
                  className={`p-4 rounded-xl border-2 transition-colors ${
                    method === "cash"
                      ? "border-darkAqua bg-darkAqua/5"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <DollarSign
                    className={`w-8 h-8 mx-auto mb-2 ${
                      method === "cash" ? "text-darkAqua" : "text-gray-400"
                    }`}
                  />
                  <p className="font-semibold text-text">Cash Settlement</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Receive USDC to your wallet
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod("physical")}
                  className={`p-4 rounded-xl border-2 transition-colors ${
                    method === "physical"
                      ? "border-darkAqua bg-darkAqua/5"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Package
                    className={`w-8 h-8 mx-auto mb-2 ${
                      method === "physical" ? "text-darkAqua" : "text-gray-400"
                    }`}
                  />
                  <p className="font-semibold text-text">Physical Delivery</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Receive physical gold
                  </p>
                </button>
              </div>
            </div>

            {/* Physical delivery notice */}
            {method === "physical" && (
              <div className="p-4 rounded-xl bg-gold/10 border border-gold/30 flex gap-3">
                <AlertCircle className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-gold text-sm">
                    Physical Delivery Requirements
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Minimum 100 tokens required. Additional shipping and
                    handling fees may apply. Delivery typically takes 2-4 weeks.
                  </p>
                </div>
              </div>
            )}

            {/* Summary */}
            {numericAmount > 0 && (
              <div className="bg-box rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tokens to Redeem</span>
                  <span className="font-semibold">
                    {numericAmount.toLocaleString()} {MOCK_TOKEN.symbol}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Fulfillment Method</span>
                  <span className="font-semibold capitalize">{method}</span>
                </div>
                {method === "cash" && (
                  <div className="flex justify-between text-sm pt-2 border-t border-darkBlack/10">
                    <span className="text-gray-500">You Receive</span>
                    <span className="font-bold text-darkAqua">
                      {formatCurrency(cashValue)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              size="lg"
              isLoading={isSubmitting}
              disabled={numericAmount <= 0 || numericAmount > MOCK_TOKEN.balance}
            >
              Submit Redemption Request
            </Button>
          </form>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
