"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Button, Spinner, Badge, ProgressBar } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { getVesting, type VestingSchedule } from "@/lib/api/repositories/portfolio.repository";

const VAULT_CLAIM_ABI = [
  { inputs: [], name: "claim", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;

export default function PortfolioVestingPage() {
  const [schedules, setSchedules] = useState<VestingSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const { isConnected } = useAccount();

  const { writeContract, data: claimHash, isPending, error: claimError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: claimHash });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSchedules(await getVesting());
    } catch {
      setError("Failed to load vesting schedules. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (isSuccess && claimingId) {
      setSchedules((prev) =>
        prev.map((s) => (s.id === claimingId ? { ...s, claimable_amount: "0" } : s))
      );
      setClaimingId(null);
    }
  }, [isSuccess, claimingId]);

  useEffect(() => {
    if (claimError) setClaimingId(null);
  }, [claimError]);

  const handleClaim = (schedule: VestingSchedule) => {
    if (!schedule.vault_address || !isConnected) return;
    setClaimingId(schedule.id);
    writeContract({
      address: schedule.vault_address as `0x${string}`,
      abi: VAULT_CLAIM_ABI,
      functionName: "claim",
    });
  };

  const isClaimLoading = isPending || isConfirming;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text">Vesting Schedules</h1>
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
        ) : schedules.length === 0 ? (
          <div className="bg-white rounded-xl border border-darkBlack/10 p-12 text-center">
            <Clock className="w-10 h-10 text-darkBlack/20 mx-auto mb-3" />
            <p className="text-darkBlack/40 font-medium">No vesting schedules</p>
            <p className="text-darkBlack/20 text-sm mt-1">Vested investments will appear here after purchase.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {schedules.map((s) => {
              const total = parseFloat(s.total_amount);
              const claimed = parseFloat(s.claimed_amount);
              const claimable = parseFloat(s.claimable_amount);
              const progress = total > 0 ? ((claimed / total) * 100) : 0;
              const cliffPassed = new Date(s.cliff_end) <= new Date();

              return (
                <div key={s.id} className="bg-white rounded-xl border border-darkBlack/10 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-text font-semibold">{s.token_name}</p>
                      <p className="text-darkBlack/40 text-sm">{s.token_symbol} — {s.sale_mode}</p>
                    </div>
                    <Badge variant={cliffPassed ? "success" : "pending"} size="sm">
                      {cliffPassed ? "Cliff passed" : "Cliff pending"}
                    </Badge>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-darkBlack/50">Claimed</span>
                      <span className="font-semibold">{claimed.toLocaleString()} / {total.toLocaleString()}</span>
                    </div>
                    <ProgressBar value={progress} size="sm" />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                    <div>
                      <p className="text-darkBlack/40">Total</p>
                      <p className="font-semibold">{total.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-darkBlack/40">Claimed</p>
                      <p className="font-semibold">{claimed.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-darkBlack/40">Claimable Now</p>
                      <p className="font-semibold text-green-600">{claimable.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-darkBlack/40">Vesting End</p>
                      <p className="font-semibold">{new Date(s.vesting_end).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {claimable > 0 && s.vault_address && (
                    <Button
                      variant="primary" size="sm"
                      onClick={() => handleClaim(s)}
                      disabled={isClaimLoading || !isConnected}
                    >
                      {claimingId === s.id && isClaimLoading ? "Claiming..." : `Claim ${claimable.toLocaleString()} tokens`}
                    </Button>
                  )}
                  {claimError && claimingId === s.id && (
                    <p className="text-sm text-red-500 mt-2">Claim failed. Please try again.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
