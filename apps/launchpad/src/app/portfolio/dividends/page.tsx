"use client";

import { useState, useEffect, useCallback } from "react";
import { Coins, CheckCircle2, RefreshCw } from "lucide-react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Button, Spinner } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { getDividends, type DividendEntry } from "@/lib/api/repositories/portfolio.repository";

const DIVIDEND_CLAIM_ABI = [
  { inputs: [], name: "claim", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;

export default function DividendsPage() {
  const [dividends, setDividends] = useState<DividendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingIdx, setClaimingIdx] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const { isConnected } = useAccount();

  const { writeContract, data: claimHash, isPending, error: claimWriteError } = useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({ hash: claimHash });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDividends(await getDividends());
    } catch {
      setError("Failed to load dividends. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const isClaimLoading = isPending || isClaimConfirming;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text">Dividend Claims</h1>
          <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-darkBlack/10 p-12 text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Button variant="primary" size="sm" onClick={fetchData}>Retry</Button>
          </div>
        ) : dividends.length === 0 ? (
          <div className="bg-white rounded-xl border border-darkBlack/10 p-12 text-center">
            <Coins className="w-10 h-10 text-darkBlack/20 mx-auto mb-3" />
            <p className="text-darkBlack/40 font-medium">No dividend distributions available</p>
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
                      <Button variant="primary" size="sm" className="mt-2"
                        onClick={() => handleClaim(i)} disabled={isClaimLoading || !d.contract_address}>
                        {claimingIdx === i && isClaimLoading ? "Claiming..." : "Claim"}
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 text-darkBlack/30">
                      <CheckCircle2 className="w-4 h-4" /><span className="text-sm">All claimed</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {claimError && <p className="text-sm text-red-500 text-center">{claimError}</p>}
            {isClaimConfirming && <p className="text-sm text-gray-400 text-center">Confirming on-chain&hellip;</p>}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
