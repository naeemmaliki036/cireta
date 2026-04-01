"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Search,
  Check,
  DollarSign,
  ListChecks,
  Clock,
} from "lucide-react";
import { Button } from "@/components/atoms";
import { DataTable } from "@/components/molecules";
import { PlatformAdminLayout } from "@/components/templates";
import { buildIssuerColumns, type IssuerRow } from "@/lib/issuerColumns";
import { IssuerActionModal } from "@/components/organisms/IssuerActionModal";
import { getIssuers, revokeIssuer, activateIssuer, updateIssuerFee, type Issuer as APIIssuer } from "@/lib/api/repositories/issuers";

function mapIssuer(i: APIIssuer): Issuer {
  return {
    id: i.id, name: i.name, email: i.email ?? "—", legalEntity: i.legal_entity_name ?? "—", jurisdiction: i.jurisdiction ?? "—",
    wallet: i.wallet_address ?? "—", walletStatus: i.wallet_status, identityStatus: i.identity_status,
    issuerType: i.issuer_type, feeBps: i.fee_bps, status: i.status as Issuer["status"],
    tokens: 0, projectCount: i.project_count, totalRaised: 0, createdAt: i.created_at.slice(0, 10),
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

  const active = apiIssuers.filter((i) => i.status === "active").length;
  const pendingCount = apiIssuers.filter((i) => i.status === "pending").length;

  return (
    <PlatformAdminLayout
      title="Issuer Management"
      description="Manage platform issuers, fees, and approvals"
    >
      {/* Inline stats + Whitelist button */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[
          { label: "Total Issuers", value: apiIssuers.length, icon: Building2, color: "text-zinc-600" },
          { label: "Active", value: active, icon: Check, color: "text-green-600" },
          { label: "Pending", value: pendingCount, icon: Clock, color: "text-amber-600" },
          { label: "Total Raised", value: `$${apiIssuers.reduce((sum, i) => sum + i.totalRaised, 0).toLocaleString()}`, icon: DollarSign, color: "text-purple-600" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs"
          >
            <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
            <span className="text-zinc-500">{stat.label}</span>
            <span className="font-semibold text-zinc-900">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Filters + Whitelist button */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search issuers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full border border-zinc-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:border-zinc-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-zinc-400"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
        <div className="ml-auto">
          <Link href="/platform/issuers/whitelist">
            <Button variant="outline" size="sm">
              <ListChecks className="h-4 w-4 mr-2" />
              Manage Issuer Whitelist
            </Button>
          </Link>
        </div>
      </div>

      {/* Table */}
      <DataTable columns={columns} data={filteredIssuers} />

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
