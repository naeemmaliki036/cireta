"use client";

import { useState, useEffect, useCallback } from "react";
import { createPublicClient } from "viem";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ISSUER_REGISTRY_ABI } from "@/lib/contracts/abis/issuerRegistry";
import { getAddresses } from "@/lib/contracts/addresses";
import { getChain, getTransport } from "@/lib/chain";
import { useContractAction, type ContractActionState } from "@/hooks/useContractAction";

export interface IssuerChainActionsState {
  /** Whether the connected wallet has ISSUER_MANAGER_ROLE or is the contract owner */
  hasManagerRole: boolean | null;
  suspendAction: ContractActionState;
  reactivateAction: ContractActionState;
  /** Execute backend-followed-by-chain suspend. Returns true when DB write succeeded. */
  executeChainSuspend: (
    walletAddress: string,
    reason: string,
    onSuccess: () => void,
    onError: (msg: string) => void
  ) => Promise<void>;
  /** Execute backend-followed-by-chain reactivate. Returns true when DB write succeeded. */
  executeChainReactivate: (
    walletAddress: string,
    onSuccess: () => void,
    onError: (msg: string) => void
  ) => Promise<void>;
  resetAll: () => void;
}

/**
 * Encapsulates the on-chain suspend + reactivate flows for IssuerRegistry,
 * including ISSUER_MANAGER_ROLE check against the connected wallet.
 */
export function useIssuerChainActions(): IssuerChainActionsState {
  const { isConnected, address: connectedAddress } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [hasManagerRole, setHasManagerRole] = useState<boolean | null>(null);
  const issuerRegistryAddr = getAddresses().issuerRegistry;

  const suspendAction = useContractAction();
  const reactivateAction = useContractAction();

  // Check ISSUER_MANAGER_ROLE whenever the connected wallet changes
  useEffect(() => {
    if (!isConnected || !connectedAddress || !issuerRegistryAddr) {
      setHasManagerRole(null);
      return;
    }
    const client = createPublicClient({ chain: getChain(), transport: getTransport() });
    (async () => {
      try {
        const [roleBytes, ownerAddr] = await Promise.all([
          client.readContract({
            address: issuerRegistryAddr,
            abi: ISSUER_REGISTRY_ABI,
            functionName: "ISSUER_MANAGER_ROLE",
            args: [],
          }) as Promise<`0x${string}`>,
          client.readContract({
            address: issuerRegistryAddr,
            abi: ISSUER_REGISTRY_ABI,
            functionName: "owner",
            args: [],
          }) as Promise<`0x${string}`>,
        ]);
        const hasRole = await client.readContract({
          address: issuerRegistryAddr,
          abi: ISSUER_REGISTRY_ABI,
          functionName: "hasRole",
          args: [roleBytes, connectedAddress],
        }) as boolean;
        setHasManagerRole(
          hasRole || ownerAddr.toLowerCase() === connectedAddress.toLowerCase()
        );
      } catch {
        setHasManagerRole(false);
      }
    })();
  }, [isConnected, connectedAddress, issuerRegistryAddr]);

  const executeChainSuspend = useCallback(
    async (
      walletAddress: string,
      reason: string,
      onSuccess: () => void,
      onError: (msg: string) => void
    ) => {
      if (!issuerRegistryAddr) return;
      if (!isConnected) {
        openConnectModal?.();
        onError("Connect your wallet to complete the on-chain suspension.");
        return;
      }
      try {
        await suspendAction.execute({
          address: issuerRegistryAddr,
          abi: ISSUER_REGISTRY_ABI,
          functionName: "suspendIssuer",
          args: [walletAddress as `0x${string}`, reason],
          gas: 300_000n,
        });
        onSuccess();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        const isRejected =
          msg.includes("user rejected") || msg.includes("User denied");
        onError(
          isRejected
            ? "DB suspended but on-chain suspension was cancelled."
            : `DB suspended but contract call failed: ${msg}`
        );
        suspendAction.reset();
      }
    },
    [issuerRegistryAddr, isConnected, openConnectModal, suspendAction]
  );

  const executeChainReactivate = useCallback(
    async (
      walletAddress: string,
      onSuccess: () => void,
      onError: (msg: string) => void
    ) => {
      if (!issuerRegistryAddr) return;
      if (!isConnected) {
        openConnectModal?.();
        onError("Connect your wallet to complete the on-chain reactivation.");
        return;
      }
      try {
        await reactivateAction.execute({
          address: issuerRegistryAddr,
          abi: ISSUER_REGISTRY_ABI,
          functionName: "reactivateIssuer",
          args: [walletAddress as `0x${string}`],
          gas: 300_000n,
        });
        onSuccess();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        const isRejected =
          msg.includes("user rejected") || msg.includes("User denied");
        onError(
          isRejected
            ? "DB reactivated but on-chain reactivation was cancelled."
            : `DB reactivated but contract call failed: ${msg}`
        );
        reactivateAction.reset();
      }
    },
    [issuerRegistryAddr, isConnected, openConnectModal, reactivateAction]
  );

  const resetAll = useCallback(() => {
    suspendAction.reset();
    reactivateAction.reset();
  }, [suspendAction, reactivateAction]);

  return {
    hasManagerRole,
    suspendAction,
    reactivateAction,
    executeChainSuspend,
    executeChainReactivate,
    resetAll,
  };
}
