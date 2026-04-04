"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import { isAddress, type Abi } from "viem";
import { Button, Input } from "@/components/atoms";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";

interface OTCTokenManagerProps {
  saleContractAddress: `0x${string}`;
  currentOTCTokenAddress: string | null;
}

/**
 * Update OTC token address on a deployed sale contract.
 * Only shown for draft sales with a contract address.
 */
export function OTCTokenManager({
  saleContractAddress,
  currentOTCTokenAddress,
}: OTCTokenManagerProps) {
  const [newAddress, setNewAddress] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const action = useContractAction();

  const handleSetOTCToken = async () => {
    setValidationError(null);
    const trimmed = newAddress.trim();

    if (!trimmed) {
      setValidationError("Enter an OTC token address.");
      return;
    }

    if (!isAddress(trimmed)) {
      setValidationError("Invalid Ethereum address.");
      return;
    }

    action.reset();
    const receipt = await action.execute({
      address: saleContractAddress,
      abi: SALE_ABI as unknown as Abi,
      functionName: "setOTCToken",
      args: [trimmed as `0x${string}`],
    });

    if (receipt) {
      setNewAddress("");
    }
  };

  const isZero =
    !currentOTCTokenAddress ||
    currentOTCTokenAddress === "0x0000000000000000000000000000000000000000";

  return (
    <div className="bg-white rounded-3xl p-6 border border-darkBlack/10">
      <h2 className="text-lg font-semibold text-text flex items-center gap-2 mb-4">
        <Coins className="h-5 w-5" /> OTC Token
      </h2>

      <div className="mb-4">
        <p className="text-sm text-zinc-500 mb-1">Current OTC Token</p>
        {isZero ? (
          <p className="text-sm text-zinc-400 italic">Not set</p>
        ) : (
          <CopyableAddress
            address={currentOTCTokenAddress!}
            truncate
            className="text-sm"
          />
        )}
      </div>

      <Input
        label="New OTC Token Address"
        placeholder="0x..."
        value={newAddress}
        maxLength={42}
        onChange={(e) => { setNewAddress(e.target.value); setValidationError(null); }}
        error={validationError ?? (newAddress && !isAddress(newAddress) ? "Invalid EVM address" : undefined)}
        helperText="Set or update the OTC receipt token contract for this sale"
      />

      <Button
        variant="primary"
        className="mt-4"
        onClick={handleSetOTCToken}
        disabled={action.isPending || action.isConfirming || !newAddress.trim() || !isAddress(newAddress)}
        isLoading={action.isPending || action.isConfirming}
      >
        Update OTC Token
      </Button>

      <TransactionStatus
        isPending={action.isPending}
        isConfirming={action.isConfirming}
        isConfirmed={action.isConfirmed}
        txHash={action.txHash}
        txUrl={action.txUrl}
        error={action.error}
        successMessage="OTC token address updated on-chain"
      />
    </div>
  );
}
