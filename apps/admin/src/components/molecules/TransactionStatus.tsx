"use client";

import { ExternalLink, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface TransactionStatusProps {
  isPending: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  txHash: string | null;
  txUrl: string | null;
  error: string | null;
  successMessage?: string;
}

/**
 * Displays the current state of an on-chain transaction.
 * Shows wallet pending, confirming, success, or error states.
 */
export function TransactionStatus({
  isPending,
  isConfirming,
  isConfirmed,
  txHash,
  txUrl,
  error,
  successMessage = "Transaction confirmed on-chain",
}: TransactionStatusProps) {
  if (!isPending && !isConfirming && !isConfirmed && !error) return null;

  return (
    <div className="space-y-2 mt-3">
      {isPending && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          <span>Waiting for wallet signature...</span>
        </div>
      )}

      {isConfirming && (
        <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <span>Transaction submitted. Waiting for confirmation...</span>
            {txHash && txUrl && (
              <a
                href={txUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-1"
              >
                <span className="font-mono">{txHash.slice(0, 10)}...{txHash.slice(-8)}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {isConfirmed && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <div className="flex-1">
            <span>{successMessage}</span>
            {txHash && txUrl && (
              <a
                href={txUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-green-500 hover:text-green-700 mt-1"
              >
                <span className="font-mono">{txHash.slice(0, 10)}...{txHash.slice(-8)}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
