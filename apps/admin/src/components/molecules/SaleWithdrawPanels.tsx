"use client";

import { Download } from "lucide-react";
import type { Abi } from "viem";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";

interface SaleWithdrawPanelsProps {
  contractAddress: string;
  /** Show Withdraw USDC Proceeds + Sweep Unsold Tokens (post-success) */
  showFundsAndUnsold: boolean;
  /** Show Withdraw Project Tokens (draft/rejected) */
  showProjectTokens: boolean;
  disabled?: boolean;
  onSuccess?: () => void;
}

/**
 * Withdrawal action panels: USDC proceeds, unsold token sweep,
 * project token recovery. Extracted to keep SaleContractActions under 300 LOC.
 */
export function SaleWithdrawPanels({
  contractAddress,
  showFundsAndUnsold,
  showProjectTokens,
  disabled = false,
  onSuccess,
}: SaleWithdrawPanelsProps) {
  const fundsAction = useContractAction();
  const unsoldAction = useContractAction();
  const tokensAction = useContractAction();

  const addr = contractAddress as `0x${string}`;
  const abi = SALE_ABI as unknown as Abi;

  const handleWithdrawFunds = async () => {
    const receipt = await fundsAction.execute({ address: addr, abi, functionName: "withdrawFunds" });
    if (receipt) onSuccess?.();
  };

  const handleWithdrawUnsold = async () => {
    const receipt = await unsoldAction.execute({ address: addr, abi, functionName: "withdrawUnsoldTokens" });
    if (receipt) onSuccess?.();
  };

  const handleWithdrawTokens = async () => {
    const receipt = await tokensAction.execute({ address: addr, abi, functionName: "withdrawTokens" });
    if (receipt) onSuccess?.();
  };

  return (
    <>
      {showFundsAndUnsold && (
        <>
          <div className="p-4 rounded-lg bg-green-50/50 border border-green-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-text">Withdraw USDC Proceeds</p>
                <p className="text-sm text-black/50">Withdraw all raised USDC to your issuer wallet.</p>
              </div>
              <Button
                variant="primary" size="sm" onClick={handleWithdrawFunds}
                disabled={disabled || fundsAction.isPending || fundsAction.isConfirming}
                isLoading={fundsAction.isPending || fundsAction.isConfirming}
                leftIcon={<Download className="h-4 w-4" />}
              >
                Withdraw Funds
              </Button>
            </div>
            <TransactionStatus
              isPending={fundsAction.isPending} isConfirming={fundsAction.isConfirming}
              isConfirmed={fundsAction.isConfirmed} txHash={fundsAction.txHash}
              txUrl={fundsAction.txUrl} error={fundsAction.error}
              successMessage="USDC proceeds withdrawn to your wallet."
            />
          </div>

          <div className="p-4 rounded-lg bg-blue-50/50 border border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-text">Sweep Unsold Tokens</p>
                <p className="text-sm text-black/50">
                  Reclaim project tokens not sold (vested mode calls vault.withdrawExcess).
                </p>
              </div>
              <Button
                variant="secondary" size="sm" onClick={handleWithdrawUnsold}
                disabled={disabled || unsoldAction.isPending || unsoldAction.isConfirming}
                isLoading={unsoldAction.isPending || unsoldAction.isConfirming}
                leftIcon={<Download className="h-4 w-4" />}
              >
                Sweep Unsold
              </Button>
            </div>
            <TransactionStatus
              isPending={unsoldAction.isPending} isConfirming={unsoldAction.isConfirming}
              isConfirmed={unsoldAction.isConfirmed} txHash={unsoldAction.txHash}
              txUrl={unsoldAction.txUrl} error={unsoldAction.error}
              successMessage="Unsold tokens swept back to your wallet."
            />
          </div>
        </>
      )}

      {showProjectTokens && (
        <div className="p-4 rounded-lg bg-amber-50/50 border border-amber-100">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-medium text-text">Withdraw Project Tokens</p>
              <p className="text-sm text-black/50">Recover deposited project tokens from the sale contract.</p>
            </div>
            <Button
              variant="secondary" size="sm" onClick={handleWithdrawTokens}
              disabled={disabled || tokensAction.isPending || tokensAction.isConfirming}
              isLoading={tokensAction.isPending || tokensAction.isConfirming}
              leftIcon={<Download className="h-4 w-4" />}
            >
              Withdraw Project Tokens
            </Button>
          </div>
          <TransactionStatus
            isPending={tokensAction.isPending} isConfirming={tokensAction.isConfirming}
            isConfirmed={tokensAction.isConfirmed} txHash={tokensAction.txHash}
            txUrl={tokensAction.txUrl} error={tokensAction.error}
            successMessage="Project tokens withdrawn to your wallet."
          />
        </div>
      )}
    </>
  );
}
