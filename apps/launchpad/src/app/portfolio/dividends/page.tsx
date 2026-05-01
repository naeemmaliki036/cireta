"use client";

import { useState, useEffect, useCallback } from "react";
import { Coins, CheckCircle2, RefreshCw, Camera } from "lucide-react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { ErrorReportButton } from "@/components/molecules/ErrorReportButton";
import { Button, Spinner } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { getDividends, type DividendEntry } from "@/lib/api/repositories/portfolio.repository";
import { useContractAction } from "@/hooks/useContractAction";
import { useToast, ToastContainer } from "@/components/molecules/Toast";

// Minimal ABI for the dividend distributor's two-step claim flow.
// snapshotBalance must be called for each unclaimed epoch before claim() succeeds.
const DIVIDEND_DISTRIBUTOR_ABI = [
  { inputs: [], name: "claim", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [{ name: "epochIndex", type: "uint256" }],
    name: "snapshotBalance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "epochCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "holder", type: "address" }],
    name: "lastClaimedEpoch",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "epochIndex", type: "uint256" },
      { name: "holder", type: "address" },
    ],
    name: "hasSnapshot",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export default function DividendsPage() {
  const [dividends, setDividends] = useState<DividendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [actionMode, setActionMode] = useState<"snapshot" | "claim" | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const claimAction = useContractAction();
  const { showError, showSuccess, toasts, removeToast } = useToast();

  const isPending = claimAction.isPending;
  const isClaimConfirming = claimAction.isConfirming;
  const isClaimSuccess = claimAction.isConfirmed;
  const claimHash = claimAction.txHash;

  const activeEntry = activeIdx !== null ? dividends[activeIdx] : null;
  const distributorAddr = activeEntry?.contract_address as `0x${string}` | undefined;
  const { data: epochCountData } = useReadContract({
    address: distributorAddr,
    abi: DIVIDEND_DISTRIBUTOR_ABI,
    functionName: "epochCount",
    query: { enabled: !!distributorAddr },
  });
  const { data: lastClaimedData } = useReadContract({
    address: distributorAddr,
    abi: DIVIDEND_DISTRIBUTOR_ABI,
    functionName: "lastClaimedEpoch",
    args: address ? [address] : undefined,
    query: { enabled: !!distributorAddr && !!address },
  });
  const epochCount = typeof epochCountData === "bigint" ? Number(epochCountData) : 0;
  const lastClaimed = typeof lastClaimedData === "bigint" ? Number(lastClaimedData) : 0;
  const nextEpochToSnapshot = lastClaimed < epochCount ? lastClaimed : null;
  const { data: nextSnapshotTaken } = useReadContract({
    address: distributorAddr,
    abi: DIVIDEND_DISTRIBUTOR_ABI,
    functionName: "hasSnapshot",
    args: address && nextEpochToSnapshot !== null
      ? [BigInt(nextEpochToSnapshot), address]
      : undefined,
    query: { enabled: !!distributorAddr && !!address && nextEpochToSnapshot !== null },
  });

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
    if (isClaimSuccess && activeIdx !== null && actionMode === "claim") {
      setDividends((prev) =>
        prev.map((d, i) => (i === activeIdx ? { ...d, claimable_usdc: "0" } : d))
      );
      setActiveIdx(null);
      setActionMode(null);
    } else if (isClaimSuccess && actionMode === "snapshot") {
      setActionMode(null);
      fetchData();
    }
  }, [isClaimSuccess, activeIdx, actionMode]);

  useEffect(() => {
    if (claimAction.error) {
      const msg = claimAction.error || "Transaction failed";
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        setClaimError("Transaction rejected");
      } else {
        setClaimError("Transaction failed — check your wallet and try again");
      }
      setActiveIdx(null);
      setActionMode(null);
    }
  }, [claimAction.error]);

  const handleSnapshot = async (idx: number) => {
    const d = dividends[idx];
    if (!d?.contract_address || nextEpochToSnapshot === null) return;
    setClaimError(null);
    if (!isConnected) {
      setClaimError("Please connect your wallet first");
      return;
    }
    setActiveIdx(idx);
    setActionMode("snapshot");

    try {
      await claimAction.execute({
        address: d.contract_address as `0x${string}`,
        abi: DIVIDEND_DISTRIBUTOR_ABI,
        functionName: "snapshotBalance",
        args: [BigInt(nextEpochToSnapshot)],
      });
      showSuccess("Snapshot Taken", "Balance snapshot has been recorded for this epoch.");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Snapshot failed";
      setClaimError(errorMsg);
      showError("Snapshot Failed", errorMsg);
      setActiveIdx(null);
      setActionMode(null);
    }
  };

  const handleClaim = async (idx: number) => {
    const d = dividends[idx];
    if (!d?.contract_address) return;
    setClaimError(null);
    if (!isConnected) {
      setClaimError("Please connect your wallet first");
      return;
    }
    setActiveIdx(idx);
    setActionMode("claim");

    try {
      await claimAction.execute({
        address: d.contract_address as `0x${string}`,
        abi: DIVIDEND_DISTRIBUTOR_ABI,
        functionName: "claim",
      });
      showSuccess("Dividend Claimed", `${d.claimable_usdc} USDC has been claimed to your wallet.`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Claim failed";
      setClaimError(errorMsg);
      showError("Claim Failed", errorMsg);
      setActiveIdx(null);
      setActionMode(null);
    }
  };

  const isTxLoading = isPending || isClaimConfirming;
  const needsSnapshot =
    activeEntry !== null &&
    nextEpochToSnapshot !== null &&
    nextSnapshotTaken === false;

  return (
    <DashboardLayout title="Dividend Claims" description="Claim USDC distributions from project revenue">
      <div className="py-2">
        {/* Header strip */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-black/60">
            {dividends.length > 0 && `${dividends.length} distribution${dividends.length !== 1 ? "s" : ""}`}
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
        ) : dividends.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black/10 p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-box flex items-center justify-center mx-auto mb-3">
              <Coins className="w-5 h-5 text-darkAqua" />
            </div>
            <p className="text-sm font-semibold text-text">No dividend distributions available</p>
            <p className="text-xs text-black/40 mt-1">Distributions appear here when issuers share revenue with project token holders.</p>
          </div>
        ) : (
          <>
            {/* Two-step info notice */}
            <div className="rounded-xl border border-black/10 bg-box p-4 mb-4 text-sm text-text">
              <p className="font-medium mb-1">Two-step claim flow</p>
              <p className="text-black/60 text-xs">
                1. <span className="font-semibold">Snapshot Balance</span> records your token balance for each open dividend epoch.{" "}
                2. <span className="font-semibold">Claim</span> pulls the USDC owed across all snapshotted epochs. You may need to repeat snapshot if more than one epoch is unclaimed.
              </p>
            </div>
            <div className="space-y-3">
              {dividends.map((d, i) => {
                const isActive = activeIdx === i;
                const showSnapshotPrompt = isActive && needsSnapshot;
                return (
                  <div key={i} className="bg-white rounded-2xl border border-black/10 p-5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text">{d.token_name}</p>
                      <p className="text-xs text-black/40 mt-0.5">{d.token_symbol}</p>
                      <p className="text-xs text-black/30 mt-0.5">Total earned: {d.total_earned} USDC</p>
                      {showSnapshotPrompt && (
                        <p className="text-xs text-text mt-2 font-medium">
                          Epoch {nextEpochToSnapshot} needs a balance snapshot before you can claim.
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {parseFloat(d.claimable_usdc) > 0 ? (
                        <>
                          <p className="text-lg font-bold text-text tabular-nums">{d.claimable_usdc} <span className="text-sm font-normal text-black/50">USDC</span></p>
                          <div className="flex items-center justify-end gap-2 mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { setActiveIdx(i); }}
                              disabled={isTxLoading || !d.contract_address}
                            >
                              {isActive ? "Selected" : "Select"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSnapshot(i)}
                              disabled={isTxLoading || !d.contract_address || !isActive || nextEpochToSnapshot === null}
                              leftIcon={<Camera className="w-3.5 h-3.5" />}
                            >
                              {isActive && actionMode === "snapshot" && isTxLoading ? "Snapshotting..." : "Snapshot"}
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleClaim(i)}
                              disabled={isTxLoading || !d.contract_address}
                            >
                              {isActive && actionMode === "claim" && isTxLoading ? "Claiming..." : "Claim"}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5 text-black/30">
                          <CheckCircle2 className="w-4 h-4 text-darkAqua" />
                          <span className="text-sm text-black/50">All claimed</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {claimError && (
                <ErrorReportButton
                  context={{
                    message: claimError,
                    functionName: "dividend.claim",
                    txHash: claimHash ?? null,
                    chainId: chainId ?? null,
                  }}
                />
              )}
              {isClaimConfirming && (
                <p className="text-sm text-black/40 text-center">Confirming on-chain&hellip;</p>
              )}
            </div>
          </>
        )}
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </DashboardLayout>
  );
}
