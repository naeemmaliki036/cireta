"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Search,
  Plus,
  Check,
  X,
  Edit,
  Ban,
  DollarSign,
} from "lucide-react";
import { Button, Input, Select, Badge, Textarea } from "@/components/atoms";
import { DataTable, type Column } from "@/components/molecules";
import { PlatformAdminLayout } from "@/components/templates";
import { formatCurrency } from "@/lib/utils";

interface Issuer {
  id: string;
  name: string;
  legalEntity: string;
  jurisdiction: string;
  wallet: string;
  feeBps: number;
  status: "pending" | "active" | "suspended";
  tokens: number;
  totalRaised: number;
  createdAt: string;
}

const MOCK_ISSUERS: Issuer[] = [
  { id: "1", name: "Gold Reserve Holdings", legalEntity: "Gold Reserve Holdings Ltd.", jurisdiction: "Cayman Islands", wallet: "0x1234567890abcdef1234567890abcdef12345678", feeBps: 200, status: "active", tokens: 2, totalRaised: 8200000, createdAt: "2024-01-15" },
  { id: "2", name: "Commodity Partners", legalEntity: "Commodity Partners Inc.", jurisdiction: "Delaware, USA", wallet: "0xabcdef1234567890abcdef1234567890abcdef12", feeBps: 200, status: "active", tokens: 3, totalRaised: 5400000, createdAt: "2024-01-20" },
  { id: "3", name: "Future Metals Corp", legalEntity: "Future Metals Corporation", jurisdiction: "Singapore", wallet: "0x9876543210fedcba9876543210fedcba98765432", feeBps: 150, status: "pending", tokens: 0, totalRaised: 0, createdAt: "2024-02-28" },
  { id: "4", name: "Silver Standard", legalEntity: "Silver Standard LLC", jurisdiction: "BVI", wallet: "0xfedcba9876543210fedcba9876543210fedcba98", feeBps: 200, status: "suspended", tokens: 1, totalRaised: 1200000, createdAt: "2024-02-01" },
];

type ModalType = "approve" | "fee" | "revoke" | null;

export default function IssuersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedIssuer, setSelectedIssuer] = useState<Issuer | null>(null);
  const [newFee, setNewFee] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredIssuers = MOCK_ISSUERS.filter((issuer) => {
    const matchesSearch =
      issuer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issuer.legalEntity.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || issuer.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleAction = async () => {
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsSubmitting(false);
    setModalType(null);
    setSelectedIssuer(null);
    setNewFee("");
    setRevokeReason("");
  };

  const columns: Column<Issuer>[] = [
    {
      key: "name",
      header: "Issuer",
      render: (row) => (
        <div>
          <p className="font-semibold text-text">{row.name}</p>
          <p className="text-sm text-gray-500">{row.legalEntity}</p>
        </div>
      ),
    },
    {
      key: "jurisdiction",
      header: "Jurisdiction",
      render: (row) => <span className="text-gray-600">{row.jurisdiction}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge
          variant={
            row.status === "active"
              ? "success"
              : row.status === "pending"
              ? "pending"
              : "error"
          }
          size="sm"
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: "feeBps",
      header: "Fee",
      render: (row) => <span className="font-medium">{row.feeBps / 100}%</span>,
    },
    {
      key: "tokens",
      header: "Tokens",
      render: (row) => <span className="text-darkAqua font-medium">{row.tokens}</span>,
    },
    {
      key: "totalRaised",
      header: "Total Raised",
      render: (row) => <span className="font-semibold">{formatCurrency(row.totalRaised)}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.status === "pending" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIssuer(row);
                setModalType("approve");
              }}
            >
              <Check className="h-4 w-4 mr-1" />
              Approve
            </Button>
          )}
          {row.status === "active" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIssuer(row);
                  setNewFee((row.feeBps / 100).toString());
                  setModalType("fee");
                }}
              >
                <Edit className="h-4 w-4 mr-1" />
                Fee
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIssuer(row);
                  setModalType("revoke");
                }}
              >
                <Ban className="h-4 w-4 mr-1" />
                Revoke
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <PlatformAdminLayout
      title="Issuer Management"
      description="Manage platform issuers, fees, and approvals"
      actions={
        <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
          Onboard Issuer
        </Button>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-darkAqua/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-darkAqua" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Issuers</p>
              <p className="text-2xl font-bold text-text">{MOCK_ISSUERS.length}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-6 border border-darkBlack/10"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Active</p>
              <p className="text-2xl font-bold text-text">
                {MOCK_ISSUERS.filter((i) => i.status === "active").length}
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
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-gold" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Pending</p>
              <p className="text-2xl font-bold text-text">
                {MOCK_ISSUERS.filter((i) => i.status === "pending").length}
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
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Raised</p>
              <p className="text-2xl font-bold text-text">
                {formatCurrency(MOCK_ISSUERS.reduce((sum, i) => sum + i.totalRaised, 0))}
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
              placeholder="Search issuers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-12"
            />
          </div>
          <Select
            options={[
              { value: "all", label: "All Status" },
              { value: "active", label: "Active" },
              { value: "pending", label: "Pending" },
              { value: "suspended", label: "Suspended" },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Issuers Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <DataTable columns={columns} data={filteredIssuers} />
      </motion.div>

      {/* Modals */}
      <AnimatePresence>
        {modalType && selectedIssuer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setModalType(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-8 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-text">
                  {modalType === "approve" && "Approve Issuer"}
                  {modalType === "fee" && "Update Fee"}
                  {modalType === "revoke" && "Revoke Issuer"}
                </h2>
                <button
                  onClick={() => setModalType(null)}
                  className="p-2 hover:bg-box rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Issuer:</p>
                <p className="font-semibold text-text">{selectedIssuer.name}</p>
                <p className="text-sm text-gray-500">{selectedIssuer.legalEntity}</p>
              </div>

              {modalType === "approve" && (
                <div className="p-4 rounded-xl bg-green-50 border border-green-200 mb-6">
                  <p className="text-sm text-green-700">
                    This will activate the issuer account and allow them to create tokens and sales.
                  </p>
                </div>
              )}

              {modalType === "fee" && (
                <div className="mb-6">
                  <Input
                    label="Platform Fee (%)"
                    type="number"
                    step="0.1"
                    value={newFee}
                    onChange={(e) => setNewFee(e.target.value)}
                    helperText="Fee charged on token sales (in percentage)"
                  />
                </div>
              )}

              {modalType === "revoke" && (
                <div className="mb-6">
                  <Textarea
                    label="Reason for Revocation"
                    placeholder="Provide a reason..."
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                  />
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200 mt-4">
                    <p className="text-sm text-red-700">
                      <strong>Warning:</strong> This will suspend the issuer&apos;s ability to create new
                      tokens or sales. Existing tokens will remain active.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setModalType(null)}>
                  Cancel
                </Button>
                <Button
                  variant={modalType === "revoke" ? "danger" : "primary"}
                  className="flex-1"
                  onClick={handleAction}
                  isLoading={isSubmitting}
                >
                  {modalType === "approve" && "Approve Issuer"}
                  {modalType === "fee" && "Update Fee"}
                  {modalType === "revoke" && "Revoke Issuer"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PlatformAdminLayout>
  );
}
