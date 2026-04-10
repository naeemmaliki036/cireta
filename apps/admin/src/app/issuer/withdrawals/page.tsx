"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Wallet, Clock, DollarSign, X } from "lucide-react";
import { Button, Input, Badge, Spinner } from "@/components/atoms";
import { StatCard, DataTable, type Column } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";
import { getWithdrawals, executeWithdrawal, type WithdrawalRecord } from "@/lib/api/repositories/withdrawals";
import { getAccessToken } from "@/lib/api/client";

function getToken() {
  return getAccessToken() ?? "";
}

const columns: Column<WithdrawalRecord>[] = [
  {
    key: "amount",
    header: "Amount",
    render: (row) => <span className="font-semibold text-text">{formatCurrency(parseFloat(row.amount))} {row.token}</span>,
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <Badge variant={row.status === "available" ? "active" : row.status === "processing" ? "pending" : "default"} size="sm">{row.status}</Badge>,
  },
  {
    key: "tx_hash",
    header: "Tx Hash",
    render: (row) => row.tx_hash
      ? <code className="text-xs bg-box px-2 py-1 rounded">{row.tx_hash.slice(0, 10)}…</code>
      : <span className="text-black/30 text-sm">—</span>,
  },
  {
    key: "requested_at",
    header: "Date",
    render: (row) => <span className="text-sm text-black/60">{row.requested_at.slice(0, 10)}</span>,
  },
];

export default function WithdrawalsPage() {
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [available, setAvailable] = useState(0);
  const [pending, setPending] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [records, setRecords] = useState<WithdrawalRecord[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await getWithdrawals(getToken());
        setAvailable(parseFloat(data.summary.available));
        setPending(parseFloat(data.summary.pending));
        setTotalWithdrawn(parseFloat(data.summary.total_withdrawn));
        setRecords(data.items);
      } catch (err) { console.error("Failed to load withdrawals:", err); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <IssuerDashboardLayout title="Withdrawals" description="Withdraw raised funds from your finalized sales">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Available" value={available} prefix="$" icon={<Wallet className="h-5 w-5" />} variant="teal" />
        <StatCard label="Pending" value={pending} prefix="$" icon={<Clock className="h-5 w-5" />} />
        <StatCard label="Total Withdrawn" value={totalWithdrawn} prefix="$" icon={<DollarSign className="h-5 w-5" />} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg p-6 border border-black/10 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-black/50">Available to withdraw</p>
            <p className="text-2xl font-bold text-darkAqua">{formatCurrency(available)}</p>
          </div>
          <Button variant="primary" onClick={() => setShowModal(true)} disabled={available === 0}>
            Withdraw Funds
          </Button>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg p-6 border border-black/10">
        <h2 className="text-lg font-semibold text-text mb-6">Withdrawal History</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : records.length === 0 ? (
          <p className="text-center text-black/40 py-8">No finalized sales yet</p>
        ) : (
          <DataTable columns={columns} data={records} />
        )}
      </motion.div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-lg p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text">Withdraw Funds</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-box rounded-lg"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-black/50 mb-4">Available: {formatCurrency(available)} USDC</p>
            {withdrawError && <p className="text-sm text-red-600 mb-4">{withdrawError}</p>}
            <Input label="Amount (USDC)" type="number" value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0.00" className="mb-2" />
            <button onClick={() => setWithdrawAmount(available.toString())}
              className="text-sm font-medium text-darkAqua hover:underline mb-6 block">
              Withdraw Max
            </button>
            <div className="flex gap-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button variant="primary" className="flex-1"
                disabled={!withdrawAmount || parseFloat(withdrawAmount) > available || withdrawing}
                onClick={async () => {
                  setWithdrawError(null);
                  setWithdrawing(true);
                  try {
                    const firstAvailable = records.find((r) => r.status === "available");
                    if (!firstAvailable) throw new Error("No available sale found");
                    await executeWithdrawal(firstAvailable.sale_id, withdrawAmount, getToken());
                    setShowModal(false);
                    setWithdrawAmount("");
                    // Refresh data
                    const data = await getWithdrawals(getToken());
                    setAvailable(parseFloat(data.summary.available));
                    setPending(parseFloat(data.summary.pending));
                    setTotalWithdrawn(parseFloat(data.summary.total_withdrawn));
                    setRecords(data.items);
                  } catch (err) {
                    setWithdrawError(err instanceof Error ? err.message : "Withdrawal failed");
                  } finally {
                    setWithdrawing(false);
                  }
                }}>
                {withdrawing ? "Processing..." : "Confirm Withdrawal"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </IssuerDashboardLayout>
  );
}
