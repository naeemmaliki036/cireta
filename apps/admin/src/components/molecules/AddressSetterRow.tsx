"use client";

import { useState } from "react";
import { isAddress, type Abi } from "viem";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

export interface AddressSetterRowProps {
  /** Human label shown to the left of the input */
  label: string;
  /** Current on-chain value (shown as hint) */
  currentValue?: string;
  /** Contract to call */
  contractAddress: `0x${string}`;
  abi: Abi;
  functionName: string;
  /** Whether the row is disabled (e.g. wallet not owner) */
  disabled?: boolean;
  /** Optional callback after confirmed tx */
  onConfirmed?: () => void;
}

/**
 * Molecule: a single-address setter row.
 * Renders a label, current value hint, input + Save button, and inline TransactionStatus.
 */
export function AddressSetterRow({
  label,
  currentValue,
  contractAddress,
  abi,
  functionName,
  disabled = false,
  onConfirmed,
}: AddressSetterRowProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const action = useContractAction();
  const [value, setValue] = useState("");

  const isValid = isAddress(value);

  const handleSave = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!isValid) return;
    action.reset();
    const receipt = await action.execute({
      address: contractAddress,
      abi,
      functionName,
      args: [value as `0x${string}`],
    });
    if (receipt) {
      setValue("");
      onConfirmed?.();
    }
  };

  return (
    <div className="py-3 border-b border-zinc-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-700 mb-0.5">{label}</p>
          {currentValue && (
            <p className="text-[10px] font-mono text-zinc-400 truncate" title={currentValue}>
              Current: {currentValue}
            </p>
          )}
        </div>
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value.trim()); action.reset(); }}
          placeholder="0x..."
          maxLength={42}
          className={`w-56 text-xs font-mono border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua ${
            value && !isValid ? "border-red-300" : "border-zinc-200"
          }`}
          disabled={disabled}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={disabled || !isValid || action.isPending || action.isConfirming}
          isLoading={action.isPending || action.isConfirming}
        >
          Save
        </Button>
      </div>
      <TransactionStatus
        isPending={action.isPending}
        isConfirming={action.isConfirming}
        isConfirmed={action.isConfirmed}
        txHash={action.txHash}
        txUrl={action.txUrl}
        error={action.error}
        successMessage={`${label} updated on-chain.`}
      />
    </div>
  );
}
