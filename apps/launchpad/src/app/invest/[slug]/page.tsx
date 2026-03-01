"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Shield, AlertCircle, Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button, Badge } from "@/components/atoms";
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

const STEPS = ["amount", "approve", "confirm"] as const;
const QUICK_AMOUNTS = [500, 1000, 5000, 10000];

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-darkBlack/50">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export default function InvestPage() {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
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
              className="inline-flex items-center gap-2 text-darkBlack/50 hover:text-text transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Project
            </Link>
          )}

          {/* Progress Steps */}
          {step !== "success" && (
            <div className="mb-8">
              <div className="flex items-center justify-between relative">
                {STEPS.map((s, index) => (
                  <div key={s} className="flex flex-col items-center z-10">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        step === s
                          ? "bg-darkAqua text-white"
                          : index < STEPS.indexOf(step as typeof STEPS[number])
                          ? "bg-green-500 text-white"
                          : "bg-darkBlack/10 text-darkBlack/50"
                      }`}
                    >
                      {index < STEPS.indexOf(step as typeof STEPS[number]) ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span className="text-xs mt-2 text-darkBlack/50 capitalize">{s}</span>
                  </div>
                ))}
                <div className="absolute top-5 left-0 right-0 h-0.5 bg-darkBlack/10 -z-0">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${STEPS.indexOf(step as typeof STEPS[number]) * 50}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 border border-darkBlack/10"
          >
            {!isConnected && step === "amount" && (
              <div className="text-center py-8">
                <div className="w-20 h-20 rounded-full bg-darkAqua/10 flex items-center justify-center mx-auto mb-6">
                  <Wallet className="w-10 h-10 text-darkAqua" />
                </div>
                <h1 className="text-2xl font-semibold text-text mb-2">Connect Your Wallet</h1>
                <p className="text-darkBlack/50 mb-8">You need to connect your wallet before investing</p>
                <Button variant="primary" className="w-full" size="lg" onClick={() => openConnectModal?.()}>
                  Connect Wallet
                </Button>
              </div>
            )}

            {isConnected && step === "amount" && (
              <>
                <h1 className="text-2xl font-semibold text-text mb-2">Invest in {MOCK_PROJECT.title}</h1>
                <p className="text-darkBlack/50 mb-8">Enter the amount you wish to invest in USDC</p>
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-text mb-2">Investment Amount (USDC)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="input-field text-2xl font-semibold pr-20"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-darkBlack/40 font-semibold">USDC</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {QUICK_AMOUNTS.map((value) => (
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
                    <SummaryRow label="You Pay" value={formatCurrency(numericAmount)} />
                    <SummaryRow
                      label="You Receive"
                      value={`${tokensToReceive.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${MOCK_PROJECT.tokenSymbol}`}
                    />
                    <SummaryRow label="Price per Token" value={formatCurrency(MOCK_PROJECT.pricePerToken)} />
                  </div>
                )}
                <div className="text-xs text-darkBlack/40 mb-6">
                  Min: {formatCurrency(MOCK_PROJECT.minContribution)} &bull; Max: {formatCurrency(MOCK_PROJECT.maxContribution)}
                </div>
                <Button
                  variant="primary"
                  className="w-full"
                  size="lg"
                  disabled={numericAmount < MOCK_PROJECT.minContribution || numericAmount > MOCK_PROJECT.maxContribution}
                  onClick={() => setStep("approve")}
                >
                  Continue
                </Button>
              </>
            )}

            {step === "approve" && (
              <>
                <h1 className="text-2xl font-semibold text-text mb-2">Approve USDC</h1>
                <p className="text-darkBlack/50 mb-8">Allow the smart contract to spend your USDC</p>
                <div className="bg-box rounded-xl p-6 mb-6 text-center">
                  <Shield className="h-12 w-12 text-darkAqua mx-auto mb-4" />
                  <p className="font-semibold text-text mb-2">Approve {formatCurrency(numericAmount)} USDC</p>
                  <p className="text-sm text-darkBlack/50">This is a one-time approval for this investment</p>
                </div>
                <div className="p-4 rounded-xl bg-gold/10 border border-gold/30 flex gap-3 mb-6">
                  <AlertCircle className="w-5 h-5 text-gold flex-shrink-0" />
                  <p className="text-sm text-darkBlack/60">You will need to confirm this transaction in your wallet</p>
                </div>
                <Button variant="primary" className="w-full" size="lg" onClick={handleApprove} isLoading={isLoading}>
                  {isLoading ? "Approving..." : "Approve USDC"}
                </Button>
              </>
            )}

            {step === "confirm" && (
              <>
                <h1 className="text-2xl font-semibold text-text mb-2">Confirm Investment</h1>
                <p className="text-darkBlack/50 mb-8">Review and confirm your investment details</p>
                <div className="bg-box rounded-xl p-6 space-y-4 mb-6">
                  <SummaryRow label="Project" value={MOCK_PROJECT.title} />
                  <SummaryRow label="Amount" value={formatCurrency(numericAmount)} />
                  <SummaryRow label="Tokens" value={`${tokensToReceive.toLocaleString()} ${MOCK_PROJECT.tokenSymbol}`} />
                  <div className="pt-4 border-t border-darkBlack/10">
                    <SummaryRow label="Network Fee" value="~$0.10" />
                  </div>
                </div>
                <Button variant="primary" className="w-full" size="lg" onClick={handleConfirm} isLoading={isLoading}>
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
                <h1 className="text-2xl font-semibold text-text mb-2">Investment Successful!</h1>
                <p className="text-darkBlack/50 mb-8">
                  You have successfully invested {formatCurrency(numericAmount)} in {MOCK_PROJECT.title}
                </p>
                <div className="bg-box rounded-xl p-6 text-left mb-8 space-y-3 text-sm">
                  <h3 className="font-semibold text-text text-base mb-2">Transaction Summary</h3>
                  <SummaryRow label="Amount Invested" value={formatCurrency(numericAmount)} />
                  <SummaryRow label="Tokens Allocated" value={`${tokensToReceive.toLocaleString()} ${MOCK_PROJECT.tokenSymbol}`} />
                  <SummaryRow label="Status" value={<Badge variant="success">Confirmed</Badge>} />
                </div>
                <div className="space-y-3">
                  <Link href="/portfolio">
                    <Button variant="primary" className="w-full" size="lg">View Portfolio</Button>
                  </Link>
                  <Link href="/explore">
                    <Button variant="outline" className="w-full" size="lg">Explore More Projects</Button>
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
