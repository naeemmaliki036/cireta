"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId } from "wagmi";
import { encodeFunctionData, type Abi } from "viem";
import { proposeTransaction, getTransaction, getSafeTxUrl } from "@/lib/safe/safeClient";
import type { SafeTxState } from "@/components/molecules/SafeTransactionStatus";
import { getTxUrl } from "@/lib/contracts/addresses";

export interface SafeContractActionState {
  execute: (params: {
    address: `0x${string}`;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  }) => Promise<string | null>;
  state: SafeTxState;
  safeTxHash: string | null;
  safeTxUrl: string | null;
  onChainTxHash: string | null;
  onChainTxUrl: string | null;
  confirmations: number;
  threshold: number;
  error: string | null;
  reset: () => void;
  refreshStatus: () => Promise<void>;
}

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

  const getTxExplorerUrl = (hash: string): string | null => getTxUrl(chainId, hash);

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
        const data = encodeFunctionData({
          abi: params.abi,
          functionName: params.functionName,
          args: params.args as unknown[],
        });

        const txHash = await proposeTransaction(
          address,
          address,
          params.address,
          (params.value ?? 0n).toString(),
          data,
        );

        setSafeTxHash(txHash);
        setState("proposed");

        try {
          const tx = await getTransaction(txHash);
          setConfirmations(tx.confirmations?.length ?? 1);
          setThreshold(tx.confirmationsRequired);
          if (tx.confirmationsRequired <= 1) {
            if (tx.isExecuted && tx.transactionHash) {
              setOnChainTxHash(tx.transactionHash);
              setState("confirmed");
            }
          } else {
            setState("awaitingSignatures");
          }
        } catch {
          // Status stays "proposed"
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
  const onChainTxUrl = onChainTxHash ? getTxExplorerUrl(onChainTxHash) : null;

  return {
    execute, state, safeTxHash, safeTxUrl, onChainTxHash, onChainTxUrl,
    confirmations, threshold, error, reset, refreshStatus,
  };
}
