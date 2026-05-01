"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2, Send } from "lucide-react";
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

/**
 * CiretaFractionToken1155 ABI — safeTransferFrom + balanceOf.
 * Token IDs: 1 = USDC fraction, 2 = OTC fraction.
 */
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
  {
    name: "isApprovedForAll",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const FRACTION_TOKEN_IDS = [
  { id: 1n, label: "USDC Fraction (ID 1)" },
  { id: 2n, label: "OTC Fraction (ID 2)" },
] as const;

interface FractionHolding {
  tokenId: bigint;
  label: string;
  contractAddress: `0x${string}`;
  balance: bigint;
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

  // Derive fraction holdings from vesting schedules
  const fractionHoldings: FractionHolding[] = vestingSchedules
    .filter((s) => s.fraction_token_address && isAddress(s.fraction_token_address))
    .flatMap((s) =>
      FRACTION_TOKEN_IDS.map((ft) => ({
        tokenId: ft.id,
        label: `${s.token_symbol ?? s.token_name ?? "Token"} — ${ft.label}`,
        contractAddress: s.fraction_token_address as `0x${string}`,
        balance: 0n, // will be read on-chain per selection
      }))
    )
    // deduplicate by contractAddress+tokenId
    .filter(
      (h, idx, self) =>
        self.findIndex((x) => x.contractAddress === h.contractAddress && x.tokenId === h.tokenId) === idx
    );

  // Read on-chain balance for selected holding
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
    if (authLoading || !isAuthenticated) { setLoading(false); return; }
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
      description="Send vesting fraction tokens to another wallet"
    >
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
            <p className="text-gray-500 text-sm mb-4">Connect your wallet to transfer fractions.</p>
            <Button variant="primary" onClick={() => openConnectModal?.()}>Connect Wallet</Button>
          </div>
        ) : step === "success" ? (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-semibold text-text mb-2">Transfer Successful</h2>
            <p className="text-black/50 mb-6">
              Fractions sent to {recipient.slice(0, 8)}...{recipient.slice(-6)}
            </p>
            <div className="space-y-3">
              {transferAction.txHash && (
                <a
                  href={getTxUrl(chainId, transferAction.txHash) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
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
            <h2 className="text-xl font-semibold text-text mb-6">Confirm Fraction Transfer</h2>
            <div className="bg-gray-50 rounded-xl p-5 space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-black/50">Token</span>
                <span className="font-semibold">{selectedHolding?.label}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-black/50">Amount</span>
                <span className="font-semibold">{numericAmount.toString()} fractions</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-black/50">Recipient</span>
                <span className="font-semibold font-mono text-xs">{recipient}</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3 mb-6">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                Fraction tokens represent vesting claims. The recipient will assume your vesting rights for the transferred amount. This action is irreversible.
              </p>
            </div>
            {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                size="lg"
                onClick={() => { setStep("form"); setError(null); }}
                disabled={transferAction.isPending || transferAction.isConfirming}
              >
                Back
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                size="lg"
                onClick={handleTransfer}
                isLoading={transferAction.isPending || transferAction.isConfirming}
              >
                {transferAction.isPending ? "Sign in Wallet..." : transferAction.isConfirming ? "Confirming..." : "Send Fractions"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 border border-gray-100">
            <h2 className="text-xl font-semibold text-text mb-1">Transfer Fraction Tokens</h2>
            <p className="text-sm text-black/40 mb-6">
              ERC-1155 fraction tokens (ID 1 = USDC fraction, ID 2 = OTC fraction).
              Recipient must hold a verified identity on the token&apos;s identity registry.
            </p>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3 mb-6">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                Recipient must be KYC-verified. The transfer will revert if they are not registered on the identity registry.
              </p>
            </div>

            {fractionHoldings.length === 0 ? (
              <div className="text-center py-8 text-black/50 text-sm space-y-2">
                <p className="font-medium text-text">No fraction tokens found.</p>
                <p className="text-xs leading-relaxed max-w-sm mx-auto">
                  Fraction tokens are issued to you when you buy a vested sale. They appear here once your sale has been deployed with vesting enabled.
                </p>
                <Link
                  href="/portfolio/vesting"
                  className="inline-block text-darkAqua hover:underline text-sm font-medium pt-1"
                >
                  View vesting schedule &rarr;
                </Link>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Fraction token selector */}
                <div>
                  <label className="block text-sm font-semibold text-text mb-2">Select Fraction Token</label>
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
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua bg-white"
                  >
                    <option value="">Choose a fraction token...</option>
                    {fractionHoldings.map((h) => (
                      <option key={`${h.contractAddress}-${h.tokenId}`} value={`${h.contractAddress}-${h.tokenId}`}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Balance */}
                {selectedHolding && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-black/50">Your Balance</span>
                      <span className="font-semibold">{balance.toString()} fractions</span>
                    </div>
                    <p className="text-xs text-black/30 mt-1 font-mono truncate">
                      {selectedHolding.contractAddress}
                    </p>
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
                  <label className="block text-sm font-semibold text-text mb-2">Amount (whole fractions)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    min="1"
                    step="1"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
                  />
                  {selectedHolding && balance > 0n && (
                    <button
                      onClick={() => setAmount(balance.toString())}
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
                  disabled={!selectedHolding || !recipient || numericAmount <= 0n}
                  onClick={handleReview}
                >
                  <Send className="h-4 w-4 mr-2" /> Review Transfer
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </DashboardLayout>
  );
}
