"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Shield, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button, Input, Badge, ProgressBar } from "@/components/atoms";
import { cn, formatCurrency } from "@/lib/utils";

export interface InvestSidebarProps {
  projectName: string;
  tokenSymbol: string;
  pricePerToken: number;
  minContribution: number;
  maxContribution: number;
  currentRaised: number;
  targetAmount: number;
  isKYCVerified: boolean;
  kycLevel: number;
  requiredKYCLevel: number;
  isWalletConnected: boolean;
  onInvest: (amount: number) => Promise<void>;
  onConnectWallet: () => void;
  onStartKYC: () => void;
  className?: string;
}

export function InvestSidebar({
  projectName,
  tokenSymbol,
  pricePerToken,
  minContribution,
  maxContribution,
  currentRaised,
  targetAmount,
  isKYCVerified,
  kycLevel,
  requiredKYCLevel,
  isWalletConnected,
  onInvest,
  onConnectWallet,
  onStartKYC,
  className,
}: InvestSidebarProps) {
  const [amount, setAmount] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numericAmount = parseFloat(amount) || 0;
  const tokensToReceive = numericAmount / pricePerToken;
  const progress = (currentRaised / targetAmount) * 100;
  const canInvest =
    isWalletConnected && isKYCVerified && kycLevel >= requiredKYCLevel;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
      setError(null);
    }
  };

  const handleInvest = async () => {
    if (numericAmount < minContribution) {
      setError(`Minimum contribution is ${formatCurrency(minContribution)}`);
      return;
    }
    if (numericAmount > maxContribution) {
      setError(`Maximum contribution is ${formatCurrency(maxContribution)}`);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await onInvest(numericAmount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setIsLoading(false);
    }
  };

  const setQuickAmount = (value: number) => {
    setAmount(value.toString());
    setError(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "bg-white rounded-3xl border border-black/10 shadow-tooltip p-6 sticky top-24",
        className
      )}
    >
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-text mb-2">
          Buy {projectName}
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="default" size="sm">
            {formatCurrency(pricePerToken)} / {tokenSymbol}
          </Badge>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-500">Funding Progress</span>
          <span className="font-semibold">{progress.toFixed(1)}%</span>
        </div>
        <ProgressBar value={progress} size="md" />
        <div className="flex justify-between text-sm mt-2">
          <span className="text-gray-500">
            Raised: <span className="font-semibold text-text">{formatCurrency(currentRaised)}</span>
          </span>
          <span className="text-gray-500">
            Target: <span className="font-semibold text-text">{formatCurrency(targetAmount)}</span>
          </span>
        </div>
      </div>

      {/* Verification Status */}
      {!isWalletConnected ? (
        <div className="bg-box rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="h-5 w-5 text-darkAqua" />
            <span className="font-medium">Connect Wallet</span>
          </div>
          <p className="text-sm text-gray-500 mb-3">
            Connect your wallet to start buying in this project.
          </p>
          <Button variant="primary" className="w-full" onClick={onConnectWallet}>
            Connect Wallet
          </Button>
        </div>
      ) : !isKYCVerified || kycLevel < requiredKYCLevel ? (
        <div className="bg-box rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="h-5 w-5 text-darkAqua" />
            <span className="font-medium">KYC Required</span>
          </div>
          <p className="text-sm text-gray-500 mb-3">
            Complete KYC verification (Level {requiredKYCLevel}) to buy in this project.
          </p>
          <Button variant="primary" className="w-full" onClick={onStartKYC}>
            Start Verification
          </Button>
        </div>
      ) : (
        <div className="bg-green-50 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="text-green-700 font-medium">
            Verified - Ready to Buy
          </span>
        </div>
      )}

      {/* Purchase Form */}
      {canInvest && (
        <>
          <div className="mb-4">
            <Input
              label="Purchase Amount (USDC)"
              type="text"
              placeholder="0.00"
              value={amount}
              onChange={handleAmountChange}
              error={error || undefined}
            />
            <div className="flex gap-2 mt-2">
              {[100, 500, 1000, 5000].map((value) => (
                <button
                  key={value}
                  onClick={() => setQuickAmount(value)}
                  className="flex-1 py-1.5 text-sm font-medium text-darkAqua bg-darkAqua/10 rounded-lg hover:bg-darkAqua/20 transition-colors"
                >
                  ${value}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          {numericAmount > 0 && (
            <div className="bg-box rounded-xl p-4 mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">You Pay</span>
                <span className="font-semibold">{formatCurrency(numericAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">You Receive</span>
                <span className="font-semibold">
                  {tokensToReceive.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}{" "}
                  {tokenSymbol}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Price per Token</span>
                <span>{formatCurrency(pricePerToken)}</span>
              </div>
            </div>
          )}

          {/* Limits */}
          <div className="text-xs text-gray-500 mb-4 space-y-1">
            <p>Min: {formatCurrency(minContribution)}</p>
            <p>Max: {formatCurrency(maxContribution)}</p>
          </div>

          <Button
            variant="primary"
            className="w-full"
            onClick={handleInvest}
            isLoading={isLoading}
            disabled={numericAmount <= 0}
          >
            {isLoading ? "Processing..." : "Buy Now"}
          </Button>
        </>
      )}

      {/* Security Note */}
      <p className="text-xs text-gray-400 text-center mt-4 flex items-center justify-center gap-1">
        <Shield className="h-3 w-3" />
        Secured by compliant smart contracts
      </p>
    </motion.div>
  );
}
