"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { useAccount, useReadContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import type { Abi } from "viem";
import { Button, Spinner } from "@/components/atoms";
import { useContractAction } from "@/hooks/useContractAction";
import { REDEMPTION_MANAGER_ABI } from "@/lib/contracts/redemptionManagerAbi";
import { OTC_TOKEN_ABI } from "@/lib/contracts/otcTokenAbi";

/** method enum on-chain: 0 = Cash, 1 = Physical */
type FulfillmentMethod = 0 | 1;

const PROJECT_TOKEN_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface RedemptionRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** ERC-20 project token contract address */
  tokenAddress: `0x${string}`;
  /** Token symbol for display */
  tokenSymbol: string;
  /** Deployed RedemptionManager contract address */
  redemptionManagerAddress: `0x${string}`;
}

type Phase = "form" | "approving" | "requesting" | "success" | "error";

export function RedemptionRequestModal({
  isOpen,
  onClose,
  tokenAddress,
  tokenSymbol,
  redemptionManagerAddress,
}: RedemptionRequestModalProps): React.ReactElement | null {
  const { address: walletAddress } = useAccount();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FulfillmentMethod>(0);
  const [phase, setPhase] = useState<Phase>("form");
  const [newRequestId, setNewRequestId] = useState<bigint | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const approveAction = useContractAction();
  const requestAction = useContractAction();

  // Read on-chain balance
  const { data: rawBalance, isLoading: balanceLoading } = useReadContract({
    address: tokenAddress,
    abi: PROJECT_TOKEN_ABI as Abi,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!walletAddress && isOpen },
  });

  // Read token decimals
  const { data: rawDecimals } = useReadContract({
    address: tokenAddress,
    abi: PROJECT_TOKEN_ABI as Abi,
    functionName: "decimals",
    query: { enabled: isOpen },
  });

  // Read current allowance
  const { data: rawAllowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: OTC_TOKEN_ABI as Abi,
    functionName: "allowance",
    args: walletAddress ? [walletAddress, redemptionManagerAddress] : undefined,
    query: { enabled: !!walletAddress && isOpen },
  });

  const decimals = typeof rawDecimals === "number" ? rawDecimals : 18;
  const balanceBigInt = typeof rawBalance === "bigint" ? rawBalance : 0n;
  const allowanceBigInt = typeof rawAllowance === "bigint" ? rawAllowance : 0n;

  const balanceFormatted = formatUnits(balanceBigInt, decimals);
  const hasBalance = balanceBigInt > 0n;

  // Auto-close 4 s after success
  useEffect(() => {
    if (phase !== "success") return;
    const t = setTimeout(() => onClose(), 4000);
    return () => clearTimeout(t);
  }, [phase, onClose]);

  // Reset state when modal re-opens
  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setMethod(0);
      setPhase("form");
      setNewRequestId(null);
      setFormError(null);
      approveAction.reset();
      requestAction.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const amountNum = parseFloat(amount);
  const amountValid =
    !Number.isNaN(amountNum) &&
    amountNum > 0 &&
    parseFloat(balanceFormatted) >= amountNum;

  const handleSubmit = async (): Promise<void> => {
    setFormError(null);
    if (!walletAddress) { setFormError("Connect your wallet first."); return; }
    if (!amountValid) { setFormError("Enter a valid amount within your balance."); return; }

    const amountBigInt = parseUnits(amount, decimals);

    // Step 1: approve if allowance insufficient
    if (allowanceBigInt < amountBigInt) {
      setPhase("approving");
      const approveReceipt = await approveAction.execute({
        address: tokenAddress,
        abi: OTC_TOKEN_ABI as Abi,
        functionName: "approve",
        args: [redemptionManagerAddress, amountBigInt],
      });
      if (!approveReceipt) {
        setPhase("error");
        return;
      }
      await refetchAllowance();
    }

    // Step 2: requestRedemption
    setPhase("requesting");
    const receipt = await requestAction.execute({
      address: redemptionManagerAddress,
      abi: REDEMPTION_MANAGER_ABI as Abi,
      functionName: "requestRedemption",
      args: [amountBigInt, method],
      gas: 300_000n,
    });

    if (!receipt) {
      setPhase("error");
      return;
    }

    // Parse the new request ID from the RedemptionRequested log if available
    // Fallback: leave null — the success screen still shows without it
    try {
      const log = receipt.logs[0];
      if (log?.topics?.[1]) {
        setNewRequestId(BigInt(log.topics[1]));
      }
    } catch {
      // non-critical
    }

    setPhase("success");
  };

  const activeError =
    formError ??
    (phase === "error" ? (approveAction.error ?? requestAction.error ?? "Transaction failed.") : null);

  const isWorking = phase === "approving" || phase === "requesting";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={isWorking ? undefined : onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#ECF3F4]">
            <h2 className="text-base font-bold text-black">Request Redemption</h2>
            {!isWorking && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[#ECF3F4] transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-black/40" />
              </button>
            )}
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Success state */}
            {phase === "success" && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-[#13636F]" />
                <p className="font-semibold text-black">Redemption requested</p>
                {newRequestId !== null && (
                  <p className="text-sm text-black/60">
                    Request ID:{" "}
                    <span className="font-mono text-black">{newRequestId.toString()}</span>
                  </p>
                )}
                <p className="text-xs text-black/50">Closing automatically…</p>
              </div>
            )}

            {/* Working state */}
            {isWorking && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <Spinner size="lg" />
                <p className="text-sm text-black/70">
                  {phase === "approving"
                    ? "Approving token transfer…"
                    : "Submitting redemption request…"}
                </p>
                <p className="text-xs text-black/40">
                  Please confirm in your wallet.
                </p>
              </div>
            )}

            {/* Form state */}
            {(phase === "form" || phase === "error") && (
              <>
                {/* Balance reference */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-black/60">Your balance</span>
                  {balanceLoading ? (
                    <Spinner size="sm" />
                  ) : (
                    <span className="font-semibold text-black">
                      {parseFloat(balanceFormatted).toLocaleString(undefined, {
                        maximumFractionDigits: 6,
                      })}{" "}
                      {tokenSymbol}
                    </span>
                  )}
                </div>

                {!hasBalance && !balanceLoading && (
                  <p className="text-sm text-black/60 bg-[#ECF3F4] rounded-xl px-4 py-3">
                    You have no {tokenSymbol} tokens to redeem.
                  </p>
                )}

                {hasBalance && (
                  <>
                    {/* Amount input */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-black" htmlFor="redeem-amount">
                        Amount to redeem
                      </label>
                      <div className="relative">
                        <input
                          id="redeem-amount"
                          type="number"
                          min="0"
                          step="any"
                          value={amount}
                          onChange={(e) => { setAmount(e.target.value); setFormError(null); }}
                          placeholder="0"
                          className="w-full border border-[#ECF3F4] rounded-xl px-4 py-3 text-sm text-black placeholder-black/30 focus:outline-none focus:ring-2 focus:ring-[#13636F] pr-20"
                        />
                        <button
                          type="button"
                          onClick={() => setAmount(balanceFormatted)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#13636F] hover:opacity-70"
                        >
                          MAX
                        </button>
                      </div>
                    </div>

                    {/* Fulfillment method */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-black">Fulfillment method</p>
                      <div className="flex gap-3">
                        {(
                          [
                            { value: 0 as FulfillmentMethod, label: "Cash" },
                            { value: 1 as FulfillmentMethod, label: "Physical" },
                          ] as const
                        ).map((opt) => (
                          <label
                            key={opt.value}
                            className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium cursor-pointer transition-colors ${
                              method === opt.value
                                ? "border-[#13636F] bg-[#13636F] text-white"
                                : "border-[#ECF3F4] bg-white text-black hover:border-[#13636F]/40"
                            }`}
                          >
                            <input
                              type="radio"
                              name="fulfillment-method"
                              value={opt.value}
                              checked={method === opt.value}
                              onChange={() => setMethod(opt.value)}
                              className="sr-only"
                            />
                            {opt.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Error */}
                {activeError && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                    {activeError}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Footer actions */}
          {(phase === "form" || phase === "error") && hasBalance && (
            <div className="px-6 pb-6 flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                variant="gold"
                size="sm"
                className="flex-1"
                disabled={!amountValid || balanceLoading}
                onClick={handleSubmit}
              >
                Request Redemption
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
