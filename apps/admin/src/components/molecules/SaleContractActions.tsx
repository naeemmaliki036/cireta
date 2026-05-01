"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Wallet, Pause, StopCircle, Power, AlertCircle,
} from "lucide-react";
import { useAccount, useReadContract } from "wagmi";
import type { Abi } from "viem";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { CloseSaleModal } from "@/components/molecules/CloseSaleModal";
import { ActivateRefundsPanel } from "@/components/molecules/ActivateRefundsPanel";
import { SaleWithdrawPanels } from "@/components/molecules/SaleWithdrawPanels";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";

interface SaleContractActionsProps {
  contractAddress: string;
  saleStatus: string;
  /** Issuer wallet address (from Sale.issuer() or sale.issuer.wallet_address). Used for pre-flight check. */
  issuerAddress?: string | null;
  /** Whether this sale is open-ended. Gates the Close Sale button. */
  isOpenEnded?: boolean;
  onSuccess?: () => void;
}

/**
 * On-chain sale actions: Withdraw Funds, Withdraw Tokens, Pause, Finalize,
 * Close Sale (open-ended), Activate Refunds.
 * Each action uses its own useContractAction instance for independent tx tracking.
 */
export function SaleContractActions({
  contractAddress,
  saleStatus,
  issuerAddress,
  isOpenEnded = false,
  onSuccess,
}: SaleContractActionsProps) {
  const { isConnected, address: connectedWallet } = useAccount();
  const [showCloseModal, setShowCloseModal] = useState(false);

  const pauseAction = useContractAction();
  const finalizeAction = useContractAction();
  const closeSaleAction = useContractAction();

  const addr = contractAddress as `0x${string}`;
  const abi = SALE_ABI as unknown as Abi;

  // On-chain Sale.issuer() read — used for wallet pre-flight when prop is absent
  const { data: onChainIssuerAddr } = useReadContract({
    address: addr,
    abi,
    functionName: "issuer",
    query: { enabled: !!contractAddress && !issuerAddress },
  });
  const resolvedIssuerAddress = issuerAddress ?? (onChainIssuerAddr as string | undefined) ?? null;

  // On-chain refundsActive() read — gates Activate Refunds button
  const { data: refundsActiveOnChain } = useReadContract({
    address: addr,
    abi,
    functionName: "refundsActive",
    query: { enabled: !!contractAddress && saleStatus === "finalized_failed" },
  });
  const refundsAlreadyActive = refundsActiveOnChain === true;

  const isFinalizedSuccess = saleStatus === "finalized_success" || saleStatus === "finalized";
  const isFinalizedFailed = saleStatus === "finalized_failed";
  const isDraft = saleStatus === "draft";
  const isRejected = saleStatus === "rejected";
  const isActive = saleStatus === "active";

  const showWithdrawFunds = isFinalizedSuccess;
  const showWithdrawUnsold = isFinalizedSuccess;
  const showWithdrawTokens = (isDraft || isRejected) && !!contractAddress;
  const showPauseFinalize = isActive && !!contractAddress;
  const showCloseSale = isOpenEnded && isActive && !!contractAddress;
  const showActivateRefunds = isFinalizedFailed && !refundsAlreadyActive && !!contractAddress;

  const showWithdraw = showWithdrawFunds || showWithdrawUnsold || showWithdrawTokens;
  const hasAnyAction = showWithdraw || showPauseFinalize || showActivateRefunds;

  if (!hasAnyAction) return null;

  // Pre-flight: connected wallet must match the issuer
  const connectedAddr = connectedWallet?.toLowerCase();
  const issuerAddr = resolvedIssuerAddress?.toLowerCase();
  const isWalletMismatch =
    isConnected && !!issuerAddr && !!connectedAddr && connectedAddr !== issuerAddr;

  if (!isConnected) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg border border-zinc-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-md bg-zinc-100 flex items-center justify-center">
            <Wallet className="h-4 w-4 text-zinc-400" />
          </div>
          <h2 className="text-sm font-semibold text-black/60 uppercase tracking-wide">On-Chain Actions</h2>
        </div>
        <div className="text-center py-6">
          <div className="w-12 h-12 rounded-lg bg-zinc-100 flex items-center justify-center mx-auto mb-3">
            <Wallet className="h-6 w-6 text-zinc-300" />
          </div>
          <p className="text-sm text-black/40 mb-1">Connect Wallet Required</p>
          <p className="text-xs text-black/25">Connect your wallet to manage on-chain sale actions</p>
        </div>
      </motion.div>
    );
  }

  const handlePause = async () => {
    const receipt = await pauseAction.execute({ address: addr, abi, functionName: "pause" });
    if (receipt) onSuccess?.();
  };

  const handleFinalize = async () => {
    const receipt = await finalizeAction.execute({ address: addr, abi, functionName: "finalizeSale" });
    if (receipt) onSuccess?.();
  };

  const handleCloseSaleConfirm = async (failed: boolean) => {
    setShowCloseModal(false);
    const receipt = await closeSaleAction.execute({
      address: addr,
      abi,
      functionName: "closeSale",
      args: [failed],
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

      {/* Wallet mismatch warning */}
      {isWalletMismatch && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-0.5">Connected wallet does not match the issuer.</p>
            <p>
              Expected: <code className="font-mono">{issuerAddr}</code> — switch MetaMask to this address before signing.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Withdraw panels (post-success, draft/rejected recovery) */}
        {showWithdraw && (
          <SaleWithdrawPanels
            contractAddress={contractAddress}
            showFundsAndUnsold={showWithdrawFunds}
            showProjectTokens={showWithdrawTokens}
            disabled={isWalletMismatch}
            onSuccess={onSuccess}
          />
        )}

        {/* Pause / Finalize / Close Sale (Active sales) */}
        {showPauseFinalize && (
          <div className="p-4 rounded-lg bg-box border border-black/5">
            <p className="font-medium text-text mb-3">Sale Controls</p>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePause}
                disabled={isWalletMismatch || pauseAction.isPending || pauseAction.isConfirming}
                isLoading={pauseAction.isPending || pauseAction.isConfirming}
                leftIcon={<Pause className="h-4 w-4" />}
              >
                Pause Sale
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleFinalize}
                disabled={isWalletMismatch || finalizeAction.isPending || finalizeAction.isConfirming}
                isLoading={finalizeAction.isPending || finalizeAction.isConfirming}
                leftIcon={<StopCircle className="h-4 w-4" />}
              >
                Finalize Sale
              </Button>
              {showCloseSale && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCloseModal(true)}
                  disabled={isWalletMismatch || closeSaleAction.isPending || closeSaleAction.isConfirming}
                  isLoading={closeSaleAction.isPending || closeSaleAction.isConfirming}
                  leftIcon={<Power className="h-4 w-4" />}
                >
                  Close Sale
                </Button>
              )}
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
            <TransactionStatus
              isPending={closeSaleAction.isPending}
              isConfirming={closeSaleAction.isConfirming}
              isConfirmed={closeSaleAction.isConfirmed}
              txHash={closeSaleAction.txHash}
              txUrl={closeSaleAction.txUrl}
              error={closeSaleAction.error}
              successMessage="Sale closed on-chain."
            />
          </div>
        )}

        {/* Activate Refunds (FinalizedFailed, refunds not yet active) */}
        {showActivateRefunds && (
          <ActivateRefundsPanel
            contractAddress={contractAddress}
            disabled={isWalletMismatch}
            onSuccess={onSuccess}
          />
        )}
      </div>

      {/* Close Sale Modal */}
      {showCloseModal && (
        <CloseSaleModal
          onConfirm={handleCloseSaleConfirm}
          onCancel={() => setShowCloseModal(false)}
        />
      )}
    </motion.div>
  );
}
