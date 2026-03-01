"use client";

import { Copy, Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import { cn, truncateAddress } from "@/lib/utils";

export interface WalletBadgeProps {
  address: string;
  isPrimary?: boolean;
  showCopy?: boolean;
  showExplorer?: boolean;
  className?: string;
}

export function WalletBadge({
  address,
  isPrimary = false,
  showCopy = true,
  showExplorer = true,
  className,
}: WalletBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const explorerUrl = `https://basescan.org/address/${address}`;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-darkAqua to-gold flex items-center justify-center">
          <span className="text-white text-xs font-bold">
            {address.slice(2, 4).toUpperCase()}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm text-text">
              {truncateAddress(address, 6)}
            </code>
            {isPrimary && (
              <span className="text-xs bg-darkAqua/10 text-darkAqua px-2 py-0.5 rounded-full font-medium">
                Primary
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {showCopy && (
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-box rounded-lg transition-colors"
            title="Copy address"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4 text-gray-400" />
            )}
          </button>
        )}
        {showExplorer && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-box rounded-lg transition-colors"
            title="View on explorer"
          >
            <ExternalLink className="h-4 w-4 text-gray-400" />
          </a>
        )}
      </div>
    </div>
  );
}
