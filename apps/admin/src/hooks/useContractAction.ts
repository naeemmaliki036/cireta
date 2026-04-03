"use client";

import { useState, useCallback } from "react";
import { useWriteContract, useChainId, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Abi, TransactionReceipt } from "viem";
import { getTxUrl } from "@/lib/contracts/addresses";

export interface ContractActionState {
  /** Execute a contract write. Returns the receipt on success, null on error. */
  execute: (params: {
    address: `0x${string}`;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
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
}

/**
 * Reusable hook wrapping wagmi's useWriteContract + waitForTransactionReceipt.
 * Returns an imperative execute() that resolves with the full receipt.
 *
 * Usage:
 *   const action = useContractAction();
 *   const receipt = await action.execute({ address, abi, functionName, args });
 *   // Parse logs from receipt.logs
 */
export function useContractAction(): ContractActionState {
  const chainId = useChainId();
  const config = useConfig();
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const { writeContractAsync } = useWriteContract();

  const reset = useCallback(() => {
    setTxHash(null);
    setError(null);
    setIsPending(false);
    setIsConfirming(false);
    setIsConfirmed(false);
  }, []);

  const execute = useCallback(
    async (params: {
      address: `0x${string}`;
      abi: Abi;
      functionName: string;
      args?: readonly unknown[];
    }): Promise<TransactionReceipt | null> => {
      setError(null);
      setTxHash(null);
      setIsPending(true);
      setIsConfirming(false);
      setIsConfirmed(false);

      try {
        // Step 1: Send transaction (user signs in wallet)
        const hash = await writeContractAsync({
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args as unknown[],
        });
        setTxHash(hash);
        setIsPending(false);
        setIsConfirming(true);

        // Step 2: Wait for on-chain confirmation
        const receipt = await waitForTransactionReceipt(config, { hash });
        setIsConfirming(false);
        setIsConfirmed(true);
        return receipt;
      } catch (err) {
        setIsPending(false);
        setIsConfirming(false);
        const msg = parseError(err);
        setError(msg);
        return null;
      }
    },
    [writeContractAsync, config],
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
  };
}

/** Extract a user-friendly message from wallet/contract errors. */
function parseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("User rejected") || msg.includes("user rejected")) {
    return "Transaction was rejected in your wallet.";
  }
  if (msg.includes("insufficient funds")) {
    return "Insufficient funds for gas.";
  }
  if (msg.includes("not active issuer") || msg.includes("NotActiveIssuer")) {
    return "Your wallet is not registered as an active issuer on-chain.";
  }
  if (msg.includes("not pending")) {
    return "Issuer is not in pending status.";
  }
  if (msg.includes("already registered")) {
    return "This address is already registered.";
  }
  if (msg.includes("zero address") || msg.includes("ZeroAddress")) {
    return "One of the required addresses is missing (zero address).";
  }

  // Truncate long messages
  if (msg.length > 200) return msg.slice(0, 200) + "...";
  return msg;
}
