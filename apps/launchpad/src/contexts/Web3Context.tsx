"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useAccount, useBalance, useDisconnect, usePublicClient, useSignMessage } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAuth } from "@/contexts/AuthContext";
import { listWallets, linkWallet } from "@/lib/api/repositories/wallets.repository";

export const BASE_CHAIN_ID = 8453;

interface Web3ContextValue {
  address: string | undefined;
  isConnected: boolean;
  chainId: number | undefined;
  isCorrectChain: boolean;
  ethBalance: string;
  isSafe: boolean;
  isVerified: boolean;
  isVerifying: boolean;
  connect: () => void;
  disconnect: () => void;
  verifyWallet: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextValue | null>(null);

export function Web3Provider({ children }: { children: ReactNode }) {
  const { address, isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [ethBalance, setEthBalance] = useState("0");
  const [isSafe, setIsSafe] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Cache to avoid repeated API calls
  const verifiedAddresses = useRef<Set<string>>(new Set());
  const checkInFlight = useRef(false);

  const { data: balanceData } = useBalance({ address: isAuthenticated ? address : undefined });

  useEffect(() => {
    if (balanceData) {
      setEthBalance(parseFloat(balanceData.formatted).toFixed(4));
    }
  }, [balanceData]);

  // Detect Safe/contract wallets
  useEffect(() => {
    if (!address || !publicClient) { setIsSafe(false); return; }
    let cancelled = false;
    publicClient
      .getCode({ address: address as `0x${string}` })
      .then((code) => { if (!cancelled) setIsSafe(!!code && code !== "0x"); })
      .catch(() => { if (!cancelled) setIsSafe(false); });
    return () => { cancelled = true; };
  }, [address, publicClient]);

  // Silently check if wallet is already linked — NO state changes that trigger re-renders in other contexts
  useEffect(() => {
    if (authLoading) return;
    if (!address || !isConnected || !isAuthenticated) return;

    const addr = address.toLowerCase();
    if (verifiedAddresses.current.has(addr)) {
      setIsVerified(true);
      return;
    }

    // Prevent concurrent checks
    if (checkInFlight.current) return;
    checkInFlight.current = true;

    let cancelled = false;
    listWallets()
      .then((wallets) => {
        if (cancelled) return;
        const linked = wallets.some((w) => w.address.toLowerCase() === addr);
        if (linked) {
          verifiedAddresses.current.add(addr);
          setIsVerified(true);
        }
      })
      .catch(() => {
        // 401 or network error — silently ignore, do NOT retry
      })
      .finally(() => {
        checkInFlight.current = false;
      });

    return () => { cancelled = true; };
  }, [address, isConnected, isAuthenticated]);

  // Reset on disconnect or auth change
  useEffect(() => {
    if (!isConnected || !isAuthenticated) {
      setIsVerified(false);
    }
  }, [isConnected, isAuthenticated]);

  // Manual verification
  const verifyWallet = useCallback(async () => {
    if (!address || !isAuthenticated || isVerified) return;

    setIsVerifying(true);
    try {
      const wallets = await listWallets();
      const alreadyLinked = wallets.some((w) => w.address.toLowerCase() === address.toLowerCase());
      if (alreadyLinked) {
        verifiedAddresses.current.add(address.toLowerCase());
        setIsVerified(true);
        return;
      }

      const nonce = crypto.randomUUID();

      if (isSafe) {
        // Safe wallets can't do personal_sign — backend verifies via Safe owners list
        await linkWallet({ address, signature: "safe", nonce, is_safe: true });
      } else {
        const message = `I confirm that I am the owner of this wallet and authorize Cireta (cireta.com) to link it to my account.\n\nThis signature is only used for verification and does not grant access to your funds.\n\nNonce: ${nonce}`;
        const signature = await signMessageAsync({ message });
        await linkWallet({ address, signature, nonce });
      }

      verifiedAddresses.current.add(address.toLowerCase());
      setIsVerified(true);
    } catch {
      setIsVerified(false);
    } finally {
      setIsVerifying(false);
    }
  }, [address, isAuthenticated, isVerified, isSafe, signMessageAsync]);

  const connect = useCallback(() => { openConnectModal?.(); }, [openConnectModal]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setIsSafe(false);
    setIsVerified(false);
  }, [disconnect]);

  const isCorrectChain = chainId === BASE_CHAIN_ID;

  return (
    <Web3Context.Provider value={{
      address, isConnected, chainId, isCorrectChain, ethBalance,
      isSafe, isVerified, isVerifying, connect, disconnect: handleDisconnect, verifyWallet,
    }}>
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3(): Web3ContextValue {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error("useWeb3 must be used inside Web3Provider");
  return ctx;
}
