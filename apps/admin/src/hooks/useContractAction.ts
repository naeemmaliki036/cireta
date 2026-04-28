"use client";

import { useState, useCallback } from "react";
import { useWriteContract, useChainId, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Abi, TransactionReceipt } from "viem";
import { getTxUrl } from "@/lib/contracts/addresses";
import { useSafeDetection } from "@/hooks/useSafeDetection";
import { useSafeContractAction } from "@/hooks/useSafeContractAction";
import type { SafeTxState } from "@/components/molecules/SafeTransactionStatus";

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
  /** Refresh Safe tx status from the Safe service */
  refreshSafeStatus: () => Promise<void>;
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
  const { isSafe } = useSafeDetection();
  const safeAction = useSafeContractAction();

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
      gas?: bigint;
      value?: bigint;
    }): Promise<TransactionReceipt | null> => {
      setError(null);
      setTxHash(null);
      setIsPending(true);
      setIsConfirming(false);
      setIsConfirmed(false);

      // --- Safe wallet: delegate to Safe proposal flow ---
      if (isSafe) {
        setIsPending(false);
        const safeTxHash = await safeAction.execute({
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args,
          value: params.value,
        });
        if (!safeTxHash) {
          setError(safeAction.error);
        }
        // Safe proposals don't return a TransactionReceipt immediately.
        // Callers should check isSafe + safeState for progress.
        return null;
      }

      // --- EOA wallet: existing direct-execution flow ---
      try {
        // Step 1: Send transaction (user signs in wallet)
        // Increased default gas: 1M for better reliability. Complex operations should pass explicit higher values.
        // Most operations on Base mainnet are relatively inexpensive even with higher gas limits.
        const gas = params.gas ?? 1_000_000n;
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
    error: error ?? safeAction.error,
    reset: () => { reset(); safeAction.reset(); },
    isSafe,
    safeState: safeAction.state,
    safeTxHash: safeAction.safeTxHash,
    safeTxUrl: safeAction.safeTxUrl,
    safeOnChainTxHash: safeAction.onChainTxHash,
    safeOnChainTxUrl: safeAction.onChainTxUrl,
    safeConfirmations: safeAction.confirmations,
    safeThreshold: safeAction.threshold,
    refreshSafeStatus: safeAction.refreshStatus,
  };
}

/** Extract a user-friendly message from wallet/contract errors. */
function parseError(err: unknown): string {
  console.error("[useContractAction] Raw error:", err);
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[useContractAction] Error message:", msg);

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
  if (msg.includes("FeeMismatch")) {
    return "Fee mismatch — the fee basis points don't match the PlatformFeeManager. Check platform fee settings.";
  }
  if (msg.includes("IssuerMismatch")) {
    return "Issuer mismatch — your connected wallet doesn't match the issuer address in the sale contract.";
  }
  if (msg.includes("FactoryMismatch")) {
    return "Factory mismatch — the sale contract factory address doesn't match. Check deployment configuration.";
  }
  if (msg.includes("exceeds max") || msg.includes("gas limit")) {
    return "Transaction exceeds gas limit. This is a complex contract call — please try again.";
  }
  if (msg.includes("reverted") && msg.includes("unknown reason")) {
    return "Transaction reverted. Check that your wallet is an active issuer, the token is deployed, and all addresses are correct.";
  }

  // Truncate long messages
  if (msg.length > 200) return msg.slice(0, 200) + "...";
  return msg;
}
