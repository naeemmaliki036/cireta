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
import { parseUnits, formatUnits, isAddress, type Abi } from "viem";
import { Button, Spinner } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { useAuth } from "@/contexts/AuthContext";
import { getPortfolio, type Holding } from "@/lib/api/repositories/portfolio.repository";
import { getTxUrl } from "@/lib/contracts/addresses";
import { useContractAction } from "@/hooks/useContractAction";
import { useToast, ToastContainer } from "@/components/molecules/Toast";

/**
 * Minimal ERC-20 ABI for transfer + batchTransfer + balanceOf + decimals.
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
    name: "batchTransfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "toList", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
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

interface BatchRow {
  address: string;
  amount: string;
  valid: boolean;
  error: string;
}

function parseBatchInput(raw: string, decimals: number): { rows: BatchRow[]; parseError: string | null } {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], parseError: null };
  const rows: BatchRow[] = lines.map((line): BatchRow => {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 2) return { address: line, amount: "", valid: false, error: "Expected format: address,amount" };
    const addr = parts[0] ?? "";
    const amt = parts[1] ?? "";
    if (!isAddress(addr)) return { address: addr, amount: amt, valid: false, error: "Invalid address" };
    const numAmt = parseFloat(amt);
    if (isNaN(numAmt) || numAmt <= 0) return { address: addr, amount: amt, valid: false, error: "Invalid amount" };
    try {
      parseUnits(amt, decimals);
      return { address: addr, amount: amt, valid: true, error: "" };
    } catch {
      return { address: addr, amount: amt, valid: false, error: "Amount parsing failed" };
    }
  });
  return { rows, parseError: null };
}

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

  // Batch send mode
  const [batchMode, setBatchMode] = useState(false);
  const [batchInput, setBatchInput] = useState("");
  const batchAction = useContractAction();

  // Unified contract action for transfer
  const transferAction = useContractAction();
  const { showError, showSuccess, toasts, removeToast } = useToast();

  // Derived states for compatibility
  const isTransferPending = transferAction.isPending;
  const isTransferConfirming = transferAction.isConfirming;
  const transferConfirmed = transferAction.isConfirmed;
  const transferError = transferAction.error;
  const txHash = transferAction.txHash;

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
      const msg = transferError || "Transfer failed";
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

  const executeBatchTransfer = useCallback(async () => {
    if (!selectedToken) return;
    const { rows } = parseBatchInput(batchInput, decimals);
    const valid = rows.filter((r) => r.valid);
    if (valid.length === 0) { setError("No valid rows."); return; }
    setError(null);
    try {
      await batchAction.execute({
        address: selectedToken.contractAddress,
        abi: ERC20_TRANSFER_ABI as unknown as Abi,
        functionName: "batchTransfer",
        args: [
          valid.map((r) => r.address as `0x${string}`),
          valid.map((r) => parseUnits(r.amount, decimals)),
        ],
      });
      showSuccess("Batch Transfer Initiated", `Sending to ${valid.length} recipients.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Batch transfer failed";
      setError(msg);
      showError("Batch Transfer Failed", msg);
    }
  }, [batchAction, selectedToken, batchInput, decimals, showSuccess, showError]);

  const executeTransfer = useCallback(async () => {
    if (!selectedToken) return;

    setError(null);

    try {
      await transferAction.execute({
        address: selectedToken.contractAddress,
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [recipient as `0x${string}`, parseUnits(amount, decimals)],
        // gas automatically handled by useContractAction (200k for transfer)
      });
      showSuccess("Transfer Initiated", "Your token transfer has been submitted to the blockchain.");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Transfer failed";
      setError(errorMsg);
      showError("Transfer Failed", errorMsg);
    }
  }, [transferAction, selectedToken, recipient, amount, decimals, showSuccess, showError]);

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
                <a href={getTxUrl(chainId, txHash) ?? undefined} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full" size="lg">View Transaction</Button>
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
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-semibold text-text">
                {batchMode ? "Batch Send Tokens" : "Transfer Tokens"}
              </h2>
              <button
                onClick={() => { setBatchMode((m) => !m); setError(null); }}
                className="text-xs font-medium text-darkAqua hover:underline"
              >
                {batchMode ? "Single send" : "Batch send"}
              </button>
            </div>
            <p className="text-sm text-black/40 mb-6">
              {batchMode
                ? "Send to multiple KYC-verified wallets in one transaction."
                : "Send security tokens to another KYC-verified wallet."
              }
            </p>

            {/* Warning */}
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3 mb-6">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                Recipient must be KYC-verified. Transfer will fail if they are not whitelisted on the identity registry.
              </p>
            </div>

            {tokenOptions.length === 0 ? (
              <div className="text-center py-8 text-black/50 text-sm space-y-3">
                <p className="font-medium text-text">No transferable tokens yet.</p>
                <p className="text-xs leading-relaxed max-w-sm mx-auto">
                  Tokens you bought are held as <span className="font-semibold">soul-bound fractions</span> while
                  the sale is vesting — they can&apos;t be transferred. After the vesting cliff, claim your
                  tokens to receive transferable ERC-3643 project tokens.
                </p>
                <Link
                  href="/portfolio/vesting"
                  className="inline-block text-darkAqua hover:underline text-sm font-medium pt-1"
                >
                  View your vesting schedule &rarr;
                </Link>
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

                {batchMode ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-text mb-2">
                        Recipients (one per line: <code className="text-xs font-mono">address,amount</code>)
                      </label>
                      <textarea
                        value={batchInput}
                        onChange={(e) => setBatchInput(e.target.value)}
                        rows={6}
                        placeholder={`0xabc123...,100\n0xdef456...,250`}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua resize-y"
                      />
                      {batchInput && (() => {
                        const { rows } = parseBatchInput(batchInput, decimals);
                        const validCount = rows.filter((r) => r.valid).length;
                        const invalidRows = rows.filter((r) => !r.valid);
                        return (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-zinc-500">{validCount} valid / {rows.length} total rows</p>
                            {invalidRows.map((r, i) => (
                              <p key={i} className="text-xs text-red-500">{r.address.slice(0, 10)}… — {r.error}</p>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    {batchAction.isConfirmed && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4" /> Batch transfer confirmed
                      </div>
                    )}
                    {batchAction.error && <p className="text-sm text-red-500">{batchAction.error}</p>}
                    <Button
                      variant="primary"
                      className="w-full"
                      size="lg"
                      disabled={!selectedToken || !batchInput.trim() || batchAction.isPending || batchAction.isConfirming}
                      isLoading={batchAction.isPending || batchAction.isConfirming}
                      onClick={executeBatchTransfer}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {batchAction.isPending ? "Sign in Wallet..." : batchAction.isConfirming ? "Confirming..." : "Send Batch"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    className="w-full"
                    size="lg"
                    disabled={!selectedToken || !recipient || numericAmount <= 0}
                    onClick={handleTransfer}
                  >
                    <Send className="h-4 w-4 mr-2" /> Review Transfer
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </DashboardLayout>
  );
}
