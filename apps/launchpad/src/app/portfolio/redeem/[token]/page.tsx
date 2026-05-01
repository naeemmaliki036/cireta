"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Package, Truck, Clock, X } from "lucide-react";
import { Button, Input, Spinner } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { getPortfolio, createRedemption, cancelRedemption, getRedemptions, type Holding, type RedemptionRequest } from "@/lib/api/repositories/portfolio.repository";

export default function RedeemTokenPage({ params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const [resolvedParams, setResolvedParams] = useState<{ token: string } | null>(null);
  const [holding, setHolding] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "physical">("cash");
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [existingRedemptions, setExistingRedemptions] = useState<RedemptionRequest[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    paramsPromise.then(setResolvedParams);
  }, [paramsPromise]);

  useEffect(() => {
    if (!resolvedParams) return;
    (async () => {
      try {
        const [portfolio, redemptions] = await Promise.all([getPortfolio(), getRedemptions()]);
        const h = portfolio.holdings.find((h) => h.token_id === resolvedParams.token);
        if (h) setHolding(h);
        const tokenRedemptions = redemptions.filter(
          (r) => r.token_id === resolvedParams.token && r.status !== "cancelled"
        );
        setExistingRedemptions(tokenRedemptions);
      } catch (err) { console.error("Failed to load holdings:", err); }
      finally { setLoading(false); }
    })();
  }, [resolvedParams]);

  if (!resolvedParams) return null;

  const handleRedeem = async () => {
    if (!holding || !amount) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createRedemption({ token_id: holding.token_id, amount, fulfillment_method: method });
      setShowSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit redemption";
      setSubmitError(msg);
    }
    setSubmitting(false);
  };

  const balance = holding ? parseFloat(holding.balance) : 0;
  const numericAmount = parseFloat(amount || "0");

  if (loading) {
    return <DashboardLayout title="Redeem"><div className="flex justify-center py-24"><Spinner /></div></DashboardLayout>;
  }

  if (!holding) {
    return <DashboardLayout title="Redeem"><p className="text-center text-black/50 py-24">Token not found in portfolio</p></DashboardLayout>;
  }

  if (showSuccess) {
    return (
      <DashboardLayout title="Redeem">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-auto text-center py-16">
          <div className="w-16 h-16 rounded-full bg-darkAqua/10 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-darkAqua" />
          </div>
          <h1 className="text-xl font-semibold text-text mb-3">Redemption Submitted</h1>
          <p className="text-sm text-black/60 mb-6">Your redemption request for {amount} {holding.token_symbol} has been submitted.</p>
          <Link href="/portfolio"><Button variant="primary" className="w-full">Back to Portfolio</Button></Link>
        </motion.div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Redeem ${holding.token_name}`}>
      <div className="max-w-lg py-2">
        <Link href="/portfolio" className="inline-flex items-center gap-1.5 text-black/50 hover:text-text transition-colors mb-5 text-sm">
          <ArrowLeft className="h-4 w-4" /> Back to Portfolio
        </Link>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-black/10 p-6">
          <h2 className="text-base font-semibold text-text mb-1">Redeem {holding.token_name}</h2>
          <p className="text-xs text-black/50 mb-5">{holding.token_symbol} · Balance: {balance.toLocaleString()}</p>

          <Input label="Amount to Redeem" type="number" value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="0" className="mb-1.5" />
          <button onClick={() => setAmount(balance.toString())}
            className="text-xs font-medium text-darkAqua hover:underline mb-5 block">
            Redeem Max
          </button>

          <div className="mb-5">
            <label className="block text-xs font-semibold text-text mb-2 uppercase tracking-wider">Fulfillment Method</label>
            <div className="flex gap-3">
              {(["cash", "physical"] as const).map((m) => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-medium transition-colors ${
                    method === m
                      ? "border-darkAqua bg-darkAqua/10 text-darkAqua"
                      : "border-black/10 text-black/50 hover:border-black/20"
                  }`}>
                  {m === "cash" ? "Cash Settlement" : "Physical Delivery"}
                </button>
              ))}
            </div>
          </div>

          {numericAmount > 0 && (
            <div className="bg-box rounded-xl p-4 mb-5 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-black/50">Tokens to Burn</span>
                <span className="font-semibold tabular-nums">{numericAmount.toLocaleString()} {holding.token_symbol}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-black/50">Method</span>
                <span className="font-semibold">{method === "cash" ? "Cash" : "Physical"}</span>
              </div>
            </div>
          )}

          {submitError && (
            <div className="mb-4 rounded-xl border border-black/10 bg-box px-4 py-3 text-sm text-text">
              {submitError}
            </div>
          )}

          <div className="flex gap-3">
            <Link href="/portfolio" className="flex-1">
              <Button variant="outline" className="w-full">Cancel</Button>
            </Link>
            <Button variant="primary" className="flex-1" onClick={handleRedeem}
              disabled={submitting || numericAmount <= 0 || numericAmount > balance}>
              {submitting ? <Spinner size="sm" /> : "Submit Redemption"}
            </Button>
          </div>
        </motion.div>

        {existingRedemptions.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="mt-5 bg-white rounded-2xl border border-black/10 p-6">
            <h3 className="text-sm font-semibold text-text mb-4">Your Redemption Requests</h3>
            <div className="space-y-3">
              {existingRedemptions.map((r) => (
                <RedemptionStatusCard
                  key={r.id}
                  redemption={r}
                  onCancelled={(updated) => {
                    setExistingRedemptions((prev) =>
                      prev.map((x) => (x.id === updated.id ? updated : x))
                    );
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}

const STATUS_STEPS = ["pending", "processing", "shipped", "fulfilled"];

function RedemptionStatusCard({ redemption: r, onCancelled }: { redemption: RedemptionRequest; onCancelled: (updated: RedemptionRequest) => void }) {
  const idx = STATUS_STEPS.indexOf(r.status);
  const isPhysical = r.fulfillment_method === "physical";
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancel = async () => {
    if (!confirm("Cancel this redemption request? Your tokens stay in your wallet.")) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await cancelRedemption(r.id);
      onCancelled(updated);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Failed to cancel redemption");
    } finally {
      setCancelling(false);
    }
  };

  const statusLabel: Record<string, string> = {
    fulfilled: "Fulfilled",
    shipped: "Shipped",
    processing: "Processing",
    cancelled: "Cancelled",
    pending: "Pending",
  };

  const statusClass: Record<string, string> = {
    fulfilled: "bg-darkAqua/10 text-darkAqua",
    shipped: "bg-darkAqua/10 text-darkAqua",
    processing: "bg-box text-black/60",
    cancelled: "bg-box text-black/40 line-through",
    pending: "bg-box text-black/60",
  };

  return (
    <div className="border border-black/5 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-text tabular-nums">
          {Number(r.amount).toLocaleString()} project tokens
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass[r.status] ?? "bg-box text-black/60"}`}>
            {statusLabel[r.status] ?? r.status}
          </span>
          {r.status === "pending" && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="inline-flex items-center gap-1 text-xs text-text/70 hover:text-text disabled:opacity-50"
              title="Cancel this pending redemption"
            >
              <X className="h-3 w-3" /> {cancelling ? "Cancelling..." : "Cancel"}
            </button>
          )}
        </div>
      </div>

      {isPhysical && (
        <div className="flex items-center gap-2 mb-3">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2 flex-1">
              <div className={`h-1 w-full rounded-full ${i <= idx ? "bg-darkAqua" : "bg-black/10"}`} />
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-black/40 space-y-1">
        <p>
          {r.fulfillment_method === "physical" ? (
            <><Package className="inline h-3 w-3 mr-1" />Physical Delivery</>
          ) : (
            <><Clock className="inline h-3 w-3 mr-1" />Cash Settlement</>
          )}
          {" · "}{new Date(r.created_at).toLocaleDateString()}
        </p>
        {r.status === "shipped" && r.tracking_number && (
          <p className="text-darkAqua font-medium">
            <Truck className="inline h-3 w-3 mr-1" />Tracking: {r.tracking_number}
          </p>
        )}
        {r.shipped_at && (
          <p>Shipped: {new Date(r.shipped_at).toLocaleDateString()}</p>
        )}
        {r.fulfilled_at && (
          <p className="text-darkAqua">Delivered: {new Date(r.fulfilled_at).toLocaleDateString()}</p>
        )}
        {cancelError && <p className="text-text mt-1">{cancelError}</p>}
      </div>
    </div>
  );
}
