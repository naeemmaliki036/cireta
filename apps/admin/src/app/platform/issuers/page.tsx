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
  Globe,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/atoms";
import { DataTable } from "@/components/molecules";
import { PlatformAdminLayout } from "@/components/templates";
import { buildIssuerColumns, type IssuerRow } from "@/lib/issuerColumns";
import { IssuerActionModal } from "@/components/organisms/IssuerActionModal";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { getIssuers, revokeIssuer, activateIssuer, updateIssuerFee, type Issuer as APIIssuer } from "@/lib/api/repositories/issuers";
import { ISSUER_REGISTRY_ABI } from "@/lib/contracts/abis/issuerRegistry";
import { getAddresses } from "@/lib/contracts/addresses";

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

/** On-chain status per issuer ID */
type OnChainStatus = "unknown" | "checking" | "registered" | "not_registered";

export default function IssuersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [apiIssuers, setApiIssuers] = useState<Issuer[]>([]);
  const [onChainStatus, setOnChainStatus] = useState<Record<string, OnChainStatus>>({});
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const issuerRegistryAddr = getAddresses().issuerRegistry;

  const { writeContract: registerIssuer, data: registerHash } = useWriteContract();
  const { writeContract: activateIssuerOnChain, data: activateHash } = useWriteContract();

  const { isSuccess: registerConfirmed } = useWaitForTransactionReceipt({ hash: registerHash });
  const { isSuccess: activateConfirmed } = useWaitForTransactionReceipt({ hash: activateHash });

  useEffect(() => {
    (async () => {
      try { const d = await getIssuers(1, 50); setApiIssuers(d.items.map(mapIssuer)); }
      catch (err) { console.error("Failed to load issuers:", err); }
    })();
  }, []);

  // After register tx confirms, send activate tx
  useEffect(() => {
    if (registerConfirmed && registeringId) {
      const issuer = apiIssuers.find(i => i.id === registeringId);
      if (issuer && issuer.wallet !== "—" && issuerRegistryAddr) {
        activateIssuerOnChain({
          address: issuerRegistryAddr,
          abi: ISSUER_REGISTRY_ABI,
          functionName: "activateIssuer",
          args: [issuer.wallet as `0x${string}`],
        });
      }
    }
  }, [registerConfirmed]);

  // After activate tx confirms, mark as registered
  useEffect(() => {
    if (activateConfirmed && registeringId) {
      setOnChainStatus(prev => ({ ...prev, [registeringId]: "registered" }));
      setRegisteringId(null);
    }
  }, [activateConfirmed]);

  const handleRegisterOnChain = (issuer: Issuer) => {
    if (registeringId) return;
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!issuerRegistryAddr) {
      alert("Issuer Registry contract address not configured");
      return;
    }
    if (issuer.wallet === "—") {
      alert("Issuer has no wallet address");
      return;
    }
    setRegisteringId(issuer.id);
    registerIssuer({
      address: issuerRegistryAddr,
      abi: ISSUER_REGISTRY_ABI,
      functionName: "registerIssuer",
      args: [issuer.wallet as `0x${string}`, issuer.name, issuer.jurisdiction || ""],
    }, {
      onError: (err) => {
        console.error("On-chain registration failed:", err);
        const msg = err.message.includes("user rejected") ? "Transaction rejected" : err.message;
        alert(`Registration failed: ${msg}`);
        setRegisteringId(null);
      },
    });
  };

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

      {/* On-Chain Registration Panel */}
      {apiIssuers.filter(i => i.status === "active" && i.wallet !== "—").length > 0 && (
        <div className="mt-6 border border-zinc-200 rounded-lg bg-white">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center gap-2">
            <Globe className="h-4 w-4 text-zinc-600" />
            <h3 className="text-sm font-semibold text-zinc-900">On-Chain Issuer Registry</h3>
            <span className="text-xs text-zinc-500">Register active issuers to the IssuerRegistry contract</span>
          </div>
          <div className="divide-y divide-zinc-100">
            {apiIssuers
              .filter(i => i.status === "active" && i.wallet !== "—")
              .map(issuer => {
                const chainStatus = onChainStatus[issuer.id] ?? "unknown";
                return (
                  <div key={issuer.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{issuer.name}</p>
                        <p className="text-xs text-zinc-500 font-mono">{issuer.wallet.slice(0, 6)}...{issuer.wallet.slice(-4)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {chainStatus === "registered" ? (
                        <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-medium">
                          <Check className="h-3 w-3" /> On-Chain
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={registeringId === issuer.id}
                          onClick={() => handleRegisterOnChain(issuer)}
                        >
                          {registeringId === issuer.id ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              Registering...
                            </>
                          ) : (
                            <>
                              <Globe className="h-3.5 w-3.5 mr-1.5" />
                              Register On-Chain
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

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
