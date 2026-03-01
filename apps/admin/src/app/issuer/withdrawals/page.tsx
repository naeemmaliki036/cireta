"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  DollarSign,
  ArrowUpRight,
  Clock,
  AlertCircle,
  X,
} from "lucide-react";
import { Button, Input, Badge } from "@/components/atoms";
import { StatCard, DataTable, type Column } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Withdrawal {
  id: string;
  amount: number;
  token: string;
  status: "pending" | "processing" | "completed" | "failed";
  txHash?: string;
  requestedAt: string;
  completedAt?: string;
}

const MOCK_BALANCE = {
  available: 164000,
  pending: 25000,
  totalWithdrawn: 450000,
};

const MOCK_WITHDRAWALS: Withdrawal[] = [
  { id: "1", amount: 50000, token: "USDC", status: "completed", txHash: "0x1234...5678", requestedAt: "2024-02-28", completedAt: "2024-02-28" },
  { id: "2", amount: 25000, token: "USDC", status: "processing", requestedAt: "2024-03-01" },
  { id: "3", amount: 75000, token: "USDC", status: "completed", txHash: "0xabcd...ef12", requestedAt: "2024-02-20", completedAt: "2024-02-20" },
  { id: "4", amount: 100000, token: "USDC", status: "completed", txHash: "0x9876...4321", requestedAt: "2024-02-15", completedAt: "2024-02-15" },
];

export default function WithdrawalsPage() {
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleWithdraw = async () => {
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsSubmitting(false);
    setShowWithdrawModal(false);
    setWithdrawAmount("");
  };

  const columns: Column<Withdrawal>[] = [
    {
      key: "amount",
      header: "Amount",
      render: (row) => (
        <span className="font-semibold text-text">{formatCurrency(row.amount)}</span>
      ),
    },
    {
      key: "token",
      header: "Token",
      render: (row) => <Badge variant="outline" size="sm">{row.token}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge
          variant={
            row.status === "completed"
              ? "success"
              : row.status === "processing"
              ? "pending"
              : row.status === "failed"
              ? "error"
              : "outline"
          }
          size="sm"
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: "txHash",
      header: "Transaction",
      render: (row) =>
        row.txHash ? (
          <a
            href={`https://basescan.org/tx/${row.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-darkAqua hover:underline"
          >
            {row.txHash}
          </a>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      key: "requestedAt",
      header: "Date",
      render: (row) => <span className="text-gray-500">{formatDate(row.requestedAt)}</span>,
    },
  ];

  return (
    <IssuerDashboardLayout
      title="Withdrawals"
      description="Withdraw your earned fees and track withdrawal history"
      actions={
        <Button
          variant="primary"
          leftIcon={<ArrowUpRight className="h-4 w-4" />}
          onClick={() => setShowWithdrawModal(true)}
        >
          Withdraw Funds
        </Button>
      }
    >
      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          label="Available to Withdraw"
          value={MOCK_BALANCE.available}
          prefix="$"
          icon={<Wallet className="h-5 w-5" />}
          variant="teal"
        />
        <StatCard
          label="Pending Withdrawal"
          value={MOCK_BALANCE.pending}
          prefix="$"
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Total Withdrawn"
          value={MOCK_BALANCE.totalWithdrawn}
          prefix="$"
          icon={<DollarSign className="h-5 w-5" />}
        />
      </div>

      {/* Fee Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-8"
      >
        <h3 className="text-lg font-semibold text-text mb-4">Fee Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 rounded-2xl bg-box">
            <p className="text-sm text-gray-500 mb-1">WAGR Sales</p>
            <p className="text-xl font-bold text-text">{formatCurrency(120000)}</p>
            <p className="text-xs text-gray-400 mt-1">2% of $6M raised</p>
          </div>
          <div className="p-4 rounded-2xl bg-box">
            <p className="text-sm text-gray-500 mb-1">CFQ2 Sales</p>
            <p className="text-xl font-bold text-text">{formatCurrency(44000)}</p>
            <p className="text-xs text-gray-400 mt-1">2% of $2.2M raised</p>
          </div>
          <div className="p-4 rounded-2xl bg-box">
            <p className="text-sm text-gray-500 mb-1">Redemption Fees</p>
            <p className="text-xl font-bold text-text">{formatCurrency(25000)}</p>
            <p className="text-xs text-gray-400 mt-1">0.5% of redemptions</p>
          </div>
        </div>
      </motion.div>

      {/* Withdrawal History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="text-lg font-semibold text-text mb-4">Withdrawal History</h3>
        <DataTable columns={columns} data={MOCK_WITHDRAWALS} />
      </motion.div>

      {/* Withdraw Modal */}
      <AnimatePresence>
        {showWithdrawModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowWithdrawModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-8 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-text">Withdraw Funds</h2>
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  className="p-2 hover:bg-box rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="bg-box rounded-2xl p-4 mb-6">
                <p className="text-sm text-gray-500 mb-1">Available Balance</p>
                <p className="text-2xl font-bold text-darkAqua">{formatCurrency(MOCK_BALANCE.available)}</p>
              </div>

              <div className="mb-6">
                <Input
                  label="Withdrawal Amount"
                  type="number"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setWithdrawAmount(MOCK_BALANCE.available.toString())}
                  className="text-sm font-medium text-darkAqua hover:underline mt-2"
                >
                  Withdraw Max
                </button>
              </div>

              <div className="p-4 rounded-xl bg-gold/10 border border-gold/30 flex gap-3 mb-6">
                <AlertCircle className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-600">
                  Withdrawals are processed within 24 hours and sent to your registered wallet.
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowWithdrawModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={handleWithdraw}
                  isLoading={isSubmitting}
                  disabled={!withdrawAmount || parseFloat(withdrawAmount) > MOCK_BALANCE.available}
                >
                  Confirm Withdrawal
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </IssuerDashboardLayout>
  );
}
