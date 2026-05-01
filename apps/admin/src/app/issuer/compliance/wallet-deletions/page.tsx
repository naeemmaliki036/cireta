"use client";

import { useEffect, useState, useCallback } from "react";
import { parseApiDate } from "@/lib/utils";
import { Trash2, CheckCircle2, XCircle, Clock, RefreshCw, AlertTriangle } from "lucide-react";
import { isAddress, type Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { Button, Spinner, Badge } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { IssuerDashboardLayout } from "@/components/templates";
import { useConfirmation } from "@/components/molecules/ConfirmationModal";
import { useContractAction } from "@/hooks/useContractAction";
import { SIMPLE_IDENTITY_REGISTRY_ABI } from "@/lib/contracts/abis/simpleIdentityRegistry";
import {
  listWalletDeletionRequests,
  approveWalletDeletionRequest,
  denyWalletDeletionRequest,
  type WalletDeletionRequest,
  type WalletDeletionStatus,
} from "@/lib/api/repositories/wallet-deletions";

const IR_ADDRESS = (
  process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS ?? ""
) as `0x${string}`;

// keccak256 role hashes for pre-flight check
const COMPLIANCE_ROLE =
  "0x2427b1dcc74a5fd2e00a7cd1c578789d9a68f8a42a40e83b7c543bd98e4fc73a" as const;
const AGENT_ROLE =
  "0xcdbf1d1c64faad6046b5b53d6a6821b434c73ab58fcfa37f7fc6c8d3b8e7d68f" as const;

const STATUS_TABS: { value: WalletDeletionStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
  { value: "all", label: "All" },
];

export default function WalletDeletionsPage() {
  const [requests, setRequests] = useState<WalletDeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WalletDeletionStatus>("pending");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const { showConfirmation, ConfirmationModal } = useConfirmation();

  // On-chain removal state
  const { address: connectedAddress } = useAccount();
  const onChainAction = useContractAction();
  // Track which wallet is awaiting the on-chain removal (after DB approved, before tx confirmed)
  const [pendingOnChain, setPendingOnChain] = useState<string | null>(null);
  // Wallets that were DB-approved but on-chain removal failed (retry targets)
  const [retryQueue, setRetryQueue] = useState<string[]>([]);

  // Check connected wallet has COMPLIANCE_ROLE or AGENT_ROLE
  const { data: roleCheckData } = useReadContracts({
    contracts:
      connectedAddress && IR_ADDRESS
        ? [
            {
              address: IR_ADDRESS,
              abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
              functionName: "hasRole",
              args: [COMPLIANCE_ROLE, connectedAddress],
            },
            {
              address: IR_ADDRESS,
              abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
              functionName: "hasRole",
              args: [AGENT_ROLE, connectedAddress],
            },
          ]
        : [],
    query: { enabled: !!connectedAddress && !!IR_ADDRESS },
  });
  const hasRemoveRole =
    roleCheckData?.[0]?.result === true || roleCheckData?.[1]?.result === true;

  const executeOnChainRemoval = useCallback(
    async (walletAddress: string) => {
      if (!IR_ADDRESS) return;
      if (!isAddress(walletAddress)) return;
      setPendingOnChain(walletAddress);
      onChainAction.reset();
      const receipt = await onChainAction.execute({
        address: IR_ADDRESS,
        abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
        functionName: "removeFromWhitelist",
        args: [walletAddress as `0x${string}`],
      });
      if (receipt) {
        setPendingOnChain(null);
        setRetryQueue((q) => q.filter((a) => a !== walletAddress));
      } else {
        // Keep wallet in retry queue so the amber banner shows
        setPendingOnChain(null);
        setRetryQueue((q) => (q.includes(walletAddress) ? q : [...q, walletAddress]));
      }
    },
    [onChainAction],
  );

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listWalletDeletionRequests(tab);
      setRequests(data.requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (req: WalletDeletionRequest) => {
    showConfirmation(
      "Approve Wallet Removal",
      `Are you sure you want to approve removal of ${req.wallet_address}? This will UNLINK the wallet from the buyer's profile and call removeFromWhitelist on-chain. The buyer will be notified.`,
      async () => {
        try {
          await approveWalletDeletionRequest(req.id, reviewNotes || undefined);
          setReviewNotes("");
          setReviewing(null);
          await fetchRequests();
          // Immediately attempt on-chain removal
          await executeOnChainRemoval(req.wallet_address);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Approve failed");
        }
      },
      { variant: "danger", confirmText: "Approve Removal" }
    );
  };

  const handleDeny = async (req: WalletDeletionRequest) => {
    showConfirmation(
      "Deny Wallet Removal",
      `Are you sure you want to deny removal of ${req.wallet_address}?`,
      async () => {
        try {
          await denyWalletDeletionRequest(req.id, reviewNotes || undefined);
          setReviewNotes("");
          setReviewing(null);
          await fetchRequests();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Deny failed");
        }
      },
      { confirmText: "Deny Request" }
    );
  };

  return (
    <IssuerDashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Wallet Deletion Requests</h1>
            <p className="text-sm text-white/40 mt-1">
              Review buyer-initiated requests to remove a wallet from a KYC-verified profile.
              Approval unlinks the wallet AND enqueues an on-chain revoke from the identity registry.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={fetchRequests} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="flex gap-2 mb-6">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.value
                  ? "bg-white text-black"
                  : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Role check warning */}
        {connectedAddress && !hasRemoveRole && IR_ADDRESS && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            Your connected wallet does not hold COMPLIANCE_ROLE or AGENT_ROLE on
            the identity registry. On-chain removal calls will revert. Grant the
            role first via Platform &rarr; Identity Registry.
          </div>
        )}

        {/* On-chain status for the current action */}
        {(onChainAction.isPending || onChainAction.isConfirming || onChainAction.isConfirmed || onChainAction.error) && (
          <div className="mb-4">
            <TransactionStatus
              isPending={onChainAction.isPending}
              isConfirming={onChainAction.isConfirming}
              isConfirmed={onChainAction.isConfirmed}
              txHash={onChainAction.txHash}
              txUrl={onChainAction.txUrl}
              error={onChainAction.error}
              successMessage="Wallet removed from identity registry on-chain."
            />
          </div>
        )}

        {/* Retry queue: DB recorded but on-chain pending */}
        {retryQueue.map((addr) => (
          <div
            key={addr}
            className="flex items-center justify-between gap-4 p-3 mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>
                DB recorded, on-chain removal pending for{" "}
                <code className="font-mono">{addr}</code> — retry?
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => executeOnChainRemoval(addr)}
              disabled={
                onChainAction.isPending ||
                onChainAction.isConfirming ||
                pendingOnChain === addr
              }
            >
              Retry
            </Button>
          </div>
        ))}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : requests.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
            <Trash2 className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No {tab} requests.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="font-mono text-sm text-white">{req.wallet_address}</span>
                      {req.status === "pending" && (
                        <Badge variant="pending" size="sm">
                          <Clock className="w-3 h-3 inline mr-1" />
                          Pending
                        </Badge>
                      )}
                      {req.status === "approved" && (
                        <Badge variant="success" size="sm">Approved</Badge>
                      )}
                      {req.status === "denied" && (
                        <Badge variant="error" size="sm">Denied</Badge>
                      )}
                    </div>
                    <div className="text-xs text-white/40 space-y-0.5">
                      <p>Buyer: <span className="text-white/70">{req.user_email}</span></p>
                      <p>Requested: {parseApiDate(req.requested_at).toLocaleString()}</p>
                      {req.reason && (
                        <p className="mt-1.5 text-white/60 italic">&ldquo;{req.reason}&rdquo;</p>
                      )}
                      {req.review_notes && (
                        <p className="mt-1.5 text-white/60">
                          <span className="text-white/40">Admin notes:</span> {req.review_notes}
                        </p>
                      )}
                      {req.reviewed_at && (
                        <p>Reviewed: {parseApiDate(req.reviewed_at).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  {req.status === "pending" && (
                    <div className="flex flex-col gap-2 shrink-0">
                      {reviewing === req.id ? (
                        <>
                          <textarea
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder="Optional notes for the buyer..."
                            maxLength={500}
                            rows={2}
                            className="w-64 px-3 py-2 text-sm bg-white/5 border border-white/10 text-white rounded-lg focus:outline-none focus:border-white/30"
                          />
                          <div className="flex gap-2">
                            <Button variant="primary" size="sm" onClick={() => handleApprove(req)}>
                              <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => handleDeny(req)}>
                              <XCircle className="w-4 h-4 mr-1" /> Deny
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setReviewing(null);
                                setReviewNotes("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setReviewing(req.id)}
                        >
                          Review
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmationModal />
    </IssuerDashboardLayout>
  );
}
