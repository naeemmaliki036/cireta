"use client";

import { useMemo } from "react";
import { isAddress } from "viem";
import { CheckCircle2, AlertCircle } from "lucide-react";

export interface BatchRow {
  address: string;
  amountRaw: string;
  amountValid: boolean;
  addressValid: boolean;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** When true, parse a second column (comma-separated) as amount; else address-only. */
  withAmount?: boolean;
  placeholder?: string;
  rows?: number;
}

/**
 * Lightweight CSV-style parser for batch address operations.
 * Format per line: `0xWALLET[,AMOUNT]`. Lines with `#` prefix or blank are ignored.
 * Returns parsed rows with per-row validation.
 */
export function useBatchRows(value: string, withAmount: boolean): BatchRow[] {
  return useMemo(() => {
    return value
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((line) => {
        const parts = line.split(/[,\s]+/).filter(Boolean);
        const address = parts[0] ?? "";
        const amountRaw = withAmount ? (parts[1] ?? "") : "";
        return {
          address,
          amountRaw,
          addressValid: isAddress(address),
          amountValid: !withAmount || (!!amountRaw && Number(amountRaw) > 0),
        };
      });
  }, [value, withAmount]);
}

export function BatchAddressInput({
  value,
  onChange,
  withAmount = false,
  placeholder = "0xabc...,1000\n0xdef...,500\n# comment lines starting with # are ignored",
  rows = 8,
}: Props) {
  const parsed = useBatchRows(value, withAmount);
  const validCount = parsed.filter((r) => r.addressValid && r.amountValid).length;
  const invalidCount = parsed.length - validCount;

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full bg-zinc-50 border border-black/10 rounded-lg px-3 py-2 text-sm font-mono"
      />
      <div className="flex items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <CheckCircle2 className="h-3 w-3" /> {validCount} valid
        </span>
        {invalidCount > 0 && (
          <span className="inline-flex items-center gap-1 text-red-600">
            <AlertCircle className="h-3 w-3" /> {invalidCount} invalid
          </span>
        )}
        {withAmount && (
          <span className="text-zinc-400">Format: <code className="font-mono">address,amount</code> per line</span>
        )}
        {!withAmount && (
          <span className="text-zinc-400">One address per line</span>
        )}
      </div>
      {invalidCount > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-red-600">Show invalid rows</summary>
          <ul className="mt-1 space-y-0.5 text-red-700/80">
            {parsed.map((r, i) =>
              r.addressValid && r.amountValid ? null : (
                <li key={i} className="font-mono">
                  Line {i + 1}: {!r.addressValid ? "bad address" : "bad amount"} → {r.address}{withAmount ? `,${r.amountRaw}` : ""}
                </li>
              )
            )}
          </ul>
        </details>
      )}
    </div>
  );
}
