"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Send, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  useAccount,
  useChainId,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits, formatUnits, isAddress } from "viem";
import { Button, Spinner } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { useAuth } from "@/contexts/AuthContext";
import { getPortfolio, type Holding } from "@/lib/api/repositories/portfolio.repository";
import { getTxUrl } from "@/lib/contracts/addresses";

/**
 * Minimal ERC-20 ABI for transfer + balanceOf + decimals.
 */
const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
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
] as const;

interface TokenOption {
  tokenId: string;
  name: string;
  symbol: string;
  contractAddress: `0x${string}`;
  balance: string;
}

export default function TransferPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isConnected, address: walletAddress } = useAccount();
  const chainId = useChainId();
  const { openConnectModal } = useConnectModal();

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState<TokenOption | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "confirm" | "success">("form");

  // Wagmi: transfer
  const {
    writeContract,
    data: txHash,
    isPending: isTransferPending,
    error: transferError,
  } = useWriteContract();

  const {
    isSuccess: transferConfirmed,
    isLoading: isTransferConfirming,
  } = useWaitForTransactionReceipt({ hash: txHash });

  // Read on-chain balance for selected token
  const { data: onChainBalance } = useReadContract({
    address: selectedToken?.contractAddress,
    abi: ERC20_TRANSFER_ABI,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!selectedToken?.contractAddress && !!walletAddress },
  });

  // Read decimals for selected token
  const { data: tokenDecimals } = useReadContract({
    address: selectedToken?.contractAddress,
    abi: ERC20_TRANSFER_ABI,
    functionName: "decimals",
    query: { enabled: !!selectedToken?.contractAddress },
  });

  const decimals = typeof tokenDecimals === "number" ? tokenDecimals : 18;
  const onChainBalanceFormatted = onChainBalance
    ? Number(formatUnits(onChainBalance as bigint, decimals))
    : 0;

  // Load portfolio holdings
  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await getPortfolio();
        setHoldings(data.holdings);
      } catch {
        setError("Failed to load holdings.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, authLoading]);

  // Build token options from holdings that have a contract address
  const tokenOptions: TokenOption[] = holdings
    .filter((h) => h.contract_address && isAddress(h.contract_address))
    .map((h) => ({
      tokenId: h.token_id,
      name: h.token_name,
      symbol: h.token_symbol,
      contractAddress: h.contract_address as `0x${string}`,
      balance: h.balance,
    }));

  // When transfer confirms, show success
  useEffect(() => {
    if (transferConfirmed) {
      setStep("success");
    }
  }, [transferConfirmed]);

  // Handle transfer error
  useEffect(() => {
    if (transferError) {
      const msg = transferError.message || "Transfer failed";
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        setError("Transaction was rejected in your wallet.");
      } else if (msg.includes("not whitelisted") || msg.includes("identity")) {
        setError("Recipient is not KYC-verified or whitelisted. Transfer was rejected by the token contract.");
      } else {
        setError(msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
      }
    }
  }, [transferError]);

  const numericAmount = parseFloat(amount) || 0;

  const handleTransfer = useCallback(() => {
    if (!selectedToken) {
      setError("Please select a token.");
      return;
    }
    if (!recipient || !isAddress(recipient)) {
      setError("Please enter a valid recipient address.");
      return;
    }
    if (numericAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    if (numericAmount > onChainBalanceFormatted) {
      setError("Amount exceeds your on-chain balance.");
      return;
    }

    setError(null);
    setStep("confirm");
  }, [selectedToken, recipient, numericAmount, onChainBalanceFormatted]);

  const executeTransfer = useCallback(() => {
    if (!selectedToken) return;
    setError(null);
    try {
      writeContract({
        address: selectedToken.contractAddress,
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [recipient as `0x${string}`, parseUnits(amount, decimals)],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    }
  }, [writeContract, selectedToken, recipient, amount, decimals]);

  const isTransacting = isTransferPending || isTransferConfirming;

  if (loading || authLoading) {
    return (
      <DashboardLayout title="Transfer Tokens">
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Transfer Tokens" description="Send security tokens to another wallet">
      <div className="max-w-lg mx-auto py-4">
        <Link
          href="/portfolio"
          className="inline-flex items-center gap-2 text-black/50 hover:text-text transition-colors mb-6 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Portfolio
        </Link>

        {!isConnected ? (
          <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
            <Send className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-4">Connect your wallet to transfer tokens.</p>
            <Button variant="primary" onClick={() => openConnectModal?.()}>Connect Wallet</Button>
          </div>
        ) : step === "success" ? (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-semibold text-text mb-2">Transfer Successful</h2>
            <p className="text-black/50 mb-6">
              {numericAmount.toLocaleString()} {selectedToken?.symbol} sent to {recipient.slice(0, 8)}...{recipient.slice(-6)}
            </p>
            <div className="space-y-3">
              {txHash && (
                <a href={getTxUrl(chainId, txHash)} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full" size="lg">View on BaseScan</Button>
                </a>
              )}
              <Link href="/portfolio">
                <Button variant="primary" className="w-full" size="lg">Back to Portfolio</Button>
              </Link>
            </div>
          </div>
        ) : step === "confirm" ? (
          <div className="bg-white rounded-2xl p-8 border border-gray-100">
            <h2 className="text-xl font-semibold text-text mb-6">Confirm Transfer</h2>
            <div className="bg-gray-50 rounded-xl p-5 space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-black/50">Token</span>
                <span className="font-semibold">{selectedToken?.name} ({selectedToken?.symbol})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-black/50">Amount</span>
                <span className="font-semibold">{numericAmount.toLocaleString()} {selectedToken?.symbol}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-black/50">Recipient</span>
                <span className="font-semibold font-mono text-xs">{recipient}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3 mb-6">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                This action is irreversible. Security tokens require the recipient to be KYC-verified and whitelisted. The transfer will revert on-chain if they are not.
              </p>
            </div>

            {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                size="lg"
                onClick={() => { setStep("form"); setError(null); }}
                disabled={isTransacting}
              >
                Back
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                size="lg"
                onClick={executeTransfer}
                isLoading={isTransacting}
              >
                {isTransferPending ? "Sign in Wallet..." : isTransferConfirming ? "Confirming..." : "Send Tokens"}
              </Button>
            </div>
          </div>
        ) : (
          /* Form step */
          <div className="bg-white rounded-2xl p-8 border border-gray-100">
            <h2 className="text-xl font-semibold text-text mb-1">Transfer Tokens</h2>
            <p className="text-sm text-black/40 mb-6">Send security tokens to another KYC-verified wallet.</p>

            {/* Warning */}
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3 mb-6">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                Recipient must be KYC-verified. Transfer will fail if they are not whitelisted on the identity registry.
              </p>
            </div>

            {tokenOptions.length === 0 ? (
              <div className="text-center py-8 text-black/40 text-sm">
                <p>No transferable tokens found in your portfolio.</p>
                <p className="text-xs mt-1">Tokens need a deployed contract address to be transferable.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Token Selector */}
                <div>
                  <label className="block text-sm font-semibold text-text mb-2">Select Token</label>
                  <select
                    value={selectedToken?.tokenId ?? ""}
                    onChange={(e) => {
                      const opt = tokenOptions.find((t) => t.tokenId === e.target.value) ?? null;
                      setSelectedToken(opt);
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua bg-white"
                  >
                    <option value="">Choose a token...</option>
                    {tokenOptions.map((t) => (
                      <option key={t.tokenId} value={t.tokenId}>
                        {t.name} ({t.symbol}) - Balance: {Number(t.balance).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* On-chain balance */}
                {selectedToken && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-black/50">On-Chain Balance</span>
                      <span className="font-semibold">{onChainBalanceFormatted.toLocaleString()} {selectedToken.symbol}</span>
                    </div>
                    <p className="text-xs text-black/30 mt-1 font-mono truncate">{selectedToken.contractAddress}</p>
                  </div>
                )}

                {/* Recipient */}
                <div>
                  <label className="block text-sm font-semibold text-text mb-2">Recipient Address</label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua font-mono"
                  />
                  {recipient && !isAddress(recipient) && (
                    <p className="text-xs text-red-500 mt-1">Invalid Ethereum address</p>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-semibold text-text mb-2">Amount</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      min="0"
                      step="any"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua pr-16"
                    />
                    {selectedToken && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-black/40 font-semibold text-sm">
                        {selectedToken.symbol}
                      </span>
                    )}
                  </div>
                  {selectedToken && (
                    <button
                      onClick={() => setAmount(onChainBalanceFormatted.toString())}
                      className="mt-1.5 text-xs text-darkAqua hover:underline"
                    >
                      Use max balance
                    </button>
                  )}
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <Button
                  variant="primary"
                  className="w-full"
                  size="lg"
                  disabled={!selectedToken || !recipient || numericAmount <= 0}
                  onClick={handleTransfer}
                >
                  <Send className="h-4 w-4 mr-2" /> Review Transfer
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
