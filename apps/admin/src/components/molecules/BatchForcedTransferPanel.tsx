"use client";

import { useState } from "react";
import { isAddress, type Abi } from "viem";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { CIRETA_TOKEN_ABI } from "@/lib/contracts/abis/ciretaToken";

interface ParsedRow {
  raw: string;
  from: string;
  to: string;
  amount: string;
  fromValid: boolean;
  toValid: boolean;
  amountValid: boolean;
}

function parseRows(text: string): ParsedRow[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((raw) => {
      const parts = raw.split(",").map((p) => p.trim());
      const from = parts[0] ?? "";
      const to = parts[1] ?? "";
      const amount = parts[2] ?? "";
      return {
        raw,
        from,
        to,
        amount,
        fromValid: isAddress(from),
        toValid: isAddress(to),
        amountValid: /^\d+$/.test(amount) && amount !== "0",
      };
    });
}

interface Props {
  /** ERC-3643 token contract address */
  tokenAddress: string;
  /** Whether the connected wallet holds AGENT_ROLE on the token */
  hasAgentRole: boolean;
}

/**
 * BatchForcedTransferPanel — calls CiretaToken.batchForcedTransfer.
 * Input: one line per move in `from,to,amount` format.
 * Validates every row client-side before allowing submission.
 */
export function BatchForcedTransferPanel({ tokenAddress, hasAgentRole }: Props) {
  const [textarea, setTextarea] = useState("");
  const [confirming, setConfirming] = useState(false);
  const action = useContractAction();

  const rows = parseRows(textarea);
  const hasRows = rows.length > 0;
  const hasErrors = rows.some(
    (r) => !r.fromValid || !r.toValid || !r.amountValid,
  );

  const handleSubmit = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    action.reset();

    const fromList = rows.map((r) => r.from as `0x${string}`);
    const toList = rows.map((r) => r.to as `0x${string}`);
    const amounts = rows.map((r) => BigInt(r.amount));

    await action.execute({
      address: tokenAddress as `0x${string}`,
      abi: CIRETA_TOKEN_ABI as unknown as Abi,
      functionName: "batchForcedTransfer",
      args: [fromList, toList, amounts],
      gas: BigInt(200_000 + rows.length * 80_000),
    });

    if (action.isConfirmed) {
      setTextarea("");
    }
  };

  return (
    <div className="space-y-4">
      {/* AGENT_ROLE warning */}
      {!hasAgentRole && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Your connected wallet does not appear to hold AGENT_ROLE on this
          token. The transaction will revert. Ensure you have the role before
          proceeding.
        </div>
      )}

      <div>
        <label className="block text-sm text-black/60 mb-1">
          Transfers — one per line:{" "}
          <code className="font-mono text-xs bg-black/5 px-1 rounded">
            from,to,amount
          </code>
        </label>
        <textarea
          value={textarea}
          onChange={(e) => {
            setTextarea(e.target.value);
            setConfirming(false);
            action.reset();
          }}
          rows={8}
          placeholder={
            "0xFromAddress,0xToAddress,1000000000000000000\n" +
            "# lines starting with # are ignored\n" +
            "0xAnotherFrom,0xAnotherTo,500000000000000000"
          }
          className="w-full bg-box border border-black/10 rounded-lg px-3 py-2 text-text text-sm font-mono resize-y"
        />
        <p className="text-xs text-black/40 mt-1">
          Amount is in raw token units (e.g. 1000000000000000000 = 1 token
          with 18 decimals).
        </p>
      </div>

      {/* Row-level validation */}
      {hasRows && (
        <div className="space-y-1">
          {rows.map((row, i) => {
            const ok = row.fromValid && row.toValid && row.amountValid;
            return (
              <div
                key={i}
                className={`text-xs px-3 py-1.5 rounded-lg font-mono ${
                  ok
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-600"
                }`}
              >
                <span className="font-sans font-medium mr-2">Row {i + 1}:</span>
                {ok ? (
                  <>
                    {row.from.slice(0, 8)}&hellip; → {row.to.slice(0, 8)}
                    &hellip; &nbsp;{row.amount}
                  </>
                ) : (
                  <>
                    {!row.fromValid && (
                      <span className="mr-2">invalid from</span>
                    )}
                    {!row.toValid && <span className="mr-2">invalid to</span>}
                    {!row.amountValid && (
                      <span className="mr-2">invalid amount (must be positive integer)</span>
                    )}
                    &mdash; {row.raw}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation notice */}
      {confirming && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-600 text-sm font-medium">
            Confirm {rows.length} forced transfer
            {rows.length !== 1 ? "s" : ""}? This is irreversible and will be
            recorded on-chain.
          </p>
        </div>
      )}

      <Button
        variant="danger"
        size="sm"
        onClick={handleSubmit}
        disabled={
          !hasRows ||
          hasErrors ||
          action.isPending ||
          action.isConfirming
        }
        isLoading={action.isPending || action.isConfirming}
      >
        {confirming
          ? "Confirm — Execute Batch Force Transfer"
          : `Execute ${rows.length} Forced Transfer${rows.length !== 1 ? "s" : ""}`}
      </Button>

      <TransactionStatus
        isPending={action.isPending}
        isConfirming={action.isConfirming}
        isConfirmed={action.isConfirmed}
        txHash={action.txHash}
        txUrl={action.txUrl}
        error={action.error}
        successMessage="Batch forced transfer confirmed on-chain."
      />
    </div>
  );
}
