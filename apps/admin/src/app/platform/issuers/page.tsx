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
  Copy,
} from "lucide-react";
import { Button } from "@/components/atoms";
import { DataTable } from "@/components/molecules";
import { ToastContainer, useToast } from "@/components/molecules/Toast";
import { PlatformAdminLayout } from "@/components/templates";
import { buildIssuerColumns, type IssuerRow } from "@/lib/issuerColumns";
import { IssuerActionModal } from "@/components/organisms/IssuerActionModal";
import { useAccount } from "wagmi";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { getIssuers, revokeIssuer, activateIssuer, updateIssuerFee, type Issuer as APIIssuer } from "@/lib/api/repositories/issuers";
import { ISSUER_REGISTRY_ABI } from "@/lib/contracts/abis/issuerRegistry";
import { getAddresses } from "@/lib/contracts/addresses";
import { useContractAction } from "@/hooks/useContractAction";

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
  const { toasts, showError, showSuccess, removeToast } = useToast();
  const issuerRegistryAddr = getAddresses().issuerRegistry;

  const registerIssuerAction = useContractAction();
  const activateIssuerAction = useContractAction();

  useEffect(() => {
    (async () => {
      try { const d = await getIssuers(1, 50); setApiIssuers(d.items.map(mapIssuer)); }
      catch (err) { console.error("Failed to load issuers:", err); }
    })();
  }, []);

  // Check on-chain status for all active issuers — uses a direct RPC client
  // so it works regardless of wallet connection state.
  useEffect(() => {
    if (!issuerRegistryAddr) return;
    const active = apiIssuers.filter(i => i.status === "active" && i.wallet !== "—");
    if (active.length === 0) return;
    const rpc = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
    const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
    active.forEach(issuer => {
      setOnChainStatus(prev => ({ ...prev, [issuer.id]: "checking" }));
      client.readContract({
        address: issuerRegistryAddr,
        abi: ISSUER_REGISTRY_ABI,
        functionName: "isActiveIssuer",
        args: [issuer.wallet as `0x${string}`],
      }).then((isActive) => {
        setOnChainStatus(prev => ({ ...prev, [issuer.id]: isActive ? "registered" : "not_registered" }));
      }).catch(() => {
        setOnChainStatus(prev => ({ ...prev, [issuer.id]: "not_registered" }));
      });
    });
  }, [apiIssuers, issuerRegistryAddr]);

  // After register tx confirms, send activate tx
  useEffect(() => {
    if (registerIssuerAction.isConfirmed && registeringId) {
      const issuer = apiIssuers.find(i => i.id === registeringId);
      if (issuer && issuer.wallet !== "—" && issuerRegistryAddr) {
        activateIssuerAction.execute({
          address: issuerRegistryAddr,
          abi: ISSUER_REGISTRY_ABI,
          functionName: "activateIssuer",
          args: [issuer.wallet as `0x${string}`],
          gas: 1_000_000n,
        });
      }
    }
  }, [registerIssuerAction.isConfirmed, registeringId]);

  // After activate tx confirms, mark as registered
  useEffect(() => {
    if (activateIssuerAction.isConfirmed && registeringId) {
      const issuer = apiIssuers.find(i => i.id === registeringId);
      setOnChainStatus(prev => ({ ...prev, [registeringId]: "registered" }));
      showSuccess(
        "On-Chain Registration Complete",
        `${issuer?.name || "Issuer"} has been successfully registered and activated on the Issuer Registry contract.`
      );
      setRegisteringId(null);
      registerIssuerAction.reset();
      activateIssuerAction.reset();
    }
  }, [activateIssuerAction.isConfirmed, registeringId, apiIssuers, showSuccess]);

  const handleRegisterOnChain = async (issuer: Issuer) => {
    if (registeringId || registerIssuerAction.isPending) return;
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!issuerRegistryAddr) {
      showError(
        "Configuration Error",
        "Issuer Registry contract address not configured. Please check your environment settings."
      );
      return;
    }
    if (issuer.wallet === "—") {
      showError(
        "Wallet Missing",
        `${issuer.name} has no wallet address configured. The issuer must connect a wallet before registration.`
      );
      return;
    }

    setRegisteringId(issuer.id);

    try {
      await registerIssuerAction.execute({
        address: issuerRegistryAddr,
        abi: ISSUER_REGISTRY_ABI,
        functionName: "registerIssuer",
        args: [issuer.wallet as `0x${string}`, issuer.name, issuer.jurisdiction || ""],
        gas: 1_000_000n,
      });
    } catch (err: any) {
      console.error("On-chain registration failed:", err);
      const isRejected = err.message?.includes("user rejected") || err.message?.includes("User denied");
      if (isRejected) {
        showError("Transaction Rejected", "You cancelled the transaction in your wallet.");
      } else if (err.message?.includes("already registered")) {
        setOnChainStatus(prev => ({ ...prev, [issuer.id]: "registered" }));
        showSuccess("Already Registered", `${issuer.name} is already registered on-chain.`);
      } else if (err.message?.includes("exceeds max transaction gas limit")) {
        showError(
          "Gas Limit Exceeded",
          "The transaction requires too much gas. This usually means the contract function is expensive or there's a network issue. Please try again or contact support."
        );
      } else {
        showError(
          "On-Chain Registration Failed",
          `The contract function "registerIssuer" reverted: ${err.message || 'Unknown error'}`
        );
      }
      setRegisteringId(null);
      registerIssuerAction.reset();
    }
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
    <>
      <PlatformAdminLayout
        title="Issuer Management"
        description="Manage platform issuers, fees, and approvals"
        actions={
          <Link href="/platform/issuers/whitelist">
            <Button variant="outline" size="sm">
              <ListChecks className="h-4 w-4 mr-2" />
              Manage Issuer Whitelist
            </Button>
          </Link>
        }
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
                const isThisRegistering = registeringId === issuer.id;
                const txHash = isThisRegistering
                  ? (activateIssuerAction.txHash ?? registerIssuerAction.txHash)
                  : null;
                return (
                  <div key={issuer.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{issuer.name}</p>
                        <span className="flex items-center gap-1">
                          <p className="text-xs text-zinc-500 font-mono">{issuer.wallet}</p>
                          <button
                            onClick={() => navigator.clipboard.writeText(issuer.wallet)}
                            className="text-zinc-400 hover:text-zinc-700 transition-colors"
                            title="Copy address"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </span>
                        {txHash && (
                          <a
                            href={`https://sepolia.basescan.org/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline font-mono"
                          >
                            {txHash.slice(0, 10)}...{txHash.slice(-6)}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {chainStatus === "checking" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                      ) : chainStatus === "registered" ? (
                        <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-medium">
                          <Check className="h-3 w-3" /> On-Chain
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isThisRegistering || registerIssuerAction.isPending || activateIssuerAction.isPending}
                          onClick={() => handleRegisterOnChain(issuer)}
                        >
                          {(isThisRegistering && (registerIssuerAction.isPending || registerIssuerAction.isConfirming)) ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              Registering...
                            </>
                          ) : (isThisRegistering && (activateIssuerAction.isPending || activateIssuerAction.isConfirming)) ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              Activating...
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

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
