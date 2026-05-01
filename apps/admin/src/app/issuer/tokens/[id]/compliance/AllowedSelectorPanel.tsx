"use client";

import { useState } from "react";
import { type Abi, isHex } from "viem";
import { ToggleLeft, ToggleRight, AlertCircle } from "lucide-react";
import { Button, Input } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { MODULAR_COMPLIANCE_ABI } from "@/lib/contracts/abis/modularCompliance";

interface Props {
  complianceAddress: string;
  /** Whether the connected wallet is the compliance owner */
  isOwner: boolean;
}

/** Validate a bytes4 selector: 0x-prefixed, exactly 4 bytes (10 hex chars). */
function isValidBytes4(value: string): boolean {
  return /^0x[0-9a-fA-F]{8}$/.test(value);
}

/**
 * AllowedSelectorPanel — lets the compliance owner call
 * ModularCompliance.setAllowedSelector(bytes4, bool) to gate which
 * function selectors can be invoked via callModuleFunction.
 */
export function AllowedSelectorPanel({ complianceAddress, isOwner }: Props) {
  const [selector, setSelector] = useState("");
  const [allowed, setAllowed] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const action = useContractAction();

  const handleSubmit = async () => {
    setValidationError(null);

    const trimmed = selector.trim().toLowerCase();
    if (!trimmed.startsWith("0x")) {
      setValidationError("Selector must be 0x-prefixed.");
      return;
    }
    if (!isValidBytes4(trimmed)) {
      setValidationError(
        "Selector must be exactly 4 bytes: 0x followed by 8 hex characters (e.g. 0x12345678).",
      );
      return;
    }
    if (!isHex(trimmed)) {
      setValidationError("Selector is not valid hex.");
      return;
    }

    action.reset();
    await action.execute({
      address: complianceAddress as `0x${string}`,
      abi: MODULAR_COMPLIANCE_ABI as unknown as Abi,
      functionName: "setAllowedSelector",
      args: [trimmed as `0x${string}`, allowed],
    });
  };

  return (
    <div className="bg-white rounded-lg border border-zinc-100 p-5 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <ToggleRight className="h-4 w-4 text-zinc-500" />
        <h3 className="text-sm font-semibold text-zinc-900">
          Advanced — Allowed Selectors
        </h3>
      </div>
      <p className="text-xs text-zinc-400 mb-4">
        Gate which 4-byte function selectors can be invoked via{" "}
        <code className="font-mono">callModuleFunction</code>. Paste the
        selector (0x + 8 hex chars) and toggle Allow/Disallow. The connected
        wallet must be the compliance contract owner.
      </p>

      {!isOwner && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Your connected wallet is not the compliance contract owner. This
          action will revert.
        </div>
      )}

      <div className="space-y-3 max-w-xl">
        <Input
          label="bytes4 selector (0x + 8 hex chars)"
          placeholder="0xaabbccdd"
          value={selector}
          maxLength={10}
          onChange={(e) => {
            setSelector(e.target.value);
            setValidationError(null);
          }}
          error={
            validationError ??
            (selector && !isValidBytes4(selector.toLowerCase())
              ? "Must be 0x followed by exactly 8 hex characters"
              : undefined)
          }
          helperText="Example: 0x12345678 — use viem.toFunctionSelector() to derive from a function signature."
        />

        {/* Allow / Disallow toggle */}
        <div>
          <p className="block text-xs text-zinc-600 mb-2">Action</p>
          <div className="flex gap-2">
            {(
              [
                { value: true, label: "Allow", icon: ToggleRight },
                { value: false, label: "Disallow", icon: ToggleLeft },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setAllowed(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  allowed === value
                    ? "bg-[var(--color-darkAqua,#13636F)] text-white border-[var(--color-darkAqua,#13636F)]"
                    : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={
            action.isPending ||
            action.isConfirming ||
            !selector.trim() ||
            !isValidBytes4(selector.trim().toLowerCase())
          }
          isLoading={action.isPending || action.isConfirming}
        >
          Set Selector{allowed ? " Allowed" : " Disallowed"}
        </Button>

        <TransactionStatus
          isPending={action.isPending}
          isConfirming={action.isConfirming}
          isConfirmed={action.isConfirmed}
          txHash={action.txHash}
          txUrl={action.txUrl}
          error={action.error}
          successMessage={`Selector ${selector} ${allowed ? "allowed" : "disallowed"} on-chain.`}
        />
      </div>
    </div>
  );
}
