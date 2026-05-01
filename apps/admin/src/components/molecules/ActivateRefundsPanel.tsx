"use client";

import { RefreshCw } from "lucide-react";
import type { Abi } from "viem";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";

interface ActivateRefundsPanelProps {
  contractAddress: string;
  disabled?: boolean;
  onSuccess?: () => void;
}

/**
 * Activate Refunds panel — rendered inside SaleContractActions for
 * FinalizedFailed sales where refunds are not yet active.
 */
export function ActivateRefundsPanel({
  contractAddress,
  disabled = false,
  onSuccess,
}: ActivateRefundsPanelProps) {
  const action = useContractAction();
  const addr = contractAddress as `0x${string}`;
  const abi = SALE_ABI as unknown as Abi;

  const handleActivate = async () => {
    const receipt = await action.execute({ address: addr, abi, functionName: "activateRefunds" });
    if (receipt) onSuccess?.();
  };

  return (
    <div className="p-4 rounded-lg bg-red-50/50 border border-red-100">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-medium text-text">Activate Refunds</p>
          <p className="text-sm text-black/50">
            Allows buyers to claim USDC refunds on-chain. This action is irreversible.
          </p>
        </div>
        <Button
          variant="dangerOutline"
          size="sm"
          onClick={handleActivate}
          disabled={disabled || action.isPending || action.isConfirming}
          isLoading={action.isPending || action.isConfirming}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          Activate Refunds
        </Button>
      </div>
      <TransactionStatus
        isPending={action.isPending}
        isConfirming={action.isConfirming}
        isConfirmed={action.isConfirmed}
        txHash={action.txHash}
        txUrl={action.txUrl}
        error={action.error}
        successMessage="Refunds activated — buyers can now claim USDC refunds."
      />
    </div>
  );
}
