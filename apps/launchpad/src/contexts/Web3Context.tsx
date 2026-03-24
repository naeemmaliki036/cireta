"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useAccount, useBalance, useDisconnect, usePublicClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";

// Base Mainnet USDC
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const BASE_CHAIN_ID = 8453;

interface Web3ContextValue {
  /** Wallet connection state */
  address: string | undefined;
  isConnected: boolean;
  chainId: number | undefined;
  isCorrectChain: boolean;
  /** ETH balance in ether */
  ethBalance: string;
  /** Whether connected wallet is a smart contract (Safe/multisig) */
  isSafe: boolean;
  /** Open RainbowKit connect modal */
  connect: () => void;
  /** Disconnect wallet */
  disconnect: () => void;
}

const Web3Context = createContext<Web3ContextValue | null>(null);

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  const { address, isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();

  const [ethBalance, setEthBalance] = useState("0");
  const [isSafe, setIsSafe] = useState(false);

  const { data: balanceData } = useBalance({ address });

  useEffect(() => {
    if (balanceData) {
      const formatted = parseFloat(balanceData.formatted).toFixed(4);
      setEthBalance(formatted);
    }
  }, [balanceData]);

  // Detect Safe/contract wallets via eth_getCode
  useEffect(() => {
    if (!address || !publicClient) {
      setIsSafe(false);
      return;
    }

    let cancelled = false;

    publicClient
      .getCode({ address: address as `0x${string}` })
      .then((code) => {
        if (!cancelled) {
          // If bytecode exists (not "0x"), it's a contract wallet (Safe)
          setIsSafe(!!code && code !== "0x");
        }
      })
      .catch(() => {
        if (!cancelled) setIsSafe(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, publicClient]);

  const connect = useCallback(() => {
    openConnectModal?.();
  }, [openConnectModal]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setIsSafe(false);
  }, [disconnect]);

  const isCorrectChain = chainId === BASE_CHAIN_ID;

  const value: Web3ContextValue = {
    address,
    isConnected,
    chainId,
    isCorrectChain,
    ethBalance,
    isSafe,
    connect,
    disconnect: handleDisconnect,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3(): Web3ContextValue {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error("useWeb3 must be used inside Web3Provider");
  return ctx;
}
