"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button, Input, Spinner } from "@/components/atoms";
import { DashboardLayout } from "@/components/templates";
import { getPortfolio, createRedemption, type Holding } from "@/lib/api/repositories/portfolio.repository";

export default function RedeemTokenPage({ params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const [resolvedParams, setResolvedParams] = useState<{ token: string } | null>(null);

  useEffect(() => {
    paramsPromise.then(setResolvedParams);
  }, [paramsPromise]);

  if (!resolvedParams) return null;
  const [holding, setHolding] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "physical">("cash");
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const portfolio = await getPortfolio();
        const h = portfolio.holdings.find((h) => h.token_id === resolvedParams.token);
        if (h) setHolding(h);
      } catch { /* empty */ }
      finally { setLoading(false); }
    })();
  }, [resolvedParams.token]);

  const handleRedeem = async () => {
    if (!holding || !amount) return;
    setSubmitting(true);
    try {
      await createRedemption({ token_id: holding.token_id, amount, fulfillment_method: method });
      setShowSuccess(true);
    } catch { /* TODO: toast */ }
    setSubmitting(false);
  };

  const balance = holding ? parseFloat(holding.balance) : 0;
  const numericAmount = parseFloat(amount || "0");

  if (loading) {
    return <DashboardLayout title="Redeem"><div className="flex justify-center py-24"><Spinner /></div></DashboardLayout>;
  }

  if (!holding) {
    return <DashboardLayout title="Redeem"><p className="text-center text-gray-400 py-24">Token not found in portfolio</p></DashboardLayout>;
  }

  if (showSuccess) {
    return (
      <DashboardLayout title="Redeem">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="max-w-md mx-auto text-center py-20">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-semibold text-text mb-4">Redemption Submitted</h1>
          <p className="text-gray-500 mb-8">Your redemption request for {amount} {holding.token_symbol} has been submitted.</p>
          <Link href="/portfolio"><Button variant="primary" className="w-full">Back to Portfolio</Button></Link>
        </motion.div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Redeem ${holding.token_name}`}>
      <Link href="/portfolio" className="inline-flex items-center gap-2 text-gray-500 hover:text-text transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to Portfolio
      </Link>

      <div className="max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-8 border border-darkBlack/10">
          <h2 className="text-xl font-semibold text-text mb-2">Redeem {holding.token_name}</h2>
          <p className="text-sm text-darkBlack/50 mb-6">{holding.token_symbol} · Balance: {balance.toLocaleString()}</p>

          <Input label="Amount to Redeem" type="number" value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="0" className="mb-2" />
          <button onClick={() => setAmount(balance.toString())}
            className="text-sm font-medium text-darkAqua hover:underline mb-6 block">
            Redeem Max
          </button>

          <div className="mb-6">
            <label className="text-sm font-medium text-text mb-2 block">Fulfillment Method</label>
            <div className="flex gap-3">
              {(["cash", "physical"] as const).map((m) => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-medium transition-colors ${
                    method === m ? "border-darkAqua bg-darkAqua/10 text-darkAqua" : "border-darkBlack/10 text-darkBlack/50"
                  }`}>
                  {m === "cash" ? "Cash Settlement" : "Physical Delivery"}
                </button>
              ))}
            </div>
          </div>

          {numericAmount > 0 && (
            <div className="bg-box rounded-xl p-4 mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-darkBlack/50">Tokens to Burn</span>
                <span className="font-medium text-text">{numericAmount.toLocaleString()} {holding.token_symbol}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-darkBlack/50">Method</span>
                <span className="font-medium text-text">{method === "cash" ? "Cash" : "Physical"}</span>
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <Link href="/portfolio" className="flex-1">
              <Button variant="outline" className="w-full">Cancel</Button>
            </Link>
            <Button variant="primary" className="flex-1" onClick={handleRedeem}
              disabled={submitting || numericAmount <= 0 || numericAmount > balance}>
              {submitting ? <Spinner size="sm" /> : "Submit Redemption"}
            </Button>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
