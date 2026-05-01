"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Send, AlertTriangle, CheckCircle2, Wallet } from "lucide-react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits, formatUnits, isAddress, type Abi } from "viem";
import { Button, Spinner } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { useAuth } from "@/contexts/AuthContext";
import { getPortfolio, type Holding } from "@/lib/api/repositories/portfolio.repository";
import { getTxUrl } from "@/lib/contracts/addresses";
import { useContractAction } from "@/hooks/useContractAction";
import { useToast, ToastContainer } from "@/components/molecules/Toast";

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

function parseBatchInput(raw: string, decimals: number): { rows: BatchRow[] } {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [] };
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
  return { rows };
}

interface TokenOption {
  tokenId: string;
  name: string;
  symbol: string;
  contractAddress: `0x${string}`;
  balance: string;
}

function NoticeBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3.5 rounded-xl bg-box border border-black/10 flex gap-2.5">
      <AlertTriangle className="h-4 w-4 text-text flex-shrink-0 mt-0.5" />
      <p className="text-sm text-text/80 leading-relaxed">{children}</p>
    </div>
  );
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

  const [batchMode, setBatchMode] = useState(false);
  const [batchInput, setBatchInput] = useState("");
  const batchAction = useContractAction();

  const transferAction = useContractAction();
  const { showError, showSuccess, toasts, removeToast } = useToast();

  const isTransferPending = transferAction.isPending;
  const isTransferConfirming = transferAction.isConfirming;
  const transferConfirmed = transferAction.isConfirmed;
  const transferError = transferAction.error;
  const txHash = transferAction.txHash;

  const { data: onChainBalance } = useReadContract({
    address: selectedToken?.contractAddress,
    abi: ERC20_TRANSFER_ABI,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!selectedToken?.contractAddress && !!walletAddress },
  });

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

  const tokenOptions: TokenOption[] = holdings
    .filter((h) => h.contract_address && isAddress(h.contract_address))
    .map((h) => ({
      tokenId: h.token_id,
      name: h.token_name,
      symbol: h.token_symbol,
      contractAddress: h.contract_address as `0x${string}`,
      balance: h.balance,
    }));

  useEffect(() => {
    if (transferConfirmed) setStep("success");
  }, [transferConfirmed]);

  useEffect(() => {
    if (transferError) {
      const msg = transferError;
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
    <DashboardLayout title="Transfer Tokens" description="Send tokens to another KYC-verified wallet">
      <div className="py-2">
        <Link
          href="/portfolio"
          className="inline-flex items-center gap-1.5 text-black/50 hover:text-text transition-colors mb-5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Portfolio
        </Link>

        {/* Wallet not connected */}
        {!isConnected && (
          <div className="bg-white rounded-2xl border border-black/10 p-6 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-box flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-darkAqua" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text">Connect your wallet to transfer tokens</p>
              <p className="text-xs text-black/50 mt-0.5">You&apos;ll sign each transfer in your wallet.</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => openConnectModal?.()}>Connect Wallet</Button>
          </div>
        )}

        {/* Success */}
        {isConnected && step === "success" && (
          <div className="bg-white rounded-2xl border border-black/10 p-8 max-w-lg mx-auto text-center">
            <div className="w-14 h-14 rounded-full bg-darkAqua/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-darkAqua" />
            </div>
            <h2 className="text-xl font-semibold text-text mb-1.5">Transfer Successful</h2>
            <p className="text-sm text-black/60 mb-5">
              {numericAmount.toLocaleString()} {selectedToken?.symbol} sent to {recipient.slice(0, 8)}…{recipient.slice(-6)}
            </p>
            <div className="space-y-2.5">
              {txHash && (
                <a href={getTxUrl(chainId, txHash) ?? undefined} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full">View Transaction</Button>
                </a>
              )}
              <Link href="/portfolio">
                <Button variant="primary" className="w-full">Back to Portfolio</Button>
              </Link>
            </div>
          </div>
        )}

        {/* Confirm */}
        {isConnected && step === "confirm" && (
          <div className="bg-white rounded-2xl border border-black/10 p-6 max-w-lg mx-auto">
            <h2 className="text-base font-semibold text-text mb-4">Confirm Transfer</h2>
            <div className="bg-box rounded-xl p-4 space-y-2.5 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-black/60">Token</span>
                <span className="font-semibold">{selectedToken?.name} ({selectedToken?.symbol})</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-black/60">Amount</span>
                <span className="font-semibold">{numericAmount.toLocaleString()} {selectedToken?.symbol}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-black/60">Recipient</span>
                <span className="font-mono text-xs text-text">{recipient}</span>
              </div>
            </div>

            <div className="mb-4">
              <NoticeBanner>
                This action is irreversible. The recipient must be KYC-verified — the transfer will revert on-chain otherwise.
              </NoticeBanner>
            </div>

            {error && <p className="text-sm text-text mb-3">{error}</p>}

            <div className="flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setStep("form"); setError(null); }}
                disabled={isTransacting}
              >
                Back
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={executeTransfer}
                isLoading={isTransacting}
              >
                {isTransferPending ? "Sign in Wallet..." : isTransferConfirming ? "Confirming..." : "Send Tokens"}
              </Button>
            </div>
          </div>
        )}

        {/* Form */}
        {isConnected && step === "form" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            <div className="bg-white rounded-2xl border border-black/10 p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold text-text">
                  {batchMode ? "Batch Send Tokens" : "Send Tokens"}
                </h2>
                <button
                  onClick={() => { setBatchMode((m) => !m); setError(null); }}
                  className="text-xs font-medium text-darkAqua hover:underline"
                >
                  {batchMode ? "Single send" : "Batch send"}
                </button>
              </div>
              <p className="text-sm text-black/50 mb-4">
                {batchMode
                  ? "Send to multiple KYC-verified wallets in one transaction."
                  : "Recipient must be KYC-verified — transfers to non-whitelisted wallets revert."}
              </p>

              {tokenOptions.length === 0 ? (
                <div className="rounded-xl bg-box p-6 text-center">
                  <p className="text-sm font-semibold text-text">No project tokens to transfer yet.</p>
                  <p className="text-xs text-black/60 leading-relaxed mt-2 max-w-md mx-auto">
                    During the vesting period, you hold <span className="font-semibold">fraction tokens</span> instead —
                    those are transferable too, but from the Fraction Transfer page. Once you claim, your project
                    tokens land here for normal transfer.
                  </p>
                  <div className="flex gap-3 justify-center mt-3 flex-wrap">
                    <Link
                      href="/portfolio/fraction-transfer"
                      className="text-darkAqua hover:underline text-sm font-medium"
                    >
                      Transfer fractions →
                    </Link>
                    <span className="text-black/30">·</span>
                    <Link
                      href="/portfolio/vesting"
                      className="text-darkAqua hover:underline text-sm font-medium"
                    >
                      View vesting schedule →
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-text mb-1.5 uppercase tracking-wider">Select Token</label>
                    <select
                      value={selectedToken?.tokenId ?? ""}
                      onChange={(e) => {
                        const opt = tokenOptions.find((t) => t.tokenId === e.target.value) ?? null;
                        setSelectedToken(opt);
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua bg-white"
                    >
                      <option value="">Choose a token…</option>
                      {tokenOptions.map((t) => (
                        <option key={t.tokenId} value={t.tokenId}>
                          {t.name} ({t.symbol}) — Balance: {Number(t.balance).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!batchMode && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-text mb-1.5 uppercase tracking-wider">Recipient Address</label>
                        <input
                          type="text"
                          value={recipient}
                          onChange={(e) => setRecipient(e.target.value)}
                          placeholder="0x…"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua font-mono"
                        />
                        {recipient && !isAddress(recipient) && (
                          <p className="text-xs text-text/70 mt-1">Invalid Ethereum address</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-text mb-1.5 uppercase tracking-wider">Amount</label>
                        <div className="relative">
                          <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0"
                            min="0"
                            step="any"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua pr-16"
                          />
                          {selectedToken && (
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-black/50 font-semibold text-sm">
                              {selectedToken.symbol}
                            </span>
                          )}
                        </div>
                        {selectedToken && (
                          <button
                            onClick={() => setAmount(onChainBalanceFormatted.toString())}
                            className="mt-1 text-xs text-darkAqua hover:underline"
                          >
                            Use max balance
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  {batchMode && (
                    <div>
                      <label className="block text-xs font-semibold text-text mb-1.5 uppercase tracking-wider">
                        Recipients (one per line: <code className="text-xs font-mono normal-case">address,amount</code>)
                      </label>
                      <textarea
                        value={batchInput}
                        onChange={(e) => setBatchInput(e.target.value)}
                        rows={6}
                        placeholder={`0xabc123…,100\n0xdef456…,250`}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua resize-y"
                      />
                      {batchInput && (() => {
                        const { rows } = parseBatchInput(batchInput, decimals);
                        const validCount = rows.filter((r) => r.valid).length;
                        const invalidRows = rows.filter((r) => !r.valid);
                        return (
                          <div className="mt-1.5 space-y-0.5">
                            <p className="text-xs text-black/50">{validCount} valid / {rows.length} total rows</p>
                            {invalidRows.map((r, i) => (
                              <p key={i} className="text-xs text-text/70">{r.address.slice(0, 10)}… — {r.error}</p>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {error && <p className="text-sm text-text">{error}</p>}

                  {batchMode ? (
                    <Button
                      variant="primary"
                      className="w-full"
                      disabled={!selectedToken || !batchInput.trim() || batchAction.isPending || batchAction.isConfirming}
                      isLoading={batchAction.isPending || batchAction.isConfirming}
                      onClick={executeBatchTransfer}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {batchAction.isPending ? "Sign in Wallet…" : batchAction.isConfirming ? "Confirming…" : "Send Batch"}
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      className="w-full"
                      disabled={!selectedToken || !recipient || numericAmount <= 0}
                      onClick={handleTransfer}
                    >
                      <Send className="h-4 w-4 mr-2" /> Review Transfer
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Side panel — context */}
            <aside className="space-y-4">
              {selectedToken && (
                <div className="bg-white rounded-2xl border border-black/10 p-4">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-black/50 mb-1.5">On-chain balance</p>
                  <p className="text-xl font-bold text-text tabular-nums">
                    {onChainBalanceFormatted.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    <span className="text-sm font-normal text-black/50 ml-1.5">{selectedToken.symbol}</span>
                  </p>
                  <p className="text-[11px] text-black/40 mt-1.5 font-mono break-all">{selectedToken.contractAddress}</p>
                </div>
              )}
              <NoticeBanner>
                Recipient must be KYC-verified and whitelisted on the token&apos;s identity registry. Transfers to non-whitelisted wallets will revert.
              </NoticeBanner>
            </aside>
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </DashboardLayout>
  );
}
