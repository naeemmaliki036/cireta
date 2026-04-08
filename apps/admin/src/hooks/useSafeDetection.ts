"use client";

import { useState, useEffect } from "react";
import { useAccount, usePublicClient } from "wagmi";

/**
 * Detects whether the connected wallet is a Safe (contract) wallet.
 * Returns isSafe boolean. Safe wallets have deployed bytecode at their address.
 *
 * This is a read-only check — zero impact on existing EOA flows.
 */
export function useSafeDetection(): { isSafe: boolean; isDetecting: boolean } {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [isSafe, setIsSafe] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);

  useEffect(() => {
    if (!address || !publicClient) {
      setIsSafe(false);
      setIsDetecting(false);
      return;
    }

    let cancelled = false;
    setIsDetecting(true);

    publicClient
      .getCode({ address: address as `0x${string}` })
      .then((code) => {
        if (!cancelled) setIsSafe(!!code && code !== "0x");
      })
      .catch(() => {
        if (!cancelled) setIsSafe(false);
      })
      .finally(() => {
        if (!cancelled) setIsDetecting(false);
      });

    return () => { cancelled = true; };
  }, [address, publicClient]);

  return { isSafe, isDetecting };
}
