"use client";

import { motion } from "framer-motion";
import {
  Wallet, Pause, StopCircle, Download,
} from "lucide-react";
import type { Abi } from "viem";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";

interface SaleContractActionsProps {
  contractAddress: string;
  saleStatus: string;
  onSuccess?: () => void;
}

/**
 * On-chain sale actions: Withdraw Funds, Withdraw Tokens, Pause, Finalize.
 * Each action uses its own useContractAction instance for independent tx tracking.
 */
export function SaleContractActions({
  contractAddress,
  saleStatus,
  onSuccess,
}: SaleContractActionsProps) {
  const withdrawFundsAction = useContractAction();
  const withdrawTokensAction = useContractAction();
  const withdrawUnsoldAction = useContractAction();
  const pauseAction = useContractAction();
  const finalizeAction = useContractAction();

  const addr = contractAddress as `0x${string}`;
  const abi = SALE_ABI as unknown as Abi;

  const isFinalizedSuccess = saleStatus === "finalized_success" || saleStatus === "finalized";
  const isDraft = saleStatus === "draft";
  const isRejected = saleStatus === "rejected";
  const isActive = saleStatus === "active";

  const showWithdrawFunds = isFinalizedSuccess;
  const showWithdrawUnsold = isFinalizedSuccess;
  const showWithdrawTokens = (isDraft || isRejected) && !!contractAddress;
  const showPauseFinalize = isActive && !!contractAddress;

  if (!showWithdrawFunds && !showWithdrawUnsold && !showWithdrawTokens && !showPauseFinalize) return null;

  const handleWithdrawFunds = async () => {
    const receipt = await withdrawFundsAction.execute({
      address: addr,
      abi,
      functionName: "withdrawFunds",
    });
    if (receipt) onSuccess?.();
  };

  const handleWithdrawTokens = async () => {
    const receipt = await withdrawTokensAction.execute({
      address: addr,
      abi,
      functionName: "withdrawTokens",
    });
    if (receipt) onSuccess?.();
  };

  const handleWithdrawUnsold = async () => {
    const receipt = await withdrawUnsoldAction.execute({
      address: addr,
      abi,
      functionName: "withdrawUnsoldTokens",
    });
    if (receipt) onSuccess?.();
  };

  const handlePause = async () => {
    const receipt = await pauseAction.execute({
      address: addr,
      abi,
      functionName: "pause",
    });
    if (receipt) onSuccess?.();
  };

  const handleFinalize = async () => {
    const receipt = await finalizeAction.execute({
      address: addr,
      abi,
      functionName: "finalizeSale",
    });
    if (receipt) onSuccess?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg p-6 border border-black/10 mb-6"
    >
      <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
        <Wallet className="h-5 w-5" /> On-Chain Actions
      </h2>

      <div className="space-y-4">
        {/* Withdraw USDC Proceeds */}
        {showWithdrawFunds && (
          <div className="p-4 rounded-lg bg-green-50/50 border border-green-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-text">Withdraw USDC Proceeds</p>
                <p className="text-sm text-black/50">
                  Withdraw all raised USDC to your issuer wallet.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleWithdrawFunds}
                disabled={withdrawFundsAction.isPending || withdrawFundsAction.isConfirming}
                isLoading={withdrawFundsAction.isPending || withdrawFundsAction.isConfirming}
                leftIcon={<Download className="h-4 w-4" />}
              >
                Withdraw Funds
              </Button>
            </div>
            <TransactionStatus
              isPending={withdrawFundsAction.isPending}
              isConfirming={withdrawFundsAction.isConfirming}
              isConfirmed={withdrawFundsAction.isConfirmed}
              txHash={withdrawFundsAction.txHash}
              txUrl={withdrawFundsAction.txUrl}
              error={withdrawFundsAction.error}
              successMessage="USDC proceeds withdrawn to your wallet."
            />
          </div>
        )}

        {/* Sweep Unsold Tokens (Vested mode, post-success) */}
        {showWithdrawUnsold && (
          <div className="p-4 rounded-lg bg-blue-50/50 border border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-text">Sweep Unsold Tokens</p>
                <p className="text-sm text-black/50">
                  Reclaim project tokens not sold during the sale (vested mode calls vault.withdrawExcess).
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleWithdrawUnsold}
                disabled={withdrawUnsoldAction.isPending || withdrawUnsoldAction.isConfirming}
                isLoading={withdrawUnsoldAction.isPending || withdrawUnsoldAction.isConfirming}
                leftIcon={<Download className="h-4 w-4" />}
              >
                Sweep Unsold
              </Button>
            </div>
            <TransactionStatus
              isPending={withdrawUnsoldAction.isPending}
              isConfirming={withdrawUnsoldAction.isConfirming}
              isConfirmed={withdrawUnsoldAction.isConfirmed}
              txHash={withdrawUnsoldAction.txHash}
              txUrl={withdrawUnsoldAction.txUrl}
              error={withdrawUnsoldAction.error}
              successMessage="Unsold tokens swept back to your wallet."
            />
          </div>
        )}

        {/* Withdraw Project Tokens (Draft/Rejected) */}
        {showWithdrawTokens && (
          <div className="p-4 rounded-lg bg-amber-50/50 border border-amber-100">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-text">Withdraw Project Tokens</p>
                <p className="text-sm text-black/50">
                  Recover deposited project tokens from the sale contract.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleWithdrawTokens}
                disabled={withdrawTokensAction.isPending || withdrawTokensAction.isConfirming}
                isLoading={withdrawTokensAction.isPending || withdrawTokensAction.isConfirming}
                leftIcon={<Download className="h-4 w-4" />}
              >
                Withdraw Project Tokens
              </Button>
            </div>
            <TransactionStatus
              isPending={withdrawTokensAction.isPending}
              isConfirming={withdrawTokensAction.isConfirming}
              isConfirmed={withdrawTokensAction.isConfirmed}
              txHash={withdrawTokensAction.txHash}
              txUrl={withdrawTokensAction.txUrl}
              error={withdrawTokensAction.error}
              successMessage="Project tokens withdrawn to your wallet."
            />
          </div>
        )}

        {/* Pause / Finalize (Active sales) */}
        {showPauseFinalize && (
          <div className="p-4 rounded-lg bg-box border border-black/5">
            <p className="font-medium text-text mb-3">Sale Controls</p>
            <div className="flex items-center gap-3 mb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePause}
                disabled={pauseAction.isPending || pauseAction.isConfirming}
                isLoading={pauseAction.isPending || pauseAction.isConfirming}
                leftIcon={<Pause className="h-4 w-4" />}
              >
                Pause Sale
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleFinalize}
                disabled={finalizeAction.isPending || finalizeAction.isConfirming}
                isLoading={finalizeAction.isPending || finalizeAction.isConfirming}
                leftIcon={<StopCircle className="h-4 w-4" />}
              >
                Finalize Sale
              </Button>
            </div>
            <TransactionStatus
              isPending={pauseAction.isPending}
              isConfirming={pauseAction.isConfirming}
              isConfirmed={pauseAction.isConfirmed}
              txHash={pauseAction.txHash}
              txUrl={pauseAction.txUrl}
              error={pauseAction.error}
              successMessage="Sale paused on-chain."
            />
            <TransactionStatus
              isPending={finalizeAction.isPending}
              isConfirming={finalizeAction.isConfirming}
              isConfirmed={finalizeAction.isConfirmed}
              txHash={finalizeAction.txHash}
              txUrl={finalizeAction.txUrl}
              error={finalizeAction.error}
              successMessage="Sale finalized on-chain."
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
