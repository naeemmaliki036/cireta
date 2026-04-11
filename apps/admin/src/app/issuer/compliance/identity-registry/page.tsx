"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { isAddress } from "viem";
import { ShieldAlert, RefreshCw, ExternalLink } from "lucide-react";
import { Button, Spinner, Badge } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { SIMPLE_IDENTITY_REGISTRY_ABI } from "@/lib/contracts/identityRegistryAbi";
import {
  listIdentitySyncJobs,
  retryIdentitySyncJob,
  recordEmergencyManualSync,
  type IdentitySyncJob,
} from "@/lib/api/repositories/identity-registry";

const REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS ?? "") as `0x${string}`;

export default function IdentityRegistryAdminPage() {
  const { address: adminWallet, isConnected } = useAccount();
  const [tab, setTab] = useState<"failed" | "pending" | "succeeded" | "all">("failed");
  const [jobs, setJobs] = useState<IdentitySyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Manual form
  const [walletAddress, setWalletAddress] = useState("");
  const [action, setAction] = useState<"add" | "remove">("add");
  const [country, setCountry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | undefined>();

  const { writeContractAsync } = useWriteContract();
  const { isSuccess: txConfirmed, isLoading: txConfirming } = useWaitForTransactionReceipt({
    hash: pendingTxHash,
  });

  const { data: onChainStatus, refetch: refetchStatus } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: SIMPLE_IDENTITY_REGISTRY_ABI,
    functionName: "isVerified",
    args: walletAddress && isAddress(walletAddress) ? [walletAddress as `0x${string}`] : undefined,
    query: { enabled: !!walletAddress && isAddress(walletAddress) },
  });

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listIdentitySyncJobs(tab);
      setJobs(data.jobs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // After tx confirmation, record on the backend.
  useEffect(() => {
    if (!txConfirmed || !pendingTxHash) return;
    (async () => {
      try {
        await recordEmergencyManualSync({
          wallet_address: walletAddress,
          action,
          tx_hash: pendingTxHash,
        });
        await refetchStatus();
        await fetchJobs();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to record sync");
      } finally {
        setPendingTxHash(undefined);
        setSubmitting(false);
      }
    })();
  }, [txConfirmed, pendingTxHash, walletAddress, action, fetchJobs, refetchStatus]);

  const handleManualSync = async () => {
    if (!isConnected) {
      setError("Connect your admin wallet first.");
      return;
    }
    if (!isAddress(walletAddress)) {
      setError("Invalid wallet address.");
      return;
    }
    if (!REGISTRY_ADDRESS) {
      setError("NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS not configured.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const hash = await writeContractAsync({
        address: REGISTRY_ADDRESS,
        abi: SIMPLE_IDENTITY_REGISTRY_ABI,
        functionName: action === "add" ? "addToWhitelist" : "removeFromWhitelist",
        args: action === "add"
          ? [walletAddress as `0x${string}`, country]
          : [walletAddress as `0x${string}`],
      });
      setPendingTxHash(hash);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Tx failed";
      if (msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("user denied")) {
        // No-op on cancel
      } else {
        setError(msg);
      }
      setSubmitting(false);
    }
  };

  const handleRetryJob = async (id: string) => {
    try {
      await retryIdentitySyncJob(id);
      await fetchJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    }
  };

  return (
    <IssuerDashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Identity Registry</h1>
          <p className="text-sm text-white/40 mt-1">
            Worker-driven identity registry sync jobs and an emergency manual flow.
            The default is the worker — only use the manual flow as a break-glass when
            the worker is down or stuck.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Emergency manual sync */}
        <section className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-white">Emergency Manual Sync</h2>
              <p className="text-xs text-white/50 mt-1">
                Sign the registry call directly with your connected admin wallet. Your
                address must hold REGISTRAR_ROLE on the SimpleIdentityRegistry contract.
                The backend will record the result + write an audit log row tagged
                <code className="text-amber-300 mx-1">identity_registry_emergency_*</code>.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs text-white/50 mb-1">Wallet address</label>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value.trim())}
                  placeholder="0x..."
                  className="w-full px-3 py-2 text-sm font-mono bg-white/5 border border-white/10 text-white rounded-lg focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Action</label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value as "add" | "remove")}
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 text-white rounded-lg focus:outline-none focus:border-white/30"
                >
                  <option value="add">Add to whitelist</option>
                  <option value="remove">Remove from whitelist</option>
                </select>
              </div>
            </div>
            {action === "add" && (
              <div>
                <label className="block text-xs text-white/50 mb-1">Country code (numeric, optional)</label>
                <input
                  type="number"
                  value={country}
                  onChange={(e) => setCountry(parseInt(e.target.value || "0", 10))}
                  placeholder="0"
                  min={0}
                  max={999}
                  className="w-32 px-3 py-2 text-sm bg-white/5 border border-white/10 text-white rounded-lg focus:outline-none focus:border-white/30"
                />
              </div>
            )}

            {walletAddress && isAddress(walletAddress) && (
              <div className="text-xs text-white/60">
                On-chain status: {onChainStatus === undefined
                  ? "checking…"
                  : onChainStatus
                    ? <Badge variant="success" size="sm">Whitelisted</Badge>
                    : <Badge variant="default" size="sm">Not whitelisted</Badge>}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={handleManualSync}
                disabled={submitting || txConfirming || !isConnected || !walletAddress}
              >
                {txConfirming
                  ? "Confirming on chain…"
                  : submitting
                    ? "Sign in your wallet…"
                    : action === "add"
                      ? "Sign + Add to Registry"
                      : "Sign + Remove from Registry"}
              </Button>
              {!isConnected && (
                <span className="text-xs text-amber-400 self-center">Connect wallet first</span>
              )}
            </div>
          </div>
        </section>

        {/* Sync jobs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Sync Jobs</h2>
            <Button variant="secondary" size="sm" onClick={fetchJobs} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="flex gap-2 mb-4">
            {(["failed", "pending", "succeeded", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                  tab === t ? "bg-white text-black" : "bg-white/5 text-white/60 hover:bg-white/10"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="md" /></div>
          ) : jobs.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-xl p-10 text-center text-white/40 text-sm">
              No {tab} jobs.
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono text-white/70">{job.id.slice(0, 8)}…</span>
                        <Badge variant={
                          job.status === "succeeded" ? "success"
                          : job.status === "failed" ? "error"
                          : job.status === "running" ? "pending"
                          : "default"
                        } size="sm">{job.status}</Badge>
                        <span className="text-xs text-white/40">action={job.action}</span>
                        <span className="text-xs text-white/40">attempts={job.attempts}/3</span>
                      </div>
                      <p className="text-xs text-white/50">
                        Buyer: <span className="text-white/70">{job.user_email}</span>
                      </p>
                      {job.last_error && (
                        <p className="text-xs text-red-400 mt-1 truncate" title={job.last_error}>
                          {job.last_error}
                        </p>
                      )}
                      {job.tx_hash && (
                        <a
                          href={`https://sepolia.basescan.org/tx/${job.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-darkAqua hover:underline mt-1"
                        >
                          {job.tx_hash.slice(0, 10)}… <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    {job.status === "failed" && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleRetryJob(job.id)}
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-xs text-white/30">
          Connected admin wallet: {adminWallet ? <span className="font-mono">{adminWallet}</span> : "—"}
        </p>
      </div>
    </IssuerDashboardLayout>
  );
}
