"use client";

import React from "react";
import { motion } from "framer-motion";
import { Clock, Unlock, Lock, Calendar } from "lucide-react";
import { Button, Badge, ProgressBar } from "@/components/atoms";
import { cn } from "@/lib/utils";

export interface VestingCardProps {
  tokenName: string;
  tokenSymbol: string;
  totalAmount: number;
  claimedAmount: number;
  claimableAmount: number;
  cliffEnd: Date;
  vestingEnd: Date;
  lastClaimDate?: Date;
  onClaim?: () => void;
  isClaimLoading?: boolean;
  className?: string;
}

export function VestingCard({
  tokenName,
  tokenSymbol,
  totalAmount,
  claimedAmount,
  claimableAmount,
  cliffEnd,
  vestingEnd,
  lastClaimDate,
  onClaim,
  isClaimLoading = false,
  className,
}: VestingCardProps) {
  const now = new Date();
  const isCliffPassed = now >= cliffEnd;
  const isVestingComplete = now >= vestingEnd;
  // Lockup-only schedules unlock all at once at the cliff (cliff_end ==
  // vesting_end). Differentiate the badge label so investors aren't told
  // their lockup-only position is "vesting".
  const isLockup = Math.abs(vestingEnd.getTime() - cliffEnd.getTime()) < 1000;
  const vestedPercent = isVestingComplete
    ? 100
    : isCliffPassed
    ? Math.min(
        ((now.getTime() - cliffEnd.getTime()) /
          (vestingEnd.getTime() - cliffEnd.getTime())) *
          100,
        100
      )
    : 0;

  const claimedPercent = (claimedAmount / totalAmount) * 100;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getTimeRemaining = (date: Date) => {
    const diff = date.getTime() - now.getTime();
    if (diff <= 0) return "Completed";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-box rounded-3xl p-6 border border-black/10",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-text">{tokenName}</h3>
          <p className="text-black/50">{tokenSymbol}</p>
        </div>
        {isVestingComplete ? (
          <Badge variant="active">
            <Unlock className="h-3 w-3 mr-1" />
            {isLockup ? "Fully Unlocked" : "Fully Vested"}
          </Badge>
        ) : isCliffPassed ? (
          <Badge variant="active">
            <Clock className="h-3 w-3 mr-1" />
            {isLockup ? "Unlocked" : "Vesting"}
          </Badge>
        ) : (
          <Badge variant="pending">
            <Lock className="h-3 w-3 mr-1" />
            {isLockup ? "Locked" : "Cliff Period"}
          </Badge>
        )}
      </div>

      {/* Total Allocation */}
      <div className="mb-6">
        <p className="text-sm text-black/50 mb-1">Total Allocation</p>
        <p className="text-3xl font-bold text-darkAqua">
          {totalAmount.toLocaleString()} <span className="text-lg">{tokenSymbol}</span>
        </p>
      </div>

      {/* Vesting Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-black/50">Vested Progress</span>
          <span className="font-semibold">{vestedPercent.toFixed(1)}%</span>
        </div>
        <ProgressBar value={vestedPercent} size="md" />
      </div>

      {/* Claimed Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-black/50">Claimed</span>
          <span className="font-semibold">
            {claimedAmount.toLocaleString()} / {totalAmount.toLocaleString()}
          </span>
        </div>
        <div className="bg-[#b2b7b81a] rounded-[100px] overflow-hidden h-[8px]">
          <div
            className="h-[8px] bg-darkAqua rounded-[100px]"
            style={{ width: `${claimedPercent}%` }}
          />
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4">
          <div className="flex items-center gap-2 text-black/50 mb-1">
            <Calendar className="h-4 w-4" />
            <span className="text-xs">Cliff End</span>
          </div>
          <p className="font-semibold text-sm">{formatDate(cliffEnd)}</p>
          {!isCliffPassed && (
            <p className="text-xs text-darkAqua">{getTimeRemaining(cliffEnd)}</p>
          )}
        </div>
        <div className="bg-white rounded-xl p-4">
          <div className="flex items-center gap-2 text-black/50 mb-1">
            <Calendar className="h-4 w-4" />
            <span className="text-xs">Vesting End</span>
          </div>
          <p className="font-semibold text-sm">{formatDate(vestingEnd)}</p>
          {!isVestingComplete && (
            <p className="text-xs text-darkAqua">{getTimeRemaining(vestingEnd)}</p>
          )}
        </div>
      </div>

      {/* Claimable */}
      {claimableAmount > 0 && (
        <div className="bg-darkAqua/10 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-darkAqua font-medium">
                Available to Claim
              </p>
              <p className="text-2xl font-bold text-darkAqua">
                {claimableAmount.toLocaleString()} {tokenSymbol}
              </p>
            </div>
            <Button
              variant="primary"
              onClick={onClaim}
              isLoading={isClaimLoading}
            >
              Claim Now
            </Button>
          </div>
        </div>
      )}

      {/* Last Claim */}
      {lastClaimDate && (
        <p className="text-sm text-black/40 text-center">
          Last claimed on {formatDate(lastClaimDate)}
        </p>
      )}
    </motion.div>
  );
}
