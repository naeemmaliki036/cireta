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
    <span className={`relative inline-flex items-center gap-1.5 font-mono ${className}`}>
      <span className={truncate ? "" : "break-all"}>{display}</span>
      <button
        onClick={handleCopy}
        title={copied ? "Copied!" : "Copy address"}
        className="shrink-0 p-0.5 rounded hover:bg-black/5 transition-colors cursor-pointer"
      >
        {copied
          ? <Check className="h-3 w-3 text-green-500" />
          : <Copy className="h-3 w-3 text-gray-400 hover:text-gray-600" />
        }
      </button>
      {copied && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-sans font-medium bg-black text-white rounded shadow-md whitespace-nowrap pointer-events-none z-10">
          Copied!
        </span>
      )}
    </span>
  );
}
