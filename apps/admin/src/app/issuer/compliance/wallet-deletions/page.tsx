"use client";

import { useEffect, useState, useCallback } from "react";
import { parseApiDate } from "@/lib/utils";
import { Trash2, CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { Button, Spinner, Badge } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { useConfirmation } from "@/components/molecules/ConfirmationModal";
import {
  listWalletDeletionRequests,
  approveWalletDeletionRequest,
  denyWalletDeletionRequest,
  type WalletDeletionRequest,
  type WalletDeletionStatus,
} from "@/lib/api/repositories/wallet-deletions";

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
      `Are you sure you want to approve removal of ${req.wallet_address}? This will UNLINK the wallet from the buyer's profile and enqueue an on-chain revoke from the identity registry. The buyer will be notified.`,
      async () => {
        try {
          await approveWalletDeletionRequest(req.id, reviewNotes || undefined);
          setReviewNotes("");
          setReviewing(null);
          await fetchRequests();
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
