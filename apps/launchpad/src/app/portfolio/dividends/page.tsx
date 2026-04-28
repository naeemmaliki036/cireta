"use client";

import { useState, useEffect, useCallback } from "react";
import { Coins, CheckCircle2, RefreshCw, Camera } from "lucide-react";
import { useAccount, useReadContract } from "wagmi";
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

  // Unified contract action for dividend claims
  const claimAction = useContractAction();
  const { showError, showSuccess, toasts, removeToast } = useToast();

  // Derived states for compatibility
  const isPending = claimAction.isPending;
  const isClaimConfirming = claimAction.isConfirming;
  const isClaimSuccess = claimAction.isConfirmed;
  const claimHash = claimAction.txHash;

  // For the currently-selected entry, peek at the contract to see whether the user
  // needs to snapshot before claiming. The contract's claim() reverts with
  // NothingToClaim if the user hasn't called snapshotBalance for any unclaimed epoch.
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
      // Snapshot succeeded — refresh dividend list and on-chain reads
      setActionMode(null);
      fetchData();
    }
  }, [isClaimSuccess, activeIdx, actionMode]);

  useEffect(() => {
    if (claimAction.error) {
      const msg = claimAction.error.message || "Transaction failed";
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
        // gas automatically handled by useContractAction (500k for claims)
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
        // gas automatically handled by useContractAction (500k for claims)
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
  // The user must snapshot before they can claim. We surface the next-action hint
  // for the currently-active distributor only.
  const needsSnapshot =
    activeEntry !== null &&
    nextEpochToSnapshot !== null &&
    nextSnapshotTaken === false;

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
          <div className="bg-white rounded-xl border border-black/10 p-12 text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Button variant="primary" size="sm" onClick={fetchData}>Retry</Button>
          </div>
        ) : dividends.length === 0 ? (
          <div className="bg-white rounded-xl border border-black/10 p-12 text-center">
            <Coins className="w-10 h-10 text-black/20 mx-auto mb-3" />
            <p className="text-black/40 font-medium">No dividend distributions available</p>
            <p className="text-black/20 text-sm mt-1">Dividends appear here when issuers distribute revenue to token holders.</p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 mb-4 text-sm text-blue-800">
              <p className="font-medium mb-1">Two-step flow</p>
              <p className="text-blue-700/80">
                1. <span className="font-semibold">Snapshot Balance</span> records your token balance for each open dividend epoch.
                2. <span className="font-semibold">Claim</span> pulls the USDC owed across all snapshotted epochs. You may need to repeat snapshot if more than one epoch is unclaimed.
              </p>
            </div>
            <div className="space-y-4">
              {dividends.map((d, i) => {
                const isActive = activeIdx === i;
                const showSnapshotPrompt = isActive && needsSnapshot;
                return (
                  <div key={i} className="bg-white rounded-xl border border-black/10 p-6 flex items-center justify-between">
                    <div>
                      <p className="text-text font-medium">{d.token_name}</p>
                      <p className="text-black/40 text-sm">{d.token_symbol}</p>
                      <p className="text-black/30 text-xs mt-1">Total earned: {d.total_earned} USDC</p>
                      {showSnapshotPrompt && (
                        <p className="text-amber-600 text-xs mt-2">
                          Epoch {nextEpochToSnapshot} needs a balance snapshot before you can claim.
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {parseFloat(d.claimable_usdc) > 0 ? (
                        <>
                          <p className="text-green-600 font-bold text-lg">{d.claimable_usdc} USDC</p>
                          <div className="flex items-center justify-end gap-2 mt-2">
                            <Button
                              variant="secondary"
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
                        <div className="flex items-center gap-1 text-black/30">
                          <CheckCircle2 className="w-4 h-4" /><span className="text-sm">All claimed</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {claimError && <p className="text-sm text-red-500 text-center">{claimError}</p>}
              {isClaimConfirming && <p className="text-sm text-gray-400 text-center">Confirming on-chain&hellip;</p>}
            </div>
          </>
        )}
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </DashboardLayout>
  );
}
