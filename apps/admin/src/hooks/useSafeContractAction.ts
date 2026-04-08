"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId } from "wagmi";
import { encodeFunctionData, type Abi } from "viem";
import { proposeTransaction, getTransaction, getSafeTxUrl } from "@/lib/safe/safeClient";
import { getTxUrl } from "@/lib/contracts/addresses";
import type { SafeTxState } from "@/components/molecules/SafeTransactionStatus";

export interface SafeContractActionState {
  /** Propose a contract call to the Safe multisig */
  execute: (params: {
    address: `0x${string}`;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  }) => Promise<string | null>;
  /** Current Safe tx state */
  state: SafeTxState;
  /** Safe internal transaction hash */
  safeTxHash: string | null;
  /** URL to view in Safe app */
  safeTxUrl: string | null;
  /** On-chain tx hash (after execution) */
  onChainTxHash: string | null;
  /** On-chain explorer URL */
  onChainTxUrl: string | null;
  /** Signature progress */
  confirmations: number;
  threshold: number;
  /** Error message */
  error: string | null;
  /** Reset state */
  reset: () => void;
  /** Refresh status from Safe service */
  refreshStatus: () => Promise<void>;
}

/**
 * Hook for proposing contract calls to a Safe multisig wallet.
 * Only used when isSafe === true. EOA wallets use useContractAction instead.
 */
export function useSafeContractAction(): SafeContractActionState {
  const { address } = useAccount();
  const chainId = useChainId();
  const [state, setState] = useState<SafeTxState>("idle");
  const [safeTxHash, setSafeTxHash] = useState<string | null>(null);
  const [onChainTxHash, setOnChainTxHash] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState(0);
  const [threshold, setThreshold] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setState("idle");
    setSafeTxHash(null);
    setOnChainTxHash(null);
    setConfirmations(0);
    setThreshold(0);
    setError(null);
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!safeTxHash) return;
    try {
      const tx = await getTransaction(safeTxHash);
      setConfirmations(tx.confirmations?.length ?? 0);
      setThreshold(tx.confirmationsRequired);

      if (tx.isExecuted && tx.transactionHash) {
        setOnChainTxHash(tx.transactionHash);
        setState("confirmed");
      } else if ((tx.confirmations?.length ?? 0) >= tx.confirmationsRequired) {
        setState("executing");
      } else {
        setState("awaitingSignatures");
      }
    } catch (err) {
      console.error("[useSafeContractAction] Failed to refresh:", err);
    }
  }, [safeTxHash]);

  const execute = useCallback(
    async (params: {
      address: `0x${string}`;
      abi: Abi;
      functionName: string;
      args?: readonly unknown[];
      value?: bigint;
    }): Promise<string | null> => {
      if (!address) {
        setError("No wallet connected");
        setState("error");
        return null;
      }

      reset();
      setState("proposing");

      try {
        // Encode the contract call data
        const data = encodeFunctionData({
          abi: params.abi,
          functionName: params.functionName,
          args: params.args as unknown[],
        });

        // Propose to Safe
        const txHash = await proposeTransaction(
          address,       // Safe address (connected wallet IS the Safe)
          address,       // Signer — this triggers the wallet popup for the connected owner
          params.address, // Target contract
          (params.value ?? 0n).toString(),
          data,
        );

        setSafeTxHash(txHash);
        setState("proposed");

        // Immediately check signature status
        try {
          const tx = await getTransaction(txHash);
          setConfirmations(tx.confirmations?.length ?? 1);
          setThreshold(tx.confirmationsRequired);
          if (tx.confirmationsRequired <= 1) {
            // Single-signer Safe — may auto-execute
            if (tx.isExecuted && tx.transactionHash) {
              setOnChainTxHash(tx.transactionHash);
              setState("confirmed");
            }
          } else {
            setState("awaitingSignatures");
          }
        } catch {
          // Ignore — status will be "proposed" until refreshed
        }

        return txHash;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("User rejected") || msg.includes("user rejected")) {
          setError("Transaction proposal was rejected in your wallet.");
        } else {
          setError(msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
        }
        setState("error");
        return null;
      }
    },
    [address, reset],
  );

  const safeTxUrl = safeTxHash && address ? getSafeTxUrl(address, safeTxHash) : null;
  const onChainTxUrl = onChainTxHash ? getTxUrl(chainId, onChainTxHash) : null;

  return {
    execute,
    state,
    safeTxHash,
    safeTxUrl,
    onChainTxHash,
    onChainTxUrl,
    confirmations,
    threshold,
    error,
    reset,
    refreshStatus,
  };
}
