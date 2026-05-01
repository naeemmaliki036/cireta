"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { useAccount, useChainId } from "wagmi";
import { Button, Spinner, Badge, ProgressBar } from "@/components/atoms";
import { ErrorReportButton } from "@/components/molecules/ErrorReportButton";
import { DashboardLayout } from "@/components/templates";
import { getVesting, type VestingSchedule } from "@/lib/api/repositories/portfolio.repository";
import { useContractAction } from "@/hooks/useContractAction";
import { useToast, ToastContainer } from "@/components/molecules/Toast";

const VAULT_CLAIM_ABI = [
  { inputs: [], name: "claim", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;

/** Format a duration in days into a human-readable string */
function formatDuration(days: number): string {
  if (days >= 365 && days % 365 === 0) return `${days / 365} year${days / 365 > 1 ? "s" : ""}`;
  if (days >= 30 && days % 30 === 0) return `${days / 30} month${days / 30 > 1 ? "s" : ""}`;
  return `${days} day${days !== 1 ? "s" : ""}`;
}

// formatDuration is used for display context on schedule cards
void formatDuration;

/** Build a claim schedule from cliff and vesting dates */
function buildClaimSchedule(
  cliffEnd: Date,
  vestingEnd: Date,
): { label: string; date: Date; pct: number }[] {
  const cliffMs = cliffEnd.getTime();
  const vestMs = vestingEnd.getTime();
  const totalVestingMs = vestMs - cliffMs;

  if (totalVestingMs <= 0) {
    return [{ label: "Cliff (100%)", date: cliffEnd, pct: 100 }];
  }

  const totalDays = Math.round(totalVestingMs / (1000 * 60 * 60 * 24));
  const interval = totalDays <= 90 ? 30 : totalDays <= 365 ? 30 : 90;
  const milestones: { label: string; date: Date; pct: number }[] = [];

  milestones.push({ label: "Cliff", date: cliffEnd, pct: 0 });

  for (let d = interval; d < totalDays; d += interval) {
    const pct = Math.round((d / totalDays) * 100);
    const date = new Date(cliffMs + d * 24 * 60 * 60 * 1000);
    milestones.push({ label: `Day ${d}`, date, pct });
  }

  // Same convention as the badge below: lockup schedules unlock all at once
  // at the cliff, so the final milestone label says "unlocked" not "vested".
  const isLockup = Math.abs(vestingEnd.getTime() - cliffEnd.getTime()) < 1000;
  milestones.push({ label: isLockup ? "Fully unlocked" : "Fully vested", date: vestingEnd, pct: 100 });
  return milestones;
}

export default function PortfolioVestingPage() {
  const [schedules, setSchedules] = useState<VestingSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const { isConnected } = useAccount();
  const chainId = useChainId();

  const claimAction = useContractAction();
  const { showError, showSuccess, toasts, removeToast } = useToast();

  const isPending = claimAction.isPending;
  const isConfirming = claimAction.isConfirming;
  const isSuccess = claimAction.isConfirmed;
  const claimHash = claimAction.txHash;
  const claimError = claimAction.error;

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

  const handleClaim = async (schedule: VestingSchedule) => {
    if (!schedule.vault_address || !isConnected) return;
    setClaimingId(schedule.id);

    const claimedDisplay = parseFloat(schedule.claimable_amount).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
    try {
      await claimAction.execute({
        address: schedule.vault_address as `0x${string}`,
        abi: VAULT_CLAIM_ABI,
        functionName: "claim",
      });
      showSuccess("Tokens Claimed", `${claimedDisplay} ${schedule.token_symbol} tokens have been claimed to your wallet.`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Claim failed";
      showError("Claim Failed", errorMsg);
      setClaimingId(null);
    }
  };

  const isClaimLoading = isPending || isConfirming;

  return (
    <DashboardLayout title="Vesting Schedules" description="Track unlocking timelines and claim available project tokens">
      <div className="py-2">
        {/* Header strip */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-black/60">
            {schedules.length > 0 && `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""}`}
          </p>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-black/10 p-10 text-center">
            <p className="text-sm text-text mb-4">{error}</p>
            <Button variant="primary" size="sm" onClick={fetchData}>Retry</Button>
          </div>
        ) : schedules.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black/10 p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-box flex items-center justify-center mx-auto mb-3">
              <Clock className="w-5 h-5 text-darkAqua" />
            </div>
            <p className="text-sm font-semibold text-text">No vesting schedules</p>
            <p className="text-xs text-black/40 mt-1">Vested purchases will appear here after purchase.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {schedules.map((s) => {
              const total = parseFloat(s.total_amount);
              const claimed = parseFloat(s.claimed_amount);
              const claimable = parseFloat(s.claimable_amount);
              const cliffEnd = new Date(s.cliff_end);
              const vestingEnd = new Date(s.vesting_end);
              const now = new Date();
              const cliffPassed = cliffEnd <= now;
              const vestingComplete = vestingEnd <= now;
              // Lockup variant: everything unlocks at the cliff (no linear ramp).
              // We treat any schedule where cliff and vesting end land within
              // a second of each other as a lockup-only schedule.
              const isLockup = Math.abs(vestingEnd.getTime() - cliffEnd.getTime()) < 1000;
              const completeLabel = isLockup ? "Fully unlocked" : "Fully vested";
              const vestedPct = vestingComplete
                ? 100
                : cliffPassed && total > 0
                  ? Math.min(100, Math.round(((claimed + claimable) / total) * 100))
                  : 0;
              const progress = total > 0 ? ((claimed / total) * 100) : 0;

              const cliffDiffMs = cliffEnd.getTime() - now.getTime();
              const cliffDays = Math.floor(cliffDiffMs / (1000 * 60 * 60 * 24));
              const cliffHours = Math.floor((cliffDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

              const schedule = buildClaimSchedule(cliffEnd, vestingEnd);

              return (
                <div key={s.id} className="bg-white rounded-2xl border border-black/10 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-text font-semibold text-sm">{s.token_name}</p>
                      <p className="text-black/40 text-xs mt-0.5">{s.token_symbol} · {s.sale_mode}</p>
                    </div>
                    {!cliffPassed ? (
                      <Badge variant="pending" size="sm">
                        Cliff ends in {cliffDays}d {cliffHours}h
                      </Badge>
                    ) : vestingComplete ? (
                      <Badge variant="active" size="sm">{completeLabel}</Badge>
                    ) : (
                      <Badge variant="active" size="sm">
                        {vestedPct}% vested
                      </Badge>
                    )}
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-black/50">Claimed</span>
                      <span className="font-semibold tabular-nums">{claimed.toLocaleString()} / {total.toLocaleString()}</span>
                    </div>
                    <ProgressBar value={progress} size="sm" />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
                    <div>
                      <p className="text-black/40 mb-0.5">Total</p>
                      <p className="font-semibold tabular-nums">{total.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-black/40 mb-0.5">Claimed</p>
                      <p className="font-semibold tabular-nums">{claimed.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-black/40 mb-0.5">Available now</p>
                      <p className="font-semibold tabular-nums text-darkAqua">{claimable.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-black/40 mb-0.5">Vesting End</p>
                      <p className="font-semibold">{vestingEnd.toLocaleDateString()}</p>
                    </div>
                  </div>

                  {/* Claim Schedule */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-text mb-2 uppercase tracking-wider">Claim Schedule</p>
                    {schedule.length === 1 ? (
                      <p className="text-xs text-black/60">
                        100% available after cliff ({cliffEnd.toLocaleDateString()})
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="flex gap-0 min-w-0">
                          {schedule.map((m, i) => {
                            const isPast = m.date <= now;
                            return (
                              <div key={i} className="flex items-center">
                                <div className="flex flex-col items-center text-center min-w-[80px]">
                                  <div
                                    className={`w-3 h-3 rounded-full border-2 ${
                                      isPast
                                        ? "bg-darkAqua border-darkAqua"
                                        : "bg-white border-black/20"
                                    }`}
                                  />
                                  <p className="text-xs font-semibold text-text mt-1">{m.pct}%</p>
                                  <p className="text-[10px] text-black/40">{m.label}</p>
                                  <p className="text-[10px] text-black/30">
                                    {m.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                  </p>
                                </div>
                                {i < schedule.length - 1 && (
                                  <div className={`h-0.5 w-6 ${isPast ? "bg-darkAqua" : "bg-black/10"}`} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
                    <ErrorReportButton
                      className="mt-2"
                      context={{
                        message: claimError || "Claim failed",
                        functionName: "vault.claim",
                        contractAddress: s.vault_address ?? null,
                        txHash: claimHash ?? null,
                        chainId: chainId ?? null,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </DashboardLayout>
  );
}
