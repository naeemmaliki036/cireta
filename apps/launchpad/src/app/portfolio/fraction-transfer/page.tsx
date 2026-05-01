"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2, Send, Wallet } from "lucide-react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { isAddress, type Abi } from "viem";
import { Button, Spinner } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { useAuth } from "@/contexts/AuthContext";
import { getTxUrl } from "@/lib/contracts/addresses";
import { useContractAction } from "@/hooks/useContractAction";
import { useToast, ToastContainer } from "@/components/molecules/Toast";
import { getVesting, type VestingSchedule } from "@/lib/api/repositories/portfolio.repository";

const FRACTION_TOKEN_ABI = [
  {
    name: "safeTransferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "id", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const FRACTION_TOKEN_IDS = [
  { id: 1n, label: "USDC Fraction" },
  { id: 2n, label: "OTC Fraction" },
] as const;

interface FractionHolding {
  tokenId: bigint;
  label: string;
  contractAddress: `0x${string}`;
  balance: bigint;
}

function NoticeBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3.5 rounded-xl bg-box border border-black/10 flex gap-2.5">
      <AlertTriangle className="h-4 w-4 text-text flex-shrink-0 mt-0.5" />
      <p className="text-sm text-text/80 leading-relaxed">{children}</p>
    </div>
  );
}

export default function FractionTransferPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isConnected, address: walletAddress } = useAccount();
  const chainId = useChainId();
  const { openConnectModal } = useConnectModal();

  const [vestingSchedules, setVestingSchedules] = useState<VestingSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHolding, setSelectedHolding] = useState<FractionHolding | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "confirm" | "success">("form");

  const transferAction = useContractAction();
  const { showError, showSuccess, toasts, removeToast } = useToast();

  const fractionHoldings: FractionHolding[] = vestingSchedules
    .filter((s) => s.fraction_token_address && isAddress(s.fraction_token_address))
    .flatMap((s) =>
      FRACTION_TOKEN_IDS.map((ft) => ({
        tokenId: ft.id,
        label: `${s.token_symbol ?? s.token_name ?? "Token"} — ${ft.label}`,
        contractAddress: s.fraction_token_address as `0x${string}`,
        balance: 0n,
      }))
    )
    .filter(
      (h, idx, self) =>
        self.findIndex((x) => x.contractAddress === h.contractAddress && x.tokenId === h.tokenId) === idx
    );

  const { data: onChainBalance } = useReadContract({
    address: selectedHolding?.contractAddress,
    abi: FRACTION_TOKEN_ABI as unknown as Abi,
    functionName: "balanceOf",
    args:
      selectedHolding && walletAddress
        ? [walletAddress, selectedHolding.tokenId]
        : undefined,
    query: { enabled: !!selectedHolding && !!walletAddress },
  });
  const balance = typeof onChainBalance === "bigint" ? onChainBalance : 0n;

  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await getVesting();
        setVestingSchedules(data);
      } catch {
        setError("Failed to load vesting schedules.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, authLoading]);

  useEffect(() => {
    if (transferAction.isConfirmed) setStep("success");
  }, [transferAction.isConfirmed]);

  const numericAmount = BigInt(Math.floor(parseFloat(amount) || 0));

  const handleReview = () => {
    if (!selectedHolding) { setError("Select a fraction token."); return; }
    if (!recipient || !isAddress(recipient)) { setError("Enter a valid recipient address."); return; }
    if (numericAmount <= 0n) { setError("Enter a valid amount."); return; }
    if (numericAmount > balance) { setError("Amount exceeds your balance."); return; }
    setError(null);
    setStep("confirm");
  };

  const handleTransfer = async () => {
    if (!selectedHolding || !walletAddress) return;
    setError(null);
    try {
      await transferAction.execute({
        address: selectedHolding.contractAddress,
        abi: FRACTION_TOKEN_ABI as unknown as Abi,
        functionName: "safeTransferFrom",
        args: [
          walletAddress,
          recipient as `0x${string}`,
          selectedHolding.tokenId,
          numericAmount,
          "0x" as `0x${string}`,
        ],
      });
      showSuccess("Fraction Transfer Initiated", "Transaction submitted to the blockchain.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transfer failed";
      setError(msg);
      showError("Transfer Failed", msg);
    }
  };

  if (loading || authLoading) {
    return (
      <DashboardLayout title="Fraction Transfer">
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Fraction Transfer"
      description="Send vesting-period fraction receipts to another KYC-verified wallet"
    >
      <div className="max-w-4xl py-2">
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
              <p className="text-sm font-semibold text-text">Connect your wallet to transfer fractions</p>
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
              Fractions sent to {recipient.slice(0, 8)}…{recipient.slice(-6)}
            </p>
            <div className="space-y-2.5">
              {transferAction.txHash && (
                <a href={getTxUrl(chainId, transferAction.txHash) ?? undefined} target="_blank" rel="noopener noreferrer">
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
            <h2 className="text-base font-semibold text-text mb-4">Confirm Fraction Transfer</h2>
            <div className="bg-box rounded-xl p-4 space-y-2.5 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-black/60">Token</span>
                <span className="font-semibold">{selectedHolding?.label}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-black/60">Amount</span>
                <span className="font-semibold">{numericAmount.toString()} fractions</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-black/60">Recipient</span>
                <span className="font-mono text-xs text-text">{recipient}</span>
              </div>
            </div>
            <div className="mb-4">
              <NoticeBanner>
                Fractions represent vesting claims — the recipient will assume your vesting rights for the transferred amount. This action is irreversible.
              </NoticeBanner>
            </div>
            {error && <p className="text-sm text-text mb-3">{error}</p>}
            <div className="flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setStep("form"); setError(null); }}
                disabled={transferAction.isPending || transferAction.isConfirming}
              >
                Back
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleTransfer}
                isLoading={transferAction.isPending || transferAction.isConfirming}
              >
                {transferAction.isPending ? "Sign in Wallet…" : transferAction.isConfirming ? "Confirming…" : "Send Fractions"}
              </Button>
            </div>
          </div>
        )}

        {/* Form */}
        {isConnected && step === "form" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            <div className="bg-white rounded-2xl border border-black/10 p-6">
              <h2 className="text-base font-semibold text-text mb-1">Send Fraction Tokens</h2>
              <p className="text-sm text-black/50 mb-4">
                Fractions are transferable to other KYC-verified wallets, or claimed for project tokens after the vesting cliff.
              </p>

              {fractionHoldings.length === 0 ? (
                <div className="rounded-xl bg-box p-6 text-center">
                  <p className="text-sm font-semibold text-text">No fraction tokens found.</p>
                  <p className="text-xs text-black/60 leading-relaxed mt-2 max-w-md mx-auto">
                    Fraction tokens are issued when you buy a vested sale. They appear here once the sale is deployed with vesting enabled.
                  </p>
                  <Link
                    href="/portfolio/vesting"
                    className="inline-block text-darkAqua hover:underline text-sm font-medium mt-3"
                  >
                    View vesting schedule →
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-text mb-1.5 uppercase tracking-wider">Select Fraction Token</label>
                    <select
                      value={selectedHolding ? `${selectedHolding.contractAddress}-${selectedHolding.tokenId}` : ""}
                      onChange={(e) => {
                        if (!e.target.value) { setSelectedHolding(null); return; }
                        const parts = e.target.value.split("-");
                        const addr = parts[0] ?? "";
                        const id = parts[1] ?? "0";
                        const found = fractionHoldings.find(
                          (h) => h.contractAddress === addr && h.tokenId === BigInt(id)
                        ) ?? null;
                        setSelectedHolding(found);
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua bg-white"
                    >
                      <option value="">Choose a fraction token…</option>
                      {fractionHoldings.map((h) => (
                        <option key={`${h.contractAddress}-${h.tokenId}`} value={`${h.contractAddress}-${h.tokenId}`}>
                          {h.label}
                        </option>
                      ))}
                    </select>
                  </div>

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
                    <label className="block text-xs font-semibold text-text mb-1.5 uppercase tracking-wider">Amount (whole fractions)</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      min="1"
                      step="1"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
                    />
                    {selectedHolding && balance > 0n && (
                      <button
                        onClick={() => setAmount(balance.toString())}
                        className="mt-1 text-xs text-darkAqua hover:underline"
                      >
                        Use max balance
                      </button>
                    )}
                  </div>

                  {error && <p className="text-sm text-text">{error}</p>}

                  <Button
                    variant="primary"
                    className="w-full"
                    disabled={!selectedHolding || !recipient || numericAmount <= 0n}
                    onClick={handleReview}
                  >
                    <Send className="h-4 w-4 mr-2" /> Review Transfer
                  </Button>
                </div>
              )}
            </div>

            <aside className="space-y-4">
              {selectedHolding && (
                <div className="bg-white rounded-2xl border border-black/10 p-4">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-black/50 mb-1.5">Your fraction balance</p>
                  <p className="text-xl font-bold text-text tabular-nums">
                    {balance.toString()}
                    <span className="text-sm font-normal text-black/50 ml-1.5">fractions</span>
                  </p>
                  <p className="text-[11px] text-black/40 mt-1.5 font-mono break-all">{selectedHolding.contractAddress}</p>
                </div>
              )}
              <NoticeBanner>
                Fractions move only between KYC-verified wallets — the transfer will revert on-chain if the recipient isn&apos;t whitelisted on the identity registry.
              </NoticeBanner>
            </aside>
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </DashboardLayout>
  );
}
