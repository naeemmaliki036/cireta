"use client";

import { useState } from "react";
import { parseUnits, type Abi } from "viem";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { X, DollarSign } from "lucide-react";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";
import type { SalePhase } from "@/lib/api/repositories/sales";

interface UpdatePriceModalProps {
  contractAddress: `0x${string}`;
  currentPhase: SalePhase | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function UpdatePriceModal({
  contractAddress,
  currentPhase,
  onClose,
  onSuccess,
}: UpdatePriceModalProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const action = useContractAction();

  const currentPriceStr = currentPhase
    ? parseFloat(currentPhase.price_per_token).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      })
    : "—";

  const [newPrice, setNewPrice] = useState("");

  const newPriceNum = parseFloat(newPrice);
  const isValidPrice = newPrice !== "" && !isNaN(newPriceNum) && newPriceNum > 0;

  const handleConfirm = async (): Promise<void> => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!isValidPrice) return;
    action.reset();
    // USDC has 6 decimals — Sale.sol expects pricePerToken in payment-token raw units
    const newPriceWei = parseUnits(newPrice, 6);
    const receipt = await action.execute({
      address: contractAddress,
      abi: SALE_ABI as unknown as Abi,
      functionName: "setPrice",
      args: [newPriceWei],
    });
    if (receipt) {
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative bg-white rounded-xl border border-zinc-200 shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-darkAqua" />
            <h2 className="text-base font-semibold text-zinc-900">Update Price</h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Current price callout */}
          <div className="rounded-lg bg-[var(--color-box,#ECF3F4)] px-4 py-3">
            <p className="text-xs font-medium text-zinc-500 mb-0.5">Current price</p>
            <p className="text-lg font-bold text-zinc-900">
              ${currentPriceStr}{" "}
              <span className="text-sm font-normal text-zinc-400">USDC / token</span>
            </p>
            {currentPhase && (
              <p className="text-xs text-zinc-400 mt-0.5">
                Active phase: {currentPhase.name}
              </p>
            )}
          </div>

          {/* New price input */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              New price (USDC / token)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
                $
              </span>
              <input
                type="number"
                min="0.000001"
                step="0.000001"
                placeholder="e.g. 1.50"
                value={newPrice}
                onChange={(e) => { setNewPrice(e.target.value); action.reset(); }}
                className="w-full pl-7 pr-4 py-2.5 rounded-lg border border-zinc-200 text-sm
                  focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
              />
            </div>
          </div>

          {/* Preview */}
          {isValidPrice && (
            <div className="rounded-lg border border-darkAqua/20 bg-darkAqua/5 px-4 py-3 text-sm text-zinc-700">
              Your current price is{" "}
              <strong>${currentPriceStr} USDC/token</strong>. Setting it to{" "}
              <strong>
                ${parseFloat(newPrice).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 6,
                })}{" "}
                USDC/token
              </strong>{" "}
              will close the current price tier and start a new one immediately.
            </div>
          )}

          <TransactionStatus
            isPending={action.isPending}
            isConfirming={action.isConfirming}
            isConfirmed={action.isConfirmed}
            txHash={action.txHash}
            txUrl={action.txUrl}
            error={action.error}
            successMessage="Price updated on-chain."
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={action.isPending || action.isConfirming}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={!isValidPrice || action.isPending || action.isConfirming}
            isLoading={action.isPending || action.isConfirming}
          >
            Confirm Update
          </Button>
        </div>
      </div>
    </div>
  );
}
