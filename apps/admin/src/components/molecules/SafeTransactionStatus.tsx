"use client";

import { ExternalLink, Loader2, CheckCircle2, XCircle, Shield, Clock, Users } from "lucide-react";

export type SafeTxState =
  | "idle"
  | "proposing"      // Encoding + signing the Safe meta-transaction
  | "proposed"        // Submitted to Safe transaction service
  | "awaitingSignatures" // Other owners need to sign
  | "executing"       // Threshold reached, executing on-chain
  | "confirmed"       // Executed and confirmed on-chain
  | "error";

interface SafeTransactionStatusProps {
  state: SafeTxState;
  safeTxHash: string | null;
  safeTxUrl: string | null;
  /** On-chain tx hash (available after execution) */
  onChainTxHash: string | null;
  onChainTxUrl: string | null;
  /** Signature progress */
  confirmations: number;
  threshold: number;
  error: string | null;
  successMessage?: string;
  /** Called to refresh signature status from Safe service */
  onRefresh?: () => void;
}

/**
 * Displays the current state of a Safe multisig transaction.
 * Shows proposal status, signature count, and links to Safe app.
 *
 * This is a standalone component — does NOT replace TransactionStatus.
 * Used only when isSafe === true.
 */
export function SafeTransactionStatus({
  state,
  safeTxHash,
  safeTxUrl,
  onChainTxHash,
  onChainTxUrl,
  confirmations,
  threshold,
  error,
  successMessage = "Transaction executed on-chain",
  onRefresh,
}: SafeTransactionStatusProps) {
  if (state === "idle") return null;

  return (
    <div className="space-y-2 mt-3">
      {state === "proposing" && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          <span>Preparing Safe transaction proposal...</span>
        </div>
      )}

      {state === "proposed" && (
        <div className="flex items-start gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Transaction proposed to Safe</p>
            <p className="text-xs text-blue-600 mt-1">
              Waiting for other signers to confirm in the Safe app.
            </p>
            {safeTxHash && safeTxUrl && (
              <a
                href={safeTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-2"
              >
                Open in Safe app <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {state === "awaitingSignatures" && (
        <div className="flex items-start gap-2 text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
          <Users className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">Awaiting signatures</p>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-mono">
                {confirmations}/{threshold}
              </span>
            </div>
            <p className="text-xs text-indigo-600 mt-1">
              {threshold - confirmations} more signature{threshold - confirmations !== 1 ? "s" : ""} needed to execute.
            </p>
            {/* Progress bar */}
            <div className="h-1.5 bg-indigo-100 rounded mt-2 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded transition-all duration-500"
                style={{ width: `${(confirmations / threshold) * 100}%` }}
              />
            </div>
            <div className="flex items-center gap-3 mt-2">
              {safeTxUrl && (
                <a
                  href={safeTxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
                >
                  Open in Safe app <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
                >
                  <Clock className="h-3 w-3" /> Refresh status
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {state === "executing" && (
        <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <span>All signatures collected. Executing on-chain...</span>
            {onChainTxHash && onChainTxUrl && (
              <a
                href={onChainTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-1"
              >
                <span className="font-mono">{onChainTxHash.slice(0, 10)}...{onChainTxHash.slice(-8)}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {state === "confirmed" && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <div className="flex-1">
            <span>{successMessage}</span>
            {onChainTxHash && onChainTxUrl && (
              <a
                href={onChainTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-green-500 hover:text-green-700 mt-1"
              >
                <span className="font-mono">{onChainTxHash.slice(0, 10)}...{onChainTxHash.slice(-8)}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {state === "error" && error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
