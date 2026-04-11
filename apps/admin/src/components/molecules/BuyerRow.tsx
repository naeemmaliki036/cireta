"use client";

import React from "react";
import { motion } from "framer-motion";
import { WalletBadge } from "./WalletBadge";
import { KYCBadge, type KYCStatus } from "./KYCBadge";
import { formatCurrency } from "@/lib/utils";

export interface InvestorRowProps {
  walletAddress: string;
  kycStatus: KYCStatus;
  kycLevel: number;
  invested: number;
  tokensAllocated: number;
  tokenSymbol: string;
  index?: number;
  onOTCClick?: () => void;
}

export function InvestorRow({
  walletAddress,
  kycStatus,
  kycLevel,
  invested,
  tokensAllocated,
  tokenSymbol,
  index = 0,
  onOTCClick,
}: InvestorRowProps) {
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.05 }}
      className="table-row table-row-striped"
    >
      <td className="px-6 py-4">
        <WalletBadge address={walletAddress} showExplorer />
      </td>
      <td className="px-6 py-4">
        <KYCBadge status={kycStatus} level={kycLevel} size="sm" />
      </td>
      <td className="px-6 py-4 font-semibold text-text">
        {formatCurrency(invested)}
      </td>
      <td className="px-6 py-4">
        <span className="font-semibold text-darkAqua">
          {tokensAllocated.toLocaleString()} {tokenSymbol}
        </span>
      </td>
      <td className="px-6 py-4">
        <button
          onClick={onOTCClick}
          className="text-sm font-medium text-darkAqua hover:underline"
        >
          OTC Allocate
        </button>
      </td>
    </motion.tr>
  );
}
