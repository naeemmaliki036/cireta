"use client";

import { useState } from "react";
import { AlertCircle, ExternalLink, Send, X } from "lucide-react";
import { Button } from "@/components/atoms";
import { apiPost } from "@/lib/api/client";
import { getTxUrl } from "@/lib/contracts/addresses";

export interface ErrorReportContext {
  /** Error code/name (e.g. 'BelowMinContribution', 'PROXY_ERROR'). */
  code?: string | null;
  /** Human message shown to the user. */
  message?: string | null;
  /** On-chain tx hash if a tx was submitted. */
  txHash?: string | null;
  /** Contract that reverted, if any. */
  contractAddress?: string | null;
  /** Function called (e.g. 'buy', 'addPhase'). */
  functionName?: string | null;
  chainId?: number | null;
}

interface Props {
  context: ErrorReportContext;
  /** Optional className for layout tweaks. */
  className?: string;
}

/**
 * Empathetic error display + Report button. Used wherever a
 * transaction or operation fails. Shows the tx link when we have a
 * hash, encourages the user to report, and opens a small modal where
 * they can add an optional note before submitting.
 */
export function ErrorReportButton({ context, className }: Props) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const txUrl =
    context.chainId && context.txHash
      ? getTxUrl(context.chainId, context.txHash)
      : null;

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiPost("/api/v1/error-reports", {
        tx_hash: context.txHash ?? null,
        contract_address: context.contractAddress ?? null,
        function_name: context.functionName ?? null,
        chain_id: context.chainId ?? null,
        error_code: context.code ?? null,
        error_message: context.message ?? null,
        page_url: typeof window !== "undefined" ? window.location.href : null,
        additional_details: details.trim() || null,
      });
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't send the report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={className}>
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Something went wrong on our end.</p>
            {context.message && (
              <p className="mt-1 break-words">{context.message}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {txUrl ? (
                <a
                  href={txUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 underline"
                >
                  View transaction <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-darkAqua text-white text-xs font-medium px-3 py-1.5 hover:opacity-90"
              >
                <Send className="h-3 w-3" /> Report this issue
              </button>
            </div>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-base text-text">Report this issue</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            {done ? (
              <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                Thanks — your report has been sent. We&apos;ll look into it.
                <div className="mt-3 text-right">
                  <Button variant="secondary" size="sm" onClick={() => { setOpen(false); setDone(false); setDetails(""); }}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  We&apos;ll capture the page, the transaction (if any), and the
                  error details automatically. Add anything else you think would
                  help us fix it.
                </p>
                <div className="rounded-lg bg-gray-50 px-3 py-2 mb-3 text-[11px] text-gray-600 space-y-0.5">
                  {context.functionName && <div><span className="text-gray-400">Function:</span> {context.functionName}</div>}
                  {context.code && <div><span className="text-gray-400">Code:</span> {context.code}</div>}
                  {context.txHash && <div className="font-mono break-all"><span className="text-gray-400 not-italic">Tx:</span> {context.txHash}</div>}
                </div>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="What were you trying to do? Anything that might help us reproduce…"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-darkAqua min-h-[100px]"
                  maxLength={4000}
                />
                {submitError && <p className="text-xs text-red-600 mt-2">{submitError}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={submit} isLoading={submitting}>
                    {submitting ? "Sending…" : "Send report"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
