"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Search,
  Download,
  X,
  DollarSign,
} from "lucide-react";
import { Button, Input, Select } from "@/components/atoms";
import { DataTable, type Column, KYCBadge, WalletBadge, type KYCStatus } from "@/components/molecules";
import { IssuerDashboardLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";

interface Investor {
  id: string;
  wallet: string;
  email: string;
  kycStatus: KYCStatus;
  kycLevel: number;
  invested: number;
  tokensAllocated: number;
  firstInvestment: string;
}

const MOCK_INVESTORS: Investor[] = [
  { id: "1", wallet: "0x1234567890abcdef1234567890abcdef12345678", email: "investor1@example.com", kycStatus: "approved", kycLevel: 2, invested: 50000, tokensAllocated: 500, firstInvestment: "2024-02-01" },
  { id: "2", wallet: "0xabcdef1234567890abcdef1234567890abcdef12", email: "investor2@example.com", kycStatus: "approved", kycLevel: 2, invested: 25000, tokensAllocated: 250, firstInvestment: "2024-02-05" },
  { id: "3", wallet: "0x9876543210fedcba9876543210fedcba98765432", email: "investor3@example.com", kycStatus: "pending", kycLevel: 0, invested: 10000, tokensAllocated: 100, firstInvestment: "2024-02-10" },
  { id: "4", wallet: "0xfedcba9876543210fedcba9876543210fedcba98", email: "investor4@example.com", kycStatus: "approved", kycLevel: 1, invested: 75000, tokensAllocated: 750, firstInvestment: "2024-02-12" },
  { id: "5", wallet: "0x5678901234abcdef5678901234abcdef56789012", email: "investor5@example.com", kycStatus: "rejected", kycLevel: 0, invested: 0, tokensAllocated: 0, firstInvestment: "2024-02-15" },
];

export default function InvestorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [kycFilter, setKycFilter] = useState("all");
  const [showOTCModal, setShowOTCModal] = useState(false);
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(null);
  const [otcAmount, setOtcAmount] = useState("");

  const filteredInvestors = MOCK_INVESTORS.filter((investor) => {
    const matchesSearch =
      investor.wallet.toLowerCase().includes(searchQuery.toLowerCase()) ||
      investor.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesKyc = kycFilter === "all" || investor.kycStatus === kycFilter;
    return matchesSearch && matchesKyc;
  });

  const handleOTCAllocate = (investor: Investor) => {
    setSelectedInvestor(investor);
    setShowOTCModal(true);
  };

  const columns: Column<Investor>[] = [
    {
      key: "wallet",
      header: "Wallet",
      render: (row) => <WalletBadge address={row.wallet} />,
    },
    {
      key: "kycStatus",
      header: "KYC Status",
      render: (row) => <KYCBadge status={row.kycStatus} level={row.kycLevel} size="sm" />,
    },
    {
      key: "invested",
      header: "Total Invested",
      render: (row) => <span className="font-semibold">{formatCurrency(row.invested)}</span>,
    },
    {
      key: "tokensAllocated",
      header: "Tokens",
      render: (row) => <span className="text-darkAqua font-medium">{row.tokensAllocated.toLocaleString()} WAGR</span>,
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleOTCAllocate(row);
          }}
          disabled={row.kycStatus !== "approved"}
        >
          OTC Allocate
        </Button>
      ),
    },
  ];

  return (
    <IssuerDashboardLayout
      title="Investors"
      description="Manage your token investors and allocations"
      actions={
        <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />}>
          Export CSV
        </Button>
      }
    >
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-darkAqua/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-darkAqua" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Investors</p>
              <p className="text-2xl font-bold text-text">{MOCK_INVESTORS.length}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">KYC Approved</p>
              <p className="text-2xl font-bold text-text">
                {MOCK_INVESTORS.filter((i) => i.kycStatus === "approved").length}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-gold" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Pending KYC</p>
              <p className="text-2xl font-bold text-text">
                {MOCK_INVESTORS.filter((i) => i.kycStatus === "pending").length}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Invested</p>
              <p className="text-2xl font-bold text-text">
                {formatCurrency(MOCK_INVESTORS.reduce((sum, i) => sum + i.invested, 0))}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-3xl p-6 border border-darkBlack/10 mb-6"
      >
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by wallet or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-12"
            />
          </div>
          <Select
            options={[
              { value: "all", label: "All KYC Status" },
              { value: "approved", label: "Approved" },
              { value: "pending", label: "Pending" },
              { value: "rejected", label: "Rejected" },
            ]}
            value={kycFilter}
            onChange={(e) => setKycFilter(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Investors Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <DataTable
          columns={columns}
          data={filteredInvestors}
          emptyMessage="No investors found"
        />
      </motion.div>

      {/* OTC Modal */}
      <AnimatePresence>
        {showOTCModal && selectedInvestor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowOTCModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-8 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-text">OTC Allocation</h2>
                <button
                  onClick={() => setShowOTCModal(false)}
                  className="p-2 hover:bg-box rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Allocating to:</p>
                <WalletBadge address={selectedInvestor.wallet} />
              </div>

              <div className="mb-6">
                <Input
                  label="Token Amount"
                  type="number"
                  placeholder="Enter amount of tokens"
                  value={otcAmount}
                  onChange={(e) => setOtcAmount(e.target.value)}
                  helperText="These tokens will be allocated directly without payment"
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowOTCModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" className="flex-1" disabled={!otcAmount}>
                  Allocate Tokens
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </IssuerDashboardLayout>
  );
}
