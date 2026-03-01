"use client";

import React from "react";
import { ExternalLink, CheckCircle2, Clock, XCircle, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { cn, formatCurrency, truncateAddress } from "@/lib/utils";

export type TxStatus = "pending" | "confirmed" | "failed";
export type TxType = "contribution" | "claim" | "refund" | "transfer";

export interface TxRowProps {
  txHash: string;
  type: TxType;
  status: TxStatus;
  amount: number;
  tokenSymbol?: string;
  timestamp: Date;
  chainId?: number;
  className?: string;
}

const TYPE_CONFIG = {
  contribution: {
    icon: ArrowUpRight,
    label: "Contribution",
    color: "text-darkAqua",
  },
  claim: {
    icon: ArrowDownLeft,
    label: "Claim",
    color: "text-green-600",
  },
  refund: {
    icon: ArrowDownLeft,
    label: "Refund",
    color: "text-gold",
  },
  transfer: {
    icon: ArrowUpRight,
    label: "Transfer",
    color: "text-gray-600",
  },
};

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    label: "Pending",
    color: "text-gold",
  },
  confirmed: {
    icon: CheckCircle2,
    label: "Confirmed",
    color: "text-green-600",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    color: "text-red-600",
  },
};

const EXPLORER_URLS: Record<number, string> = {
  1: "https://etherscan.io/tx/",
  8453: "https://basescan.org/tx/",
  137: "https://polygonscan.com/tx/",
  42161: "https://arbiscan.io/tx/",
};

export function TxRow({
  txHash,
  type,
  status,
  amount,
  tokenSymbol = "USDC",
  timestamp,
  chainId = 8453,
  className,
}: TxRowProps) {
  const typeConfig = TYPE_CONFIG[type];
  const statusConfig = STATUS_CONFIG[status];
  const TypeIcon = typeConfig.icon;
  const StatusIcon = statusConfig.icon;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openExplorer = () => {
    const baseUrl = EXPLORER_URLS[chainId] || EXPLORER_URLS[8453];
    window.open(`${baseUrl}${txHash}`, "_blank");
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between py-4 px-4 border-b border-darkBlack/5 hover:bg-box/50 transition-colors",
        className
      )}
    >
      {/* Left: Type and Hash */}
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full bg-box",
            typeConfig.color
          )}
        >
          <TypeIcon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium text-text">{typeConfig.label}</p>
          <button
            onClick={openExplorer}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-darkAqua transition-colors"
          >
            <span className="font-mono">{truncateAddress(txHash)}</span>
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Center: Amount */}
      <div className="text-right">
        <p className="font-semibold text-text">
          {type === "contribution" ? "-" : "+"}
          {formatCurrency(amount)} {tokenSymbol}
        </p>
        <p className="text-sm text-gray-500">{formatDate(timestamp)}</p>
      </div>

      {/* Right: Status */}
      <div className={cn("flex items-center gap-1", statusConfig.color)}>
        <StatusIcon className="h-4 w-4" />
        <span className="text-sm font-medium">{statusConfig.label}</span>
      </div>
    </div>
  );
}
