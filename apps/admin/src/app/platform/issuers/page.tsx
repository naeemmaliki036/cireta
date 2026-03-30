"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Building2,
  Search,
  Check,
  DollarSign,
  ListChecks,
} from "lucide-react";
import { Button, Select } from "@/components/atoms";
import { DataTable } from "@/components/molecules";
import { PlatformAdminLayout } from "@/components/templates";
import { buildIssuerColumns, type IssuerRow } from "@/lib/issuerColumns";
import { IssuerActionModal } from "@/components/organisms/IssuerActionModal";
import { getIssuers, revokeIssuer, activateIssuer, updateIssuerFee, type Issuer as APIIssuer } from "@/lib/api/repositories/issuers";
function mapIssuer(i: APIIssuer): Issuer {
  return {
    id: i.id, name: i.name, legalEntity: i.legal_entity_name ?? "—", jurisdiction: i.jurisdiction ?? "—",
    wallet: i.wallet_address ?? "—", walletStatus: i.wallet_status, identityStatus: i.identity_status,
    issuerType: i.issuer_type, feeBps: i.fee_bps, status: i.status as Issuer["status"],
    tokens: 0, totalRaised: 0, createdAt: i.created_at.slice(0, 10),
  };
}

type Issuer = IssuerRow;


type ModalType = "approve" | "fee" | "revoke" | null;

export default function IssuersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [apiIssuers, setApiIssuers] = useState<Issuer[]>([]);

  useEffect(() => {
    (async () => {
      try { const d = await getIssuers(1, 50); setApiIssuers(d.items.map(mapIssuer)); }
      catch (err) { console.error("Failed to load issuers:", err); }
    })();
  }, []);
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedIssuer, setSelectedIssuer] = useState<Issuer | null>(null);
  const [newFee, setNewFee] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredIssuers = apiIssuers.filter((issuer) => {
    const matchesSearch =
      issuer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issuer.legalEntity.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || issuer.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleAction = async () => {
    if (!selectedIssuer || !modalType) return;
    setIsSubmitting(true);
    try {
      if (modalType === "approve") {
        await activateIssuer(selectedIssuer.id, "");
        setApiIssuers(prev => prev.map(i => i.id === selectedIssuer.id ? { ...i, status: "active" as const } : i));
      } else if (modalType === "revoke") {
        await revokeIssuer(selectedIssuer.id, "");
        setApiIssuers(prev => prev.map(i => i.id === selectedIssuer.id ? { ...i, status: "suspended" as const } : i));
      } else if (modalType === "fee") {
        await updateIssuerFee(selectedIssuer.id, parseInt(newFee), "");
        setApiIssuers(prev => prev.map(i => i.id === selectedIssuer.id ? { ...i, feeBps: parseInt(newFee) } : i));
      }
    } catch (err) { console.error("Issuer action failed:", err); }
    setIsSubmitting(false);
    setModalType(null); setSelectedIssuer(null); setNewFee(""); setRevokeReason("");
  };

  const columns = buildIssuerColumns((issuer, action, fee) => {
    setSelectedIssuer(issuer);
    setModalType(action);
    if (action === "fee" && fee !== undefined) setNewFee(fee.toString());
  });
  return (
    <PlatformAdminLayout
      title="Issuer Management"
      description="Manage platform issuers, fees, and approvals"
      actions={
        <Link href="/platform/issuers/whitelist">
          <Button variant="primary">
            <ListChecks className="h-4 w-4 mr-2" />
            Manage Whitelist
          </Button>
        </Link>
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
              <p className="text-2xl font-bold text-text">{apiIssuers.length}</p>
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
                {apiIssuers.filter((i) => i.status === "active").length}
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
                {apiIssuers.filter((i) => i.status === "pending").length}
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
                ${apiIssuers.reduce((sum, i) => sum + i.totalRaised, 0).toLocaleString()}
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

      <IssuerActionModal
        modalType={modalType}
        issuerName={selectedIssuer?.name ?? ""}
        feeBps={selectedIssuer?.feeBps ?? 0}
        newFee={newFee}
        revokeReason={revokeReason}
        isSubmitting={isSubmitting}
        onNewFeeChange={setNewFee}
        onRevokeReasonChange={setRevokeReason}
        onConfirm={handleAction}
        onClose={() => { setModalType(null); setSelectedIssuer(null); }}
      />
    </PlatformAdminLayout>
  );
}
