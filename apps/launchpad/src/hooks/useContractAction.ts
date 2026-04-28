"use client";

import { useState, useCallback } from "react";
import { useWriteContract, useChainId, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Abi, TransactionReceipt } from "viem";
import { useSafeDetection } from "@/hooks/useSafeDetection";
import { useSafeContractAction } from "@/hooks/useSafeContractAction";
import type { SafeTxState } from "@/components/molecules/SafeTransactionStatus";
import { parseRevertReason } from "@/lib/contracts/revertReasons";

export interface ContractActionState {
  /** Execute a contract write. Returns the receipt on success, null on error. */
  execute: (params: {
    address: `0x${string}`;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    gas?: bigint;
    value?: bigint;
  }) => Promise<TransactionReceipt | null>;
  /** Wallet signature is pending */
  isPending: boolean;
  /** Transaction is submitted, waiting for on-chain confirmation */
  isConfirming: boolean;
  /** Transaction confirmed on-chain */
  isConfirmed: boolean;
  /** Latest transaction hash */
  txHash: `0x${string}` | null;
  /** Explorer URL for the transaction */
  txUrl: string | null;
  /** Error message (wallet rejection, revert, etc.) */
  error: string | null;
  /** Reset state for a new action */
  reset: () => void;
  /** Whether the connected wallet is a Safe multisig */
  isSafe: boolean;
  /** Current Safe transaction state (idle when EOA) */
  safeState: SafeTxState;
  /** Safe internal transaction hash */
  safeTxHash: string | null;
  /** URL to view the Safe transaction in the Safe app */
  safeTxUrl: string | null;
  /** On-chain tx hash after Safe tx is executed */
  safeOnChainTxHash: string | null;
  /** Explorer URL for the executed Safe tx */
  safeOnChainTxUrl: string | null;
  /** Number of Safe owner confirmations collected */
  safeConfirmations: number;
  /** Required Safe owner confirmations threshold */
  safeThreshold: number;
}

function getTxUrl(chainId: number, txHash: string): string {
  switch (chainId) {
    case 8453: // Base mainnet
      return `https://basescan.org/tx/${txHash}`;
    case 84532: // Base Sepolia
      return `https://sepolia.basescan.org/tx/${txHash}`;
    case 11155111: // Sepolia
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    default:
      return `https://etherscan.io/tx/${txHash}`;
  }
}

/**
 * Unified contract action hook for launchpad.
 * Handles both EOA wallets and Safe multisig with proper gas estimation and error handling.
 */
export function useContractAction(): ContractActionState {
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();
  const config = useConfig();
  const chainId = useChainId();
  const { isSafe } = useSafeDetection();
  const safeAction = useSafeContractAction();

  const reset = useCallback(() => {
    setIsPending(false);
    setIsConfirming(false);
    setIsConfirmed(false);
    setTxHash(null);
    setError(null);
    safeAction.reset();
  }, [safeAction]);

  const execute = useCallback(
    async (params: {
      address: `0x${string}`;
      abi: Abi;
      functionName: string;
      args?: readonly unknown[];
      gas?: bigint;
      value?: bigint;
    }) => {
      setError(null);
      setIsPending(true);
      setIsConfirming(false);
      setIsConfirmed(false);

      // --- Safe wallet: delegate to Safe action ---
      if (isSafe) {
        const safeTxHash = await safeAction.execute({
          to: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args || [],
          value: params.value?.toString() || "0",
        });
        setIsPending(false);
        if (!safeTxHash) {
          setError(safeAction.error);
        }
        // Safe proposals don't return a TransactionReceipt immediately.
        // Callers should check isSafe + safeState for progress.
        return null;
      }

      // --- EOA wallet: direct execution ---
      try {
        // Intelligent gas estimation with defaults based on operation type
        let gas = params.gas;
        if (!gas) {
          // Set intelligent defaults based on function name
          if (params.functionName === "approve") {
            gas = 100_000n; // Simple ERC-20 approval
          } else if (params.functionName === "buy" || params.functionName === "buyOTC") {
            gas = 800_000n; // Sale purchases (complex logic)
          } else if (params.functionName === "claimTokens" || params.functionName === "claim") {
            gas = 500_000n; // Claiming operations
          } else if (params.functionName === "transfer") {
            gas = 200_000n; // ERC-20 transfer
          } else {
            gas = 600_000n; // Conservative default for unknown operations
          }
        }

        const hash = await writeContractAsync({
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args as unknown[],
          gas,
          ...(params.value ? { value: params.value } : {}),
        });

        setTxHash(hash);
        setIsPending(false);
        setIsConfirming(true);

        // Wait for on-chain confirmation
        const receipt = await waitForTransactionReceipt(config, { hash });
        setIsConfirming(false);
        setIsConfirmed(true);
        return receipt;
      } catch (err) {
        setIsPending(false);
        setIsConfirming(false);
        const msg = parseRevertReason(err);
        setError(msg);
        return null;
      }
    },
    [writeContractAsync, config, isSafe, safeAction],
  );

  const txUrl = txHash ? getTxUrl(chainId, txHash) : null;

  return {
    execute,
    isPending,
    isConfirming,
    isConfirmed,
    txHash,
    txUrl,
    error,
    reset,
    isSafe,
    safeState: safeAction.state,
    safeTxHash: safeAction.txHash,
    safeTxUrl: safeAction.txUrl,
    safeOnChainTxHash: safeAction.onChainTxHash,
    safeOnChainTxUrl: safeAction.onChainTxUrl,
    safeConfirmations: safeAction.confirmations,
    safeThreshold: safeAction.threshold,
  };
}