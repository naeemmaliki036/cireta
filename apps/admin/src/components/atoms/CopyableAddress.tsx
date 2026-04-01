"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyableAddressProps {
  address: string;
  truncate?: boolean;
  className?: string;
}

export function CopyableAddress({ address, truncate = false, className = "" }: CopyableAddressProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const display = truncate
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono ${className}`}>
      <span className={truncate ? "" : "break-all"}>{display}</span>
      <button
        onClick={handleCopy}
        title={copied ? "Copied!" : "Copy address"}
        className="shrink-0 p-0.5 rounded hover:bg-zinc-200/50 transition-colors"
      >
        {copied
          ? <Check className="h-3 w-3 text-green-500" />
          : <Copy className="h-3 w-3 text-zinc-400 hover:text-zinc-600" />
        }
      </button>
    </span>
  );
}
