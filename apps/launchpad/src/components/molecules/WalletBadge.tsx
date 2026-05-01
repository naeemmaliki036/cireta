"use client";

import React from "react";
import { Wallet, Copy, ExternalLink, Check } from "lucide-react";
import { cn, truncateAddress } from "@/lib/utils";
import { useState } from "react";
import { getAddressUrl } from "@/lib/contracts/addresses";

export interface WalletBadgeProps {
  address: string;
  isPrimary?: boolean;
  chainId?: number;
  className?: string;
  showCopy?: boolean;
  showExplorer?: boolean;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  137: "Polygon",
  42161: "Arbitrum",
};


export function WalletBadge({
  address,
  isPrimary = false,
  chainId = 8453,
  className,
  showCopy = true,
  showExplorer = true,
}: WalletBadgeProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openExplorer = () => {
    const _addrUrl = getAddressUrl(chainId, address); if (_addrUrl) window.open(_addrUrl, "_blank");
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-box border border-black/10",
        isPrimary && "border-darkAqua bg-darkAqua/5",
        className
      )}
    >
      <Wallet className="h-4 w-4 text-darkAqua" />
      <span className="font-mono text-sm">{truncateAddress(address)}</span>

      {isPrimary && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-darkAqua text-white font-medium">
          Primary
        </span>
      )}

      <span className="text-xs text-black/40">
        {CHAIN_NAMES[chainId] || "Unknown"}
      </span>

      {showCopy && (
        <button
          onClick={copyToClipboard}
          className="p-1 hover:bg-black/5 rounded transition-colors"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-darkAqua" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-black/40" />
          )}
        </button>
      )}

      {showExplorer && (
        <button
          onClick={openExplorer}
          className="p-1 hover:bg-black/5 rounded transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5 text-black/40" />
        </button>
      )}
    </div>
  );
}
