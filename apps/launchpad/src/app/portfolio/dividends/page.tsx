"use client";

import { useState, useEffect } from "react";
import { Coins, CheckCircle2 } from "lucide-react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Button } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { apiFetch } from "@/lib/api/client";

const DIVIDEND_CLAIM_ABI = [
  {
    inputs: [],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

interface DividendEntry {
  token_symbol: string;
  token_name: string;
  claimable_usdc: string;
  total_earned: string;
  contract_address: string | null;
}

export default function DividendsPage() {
  const [dividends, setDividends] = useState<DividendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingIdx, setClaimingIdx] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const { isConnected } = useAccount();

  const {
    writeContract,
    data: claimHash,
    isPending: isClaimPending,
    error: claimWriteError,
  } = useWriteContract();

  const { isLoading: isClaimConfirming, isSuccess: isClaimSuccess } =
    useWaitForTransactionReceipt({ hash: claimHash });

  useEffect(() => {
    apiFetch<{ dividends: DividendEntry[] }>("/api/v1/portfolio/dividends")
      .then((data) => setDividends(data.dividends ?? []))
      .catch((err) => console.error("Failed to load dividends:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isClaimSuccess && claimingIdx !== null) {
      setDividends((prev) =>
        prev.map((d, i) => (i === claimingIdx ? { ...d, claimable_usdc: "0" } : d))
      );
      setClaimingIdx(null);
    }
  }, [isClaimSuccess, claimingIdx]);

  useEffect(() => {
    if (claimWriteError) {
      setClaimError(
        claimWriteError.message.includes("User rejected")
          ? "Transaction rejected"
          : "Claim failed — check your wallet and try again"
      );
      setClaimingIdx(null);
    }
  }, [claimWriteError]);

  const handleClaim = (idx: number) => {
    const d = dividends[idx];
    if (!d?.contract_address) return;
    setClaimError(null);

    if (!isConnected) {
      setClaimError("Please connect your wallet first");
      return;
    }

    setClaimingIdx(idx);
    writeContract({
      address: d.contract_address as `0x${string}`,
      abi: DIVIDEND_CLAIM_ABI,
      functionName: "claim",
    });
  };

  const isClaimLoading = isClaimPending || isClaimConfirming;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-text mb-6">Dividend Claims</h1>
        {loading ? (
          <div className="text-darkBlack/40 text-sm">Loading...</div>
        ) : dividends.length === 0 ? (
          <div className="bg-white rounded-xl border border-darkBlack/10 p-12 text-center">
            <Coins className="w-10 h-10 text-darkBlack/20 mx-auto mb-3" />
            <p className="text-darkBlack/40">No dividend distributions available.</p>
            <p className="text-darkBlack/20 text-sm mt-1">Dividends appear here when issuers distribute revenue to token holders.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {dividends.map((d, i) => (
              <div key={i} className="bg-white rounded-xl border border-darkBlack/10 p-6 flex items-center justify-between">
                <div>
                  <p className="text-text font-medium">{d.token_name}</p>
                  <p className="text-darkBlack/40 text-sm">{d.token_symbol}</p>
                  <p className="text-darkBlack/30 text-xs mt-1">Total earned: {d.total_earned} USDC</p>
                </div>
                <div className="text-right">
                  {parseFloat(d.claimable_usdc) > 0 ? (
                    <>
                      <p className="text-green-600 font-bold text-lg">{d.claimable_usdc} USDC</p>
                      <Button
                        variant="primary"
                        size="sm"
                        className="mt-2"
                        onClick={() => handleClaim(i)}
                        disabled={isClaimLoading || !d.contract_address}
                      >
                        {claimingIdx === i && isClaimLoading ? "Claiming..." : "Claim"}
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 text-darkBlack/30">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-sm">All claimed</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {claimError && (
              <p className="text-sm text-red-500 text-center">{claimError}</p>
            )}
            {isClaimConfirming && (
              <p className="text-sm text-gray-400 text-center">Confirming on-chain&hellip;</p>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
