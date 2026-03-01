"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Shield,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button, Badge, ProgressBar, Input } from "@/components/atoms";
import { Navbar, Footer } from "@/components/organisms";
import { formatCurrency } from "@/lib/utils";

const MOCK_PROJECT = {
  title: "West African Gold Reserve",
  slug: "west-african-gold",
  tokenSymbol: "WAGR",
  pricePerToken: 100,
  minContribution: 100,
  maxContribution: 50000,
  currentRaised: 2450000,
  targetAmount: 5000000,
};

type Step = "amount" | "approve" | "confirm" | "success";

export default function InvestPage() {
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const numericAmount = parseFloat(amount) || 0;
  const tokensToReceive = numericAmount / MOCK_PROJECT.pricePerToken;

  const handleApprove = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsLoading(false);
    setStep("confirm");
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsLoading(false);
    setStep("success");
  };

  return (
    <div className="min-h-screen bg-box">
      <Navbar variant="light" />

      <div className="pt-32 pb-20 px-4">
        <div className="max-w-xl mx-auto">
          {step !== "success" && (
            <Link
              href={`/project/${MOCK_PROJECT.slug}`}
              className="inline-flex items-center gap-2 text-gray-500 hover:text-text transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Project
            </Link>
          )}

          {/* Progress Steps */}
          {step !== "success" && (
            <div className="mb-8">
              <div className="flex items-center justify-between relative">
                {["amount", "approve", "confirm"].map((s, index) => (
                  <div key={s} className="flex flex-col items-center z-10">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        step === s
                          ? "bg-darkAqua text-white"
                          : index <
                            ["amount", "approve", "confirm"].indexOf(step)
                          ? "bg-green-500 text-white"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {index < ["amount", "approve", "confirm"].indexOf(step) ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span className="text-xs mt-2 text-gray-500 capitalize">
                      {s}
                    </span>
                  </div>
                ))}
                <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 -z-0">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{
                      width: `${
                        ["amount", "approve", "confirm"].indexOf(step) * 50
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step Content */}
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 border border-darkBlack/10"
          >
            {step === "amount" && (
              <>
                <h1 className="text-2xl font-semibold text-text mb-2">
                  Invest in {MOCK_PROJECT.title}
                </h1>
                <p className="text-gray-500 mb-8">
                  Enter the amount you wish to invest in USDC
                </p>

                <div className="mb-6">
                  <label className="block text-sm font-semibold text-text mb-2">
                    Investment Amount (USDC)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="input-field text-2xl font-semibold pr-20"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">
                      USDC
                    </span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {[500, 1000, 5000, 10000].map((value) => (
                      <button
                        key={value}
                        onClick={() => setAmount(value.toString())}
                        className="flex-1 py-2 text-sm font-medium text-darkAqua bg-darkAqua/10 rounded-lg hover:bg-darkAqua/20 transition-colors"
                      >
                        ${value.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                {numericAmount > 0 && (
                  <div className="bg-box rounded-xl p-4 space-y-3 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">You Pay</span>
                      <span className="font-semibold">
                        {formatCurrency(numericAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">You Receive</span>
                      <span className="font-semibold">
                        {tokensToReceive.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}{" "}
                        {MOCK_PROJECT.tokenSymbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Price per Token</span>
                      <span>{formatCurrency(MOCK_PROJECT.pricePerToken)}</span>
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-400 mb-6">
                  Min: {formatCurrency(MOCK_PROJECT.minContribution)} • Max:{" "}
                  {formatCurrency(MOCK_PROJECT.maxContribution)}
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  size="lg"
                  disabled={
                    numericAmount < MOCK_PROJECT.minContribution ||
                    numericAmount > MOCK_PROJECT.maxContribution
                  }
                  onClick={() => setStep("approve")}
                >
                  Continue
                </Button>
              </>
            )}

            {step === "approve" && (
              <>
                <h1 className="text-2xl font-semibold text-text mb-2">
                  Approve USDC
                </h1>
                <p className="text-gray-500 mb-8">
                  Allow the smart contract to spend your USDC
                </p>

                <div className="bg-box rounded-xl p-6 mb-6 text-center">
                  <Shield className="h-12 w-12 text-darkAqua mx-auto mb-4" />
                  <p className="font-semibold text-text mb-2">
                    Approve {formatCurrency(numericAmount)} USDC
                  </p>
                  <p className="text-sm text-gray-500">
                    This is a one-time approval for this investment
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-gold/10 border border-gold/30 flex gap-3 mb-6">
                  <AlertCircle className="w-5 h-5 text-gold flex-shrink-0" />
                  <p className="text-sm text-gray-600">
                    You will need to confirm this transaction in your wallet
                  </p>
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  size="lg"
                  onClick={handleApprove}
                  isLoading={isLoading}
                >
                  {isLoading ? "Approving..." : "Approve USDC"}
                </Button>
              </>
            )}

            {step === "confirm" && (
              <>
                <h1 className="text-2xl font-semibold text-text mb-2">
                  Confirm Investment
                </h1>
                <p className="text-gray-500 mb-8">
                  Review and confirm your investment details
                </p>

                <div className="bg-box rounded-xl p-6 space-y-4 mb-6">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Project</span>
                    <span className="font-semibold">{MOCK_PROJECT.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Amount</span>
                    <span className="font-semibold">
                      {formatCurrency(numericAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tokens</span>
                    <span className="font-semibold">
                      {tokensToReceive.toLocaleString()}{" "}
                      {MOCK_PROJECT.tokenSymbol}
                    </span>
                  </div>
                  <div className="pt-4 border-t border-darkBlack/10">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Network Fee</span>
                      <span className="font-semibold">~$0.10</span>
                    </div>
                  </div>
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  size="lg"
                  onClick={handleConfirm}
                  isLoading={isLoading}
                >
                  {isLoading ? "Confirming..." : "Confirm Investment"}
                </Button>
              </>
            )}

            {step === "success" && (
              <div className="text-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", duration: 0.5 }}
                  className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6"
                >
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </motion.div>

                <h1 className="text-2xl font-semibold text-text mb-2">
                  Investment Successful!
                </h1>
                <p className="text-gray-500 mb-8">
                  You have successfully invested {formatCurrency(numericAmount)}{" "}
                  in {MOCK_PROJECT.title}
                </p>

                <div className="bg-box rounded-xl p-6 text-left mb-8">
                  <h3 className="font-semibold text-text mb-4">
                    Transaction Summary
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Amount Invested</span>
                      <span className="font-semibold">
                        {formatCurrency(numericAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tokens Allocated</span>
                      <span className="font-semibold">
                        {tokensToReceive.toLocaleString()}{" "}
                        {MOCK_PROJECT.tokenSymbol}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status</span>
                      <Badge variant="success">Confirmed</Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Link href="/portfolio">
                    <Button variant="primary" className="w-full" size="lg">
                      View Portfolio
                    </Button>
                  </Link>
                  <Link href="/explore">
                    <Button variant="outline" className="w-full" size="lg">
                      Explore More Projects
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
