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
import { buildIssuerColumns, type IssuerRow, type IssuerAction } from "@/lib/issuerColumns";
import { IssuerActionModal } from "@/components/organisms/IssuerActionModal";
import { useAccount } from "wagmi";
import { createPublicClient } from "viem";
import { getChain, getTransport, getChainId } from "@/lib/chain";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  getIssuers,
  revokeIssuer,
  activateIssuer,
  updateIssuerFee,
  type Issuer as APIIssuer,
} from "@/lib/api/repositories/issuers";
import { ISSUER_REGISTRY_ABI } from "@/lib/contracts/abis/issuerRegistry";
import { SIMPLE_IDENTITY_REGISTRY_ABI } from "@/lib/contracts/abis/simpleIdentityRegistry";
import { getAddresses, getTxUrl } from "@/lib/contracts/addresses";
import { useContractAction } from "@/hooks/useContractAction";
import { useIssuerChainActions } from "@/hooks/useIssuerChainActions";
import { COUNTRIES } from "@/components/molecules/CountrySelector";
import { ExplorerLinkIcon } from "@/components/atoms/ExplorerLinkIcon";
import { UpdateIssuerModal } from "@/components/molecules/UpdateIssuerModal";

function mapIssuer(i: APIIssuer): Issuer {
  return {
    id: i.id,
    name: i.name,
    email: i.email ?? "—",
    legalEntity: i.legal_entity_name ?? "—",
    jurisdiction: i.jurisdiction ?? "—",
    wallet: i.wallet_address ?? "—",
    walletStatus: i.wallet_status,
    identityStatus: i.identity_status,
    issuerType: i.issuer_type,
    feeBps: i.fee_bps,
    status: i.status as Issuer["status"],
    tokens: 0,
    projectCount: i.project_count,
    totalRaised: 0,
    createdAt: i.created_at.slice(0, 10),
  };
}

type Issuer = IssuerRow;
type ModalType = "approve" | "fee" | "revoke" | "reactivate" | null;

/**
 * On-chain status per issuer ID.
 * - registered     : isActiveIssuer AND isVerified on IR
 * - needs_whitelist: isActiveIssuer but NOT isVerified on IR
 * - not_registered : isActiveIssuer is false (not yet registered or suspended)
 */
type OnChainStatus =
  | "unknown"
  | "checking"
  | "registered"
  | "needs_whitelist"
  | "not_registered";

export default function IssuersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [apiIssuers, setApiIssuers] = useState<Issuer[]>([]);
  const [updateIssuerTarget, setUpdateIssuerTarget] = useState<Issuer | null>(null);
  const [onChainStatus, setOnChainStatus] = useState<Record<string, OnChainStatus>>({});
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  /** Tracks which issuer is mid-suspend or mid-reactivate on-chain */
  const [chainActionIssuerId, setChainActionIssuerId] = useState<string | null>(null);

  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { toasts, showError, showSuccess, removeToast } = useToast();
  const issuerRegistryAddr = getAddresses().issuerRegistry;

  const registerIssuerAction = useContractAction();
  const activateIssuerAction = useContractAction();
  const irWhitelistAction = useContractAction();

  const {
    hasManagerRole,
    suspendAction: suspendOnChainAction,
    reactivateAction: reactivateOnChainAction,
    executeChainSuspend,
    executeChainReactivate,
    resetAll: resetChainActions,
  } = useIssuerChainActions();

  const platformIR = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as
    | `0x${string}`
    | undefined;

  // ── Load issuers ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const d = await getIssuers(1, 50);
        setApiIssuers(d.items.map(mapIssuer));
      } catch (err) {
        console.error("Failed to load issuers:", err);
      }
    })();
  }, []);

  // ── On-chain status for all active + suspended issuers ──────────────────────
  useEffect(() => {
    if (!issuerRegistryAddr) return;
    const relevant = apiIssuers.filter(
      (i) => (i.status === "active" || i.status === "suspended") && i.wallet !== "—"
    );
    if (relevant.length === 0) return;
    const client = createPublicClient({ chain: getChain(), transport: getTransport() });
    relevant.forEach(async (issuer) => {
      setOnChainStatus((prev) => ({ ...prev, [issuer.id]: "checking" }));
      try {
        const isActive = await client.readContract({
          address: issuerRegistryAddr,
          abi: ISSUER_REGISTRY_ABI,
          functionName: "isActiveIssuer",
          args: [issuer.wallet as `0x${string}`],
        }) as boolean;
        if (!isActive) {
          setOnChainStatus((prev) => ({ ...prev, [issuer.id]: "not_registered" }));
          return;
        }
        if (!platformIR) {
          setOnChainStatus((prev) => ({ ...prev, [issuer.id]: "registered" }));
          return;
        }
        const isVerified = await client.readContract({
          address: platformIR,
          abi: SIMPLE_IDENTITY_REGISTRY_ABI,
          functionName: "isVerified",
          args: [issuer.wallet as `0x${string}`],
        }) as boolean;
        setOnChainStatus((prev) => ({
          ...prev,
          [issuer.id]: isVerified ? "registered" : "needs_whitelist",
        }));
      } catch {
        setOnChainStatus((prev) => ({ ...prev, [issuer.id]: "not_registered" }));
      }
    });
  }, [apiIssuers, issuerRegistryAddr, platformIR]);

  // ── Register → Activate chain (existing) ───────────────────────────────────
  useEffect(() => {
    if (registerIssuerAction.isConfirmed && registeringId) {
      const issuer = apiIssuers.find((i) => i.id === registeringId);
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

  // After activate confirms → check IR, optionally whitelist
  useEffect(() => {
    if (!activateIssuerAction.isConfirmed || !registeringId) return;
    const issuer = apiIssuers.find((i) => i.id === registeringId);
    if (!issuer || issuer.wallet === "—" || !platformIR) {
      setOnChainStatus((prev) => ({ ...prev, [registeringId]: "registered" }));
      showSuccess(
        "On-Chain Registration Complete",
        `${issuer?.name || "Issuer"} registered and activated.`
      );
      setRegisteringId(null);
      registerIssuerAction.reset();
      activateIssuerAction.reset();
      return;
    }
    const client = createPublicClient({ chain: getChain(), transport: getTransport() });
    client
      .readContract({
        address: platformIR,
        abi: SIMPLE_IDENTITY_REGISTRY_ABI,
        functionName: "isVerified",
        args: [issuer.wallet as `0x${string}`],
      })
      .then(async (verified) => {
        if (verified) {
          setOnChainStatus((prev) => ({ ...prev, [registeringId]: "registered" }));
          showSuccess(
            "On-Chain Registration Complete",
            `${issuer.name} registered, activated, and already verified on IR.`
          );
          setRegisteringId(null);
          registerIssuerAction.reset();
          activateIssuerAction.reset();
          return;
        }
        const jur = issuer.jurisdiction ?? "";
        const countryEntry = COUNTRIES.find(
          (c) => c.name.toLowerCase() === jur.toLowerCase()
        );
        const countryCode: number = countryEntry?.code ?? 0;
        await irWhitelistAction.execute({
          address: platformIR,
          abi: SIMPLE_IDENTITY_REGISTRY_ABI,
          functionName: "addToWhitelist",
          args: [issuer.wallet as `0x${string}`, countryCode],
          gas: 200_000n,
        });
      })
      .catch(() => {
        setOnChainStatus((prev) => ({ ...prev, [registeringId]: "registered" }));
        showSuccess(
          "On-Chain Registration Complete",
          `${issuer.name} registered and activated. IR check skipped.`
        );
        setRegisteringId(null);
        registerIssuerAction.reset();
        activateIssuerAction.reset();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activateIssuerAction.isConfirmed, registeringId]);

  // After IR whitelist confirms → finish
  useEffect(() => {
    if (!irWhitelistAction.isConfirmed || !registeringId) return;
    const issuer = apiIssuers.find((i) => i.id === registeringId);
    setOnChainStatus((prev) => ({ ...prev, [registeringId]: "registered" }));
    showSuccess(
      "On-Chain Registration Complete",
      `${issuer?.name || "Issuer"} registered, activated, and added to the identity registry.`
    );
    setRegisteringId(null);
    registerIssuerAction.reset();
    activateIssuerAction.reset();
    irWhitelistAction.reset();
  }, [irWhitelistAction.isConfirmed, registeringId, apiIssuers, showSuccess]);

  // ── Suspend on-chain confirmed ──────────────────────────────────────────────
  useEffect(() => {
    if (!suspendOnChainAction.isConfirmed || !chainActionIssuerId) return;
    const issuer = apiIssuers.find((i) => i.id === chainActionIssuerId);
    setOnChainStatus((prev) => ({ ...prev, [chainActionIssuerId]: "not_registered" }));
    showSuccess(
      "Issuer Suspended On-Chain",
      `${issuer?.name || "Issuer"} suspended in IssuerRegistry.`
    );
    setChainActionIssuerId(null);
    suspendOnChainAction.reset();
  }, [suspendOnChainAction.isConfirmed, chainActionIssuerId, apiIssuers, showSuccess]);

  // ── Reactivate on-chain confirmed ───────────────────────────────────────────
  useEffect(() => {
    if (!reactivateOnChainAction.isConfirmed || !chainActionIssuerId) return;
    const issuer = apiIssuers.find((i) => i.id === chainActionIssuerId);
    setOnChainStatus((prev) => ({ ...prev, [chainActionIssuerId]: "registered" }));
    showSuccess(
      "Issuer Reactivated On-Chain",
      `${issuer?.name || "Issuer"} reactivated in IssuerRegistry.`
    );
    setChainActionIssuerId(null);
    reactivateOnChainAction.reset();
  }, [reactivateOnChainAction.isConfirmed, chainActionIssuerId, apiIssuers, showSuccess]);

  // ── Whitelist-only path ─────────────────────────────────────────────────────
  const handleAddToIRWhitelist = async (issuer: Issuer) => {
    if (registeringId || irWhitelistAction.isPending) return;
    if (!isConnected) { openConnectModal?.(); return; }
    if (!platformIR) {
      showError("Configuration Error", "Identity Registry contract address not configured.");
      return;
    }
    if (issuer.wallet === "—") {
      showError("Wallet Missing", `${issuer.name} has no wallet address configured.`);
      return;
    }
    setRegisteringId(issuer.id);
    try {
      const jur = issuer.jurisdiction ?? "";
      const countryEntry = COUNTRIES.find(
        (c) => c.name.toLowerCase() === jur.toLowerCase()
      );
      const countryCode: number = countryEntry?.code ?? 0;
      await irWhitelistAction.execute({
        address: platformIR,
        abi: SIMPLE_IDENTITY_REGISTRY_ABI,
        functionName: "addToWhitelist",
        args: [issuer.wallet as `0x${string}`, countryCode],
        gas: 200_000n,
      });
    } catch (err: unknown) {
      console.error("IR whitelist failed:", err);
      const errMsg = err instanceof Error ? err.message : "";
      const isRejected =
        errMsg.includes("user rejected") || errMsg.includes("User denied");
      if (isRejected) {
        showError("Transaction Rejected", "You cancelled the transaction in your wallet.");
      } else {
        showError(
          "IR Whitelist Failed",
          `addToWhitelist reverted: ${errMsg || "Unknown error"}`
        );
      }
      setRegisteringId(null);
      irWhitelistAction.reset();
    }
  };

  // ── Register on-chain ───────────────────────────────────────────────────────
  const handleRegisterOnChain = async (issuer: Issuer) => {
    if (registeringId || registerIssuerAction.isPending) return;
    if (!isConnected) { openConnectModal?.(); return; }
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
    } catch (err: unknown) {
      console.error("On-chain registration failed:", err);
      const errMsg = err instanceof Error ? err.message : "";
      const isRejected =
        errMsg.includes("user rejected") || errMsg.includes("User denied");
      if (isRejected) {
        showError("Transaction Rejected", "You cancelled the transaction in your wallet.");
      } else if (errMsg.includes("already registered")) {
        setOnChainStatus((prev) => ({ ...prev, [issuer.id]: "registered" }));
        showSuccess("Already Registered", `${issuer.name} is already registered on-chain.`);
      } else if (errMsg.includes("exceeds max transaction gas limit")) {
        showError(
          "Gas Limit Exceeded",
          "The transaction requires too much gas. Please try again or contact support."
        );
      } else {
        showError(
          "On-Chain Registration Failed",
          `The contract function "registerIssuer" reverted: ${errMsg || "Unknown error"}`
        );
      }
      setRegisteringId(null);
      registerIssuerAction.reset();
    }
  };

  // ── Modal state ─────────────────────────────────────────────────────────────
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

  // Derived: is the selected issuer already on-chain?
  const selectedIsOnChain =
    selectedIssuer !== null &&
    (onChainStatus[selectedIssuer.id] === "registered" ||
      onChainStatus[selectedIssuer.id] === "needs_whitelist");

  // ── Handle modal confirm ────────────────────────────────────────────────────
  const handleAction = async () => {
    if (!selectedIssuer || !modalType) return;
    setIsSubmitting(true);
    try {
      if (modalType === "approve") {
        await activateIssuer(selectedIssuer.id, "");
        setApiIssuers((prev) =>
          prev.map((i) =>
            i.id === selectedIssuer.id ? { ...i, status: "active" as const } : i
          )
        );
        setIsSubmitting(false);
        setModalType(null);
        setSelectedIssuer(null);
      } else if (modalType === "fee") {
        await updateIssuerFee(selectedIssuer.id, parseInt(newFee), "");
        setApiIssuers((prev) =>
          prev.map((i) =>
            i.id === selectedIssuer.id ? { ...i, feeBps: parseInt(newFee) } : i
          )
        );
        setIsSubmitting(false);
        setModalType(null);
        setSelectedIssuer(null);
        setNewFee("");
      } else if (modalType === "revoke") {
        // Step 1: DB update
        await revokeIssuer(selectedIssuer.id, "");
        setApiIssuers((prev) =>
          prev.map((i) =>
            i.id === selectedIssuer.id ? { ...i, status: "suspended" as const } : i
          )
        );
        setIsSubmitting(false);
        setModalType(null);

        // Step 2: On-chain — only when issuer has a wallet and is registered
        if (selectedIsOnChain && selectedIssuer.wallet !== "—") {
          const capturedId = selectedIssuer.id;
          const capturedName = selectedIssuer.name;
          const capturedWallet = selectedIssuer.wallet;
          const capturedReason = revokeReason;
          setSelectedIssuer(null);
          setRevokeReason("");
          setChainActionIssuerId(capturedId);
          await executeChainSuspend(
            capturedWallet,
            capturedReason,
            () => { /* success handled by the isConfirmed effect */ },
            (msg) => {
              showError("On-Chain Suspend Failed", `${capturedName}: ${msg}`);
              setChainActionIssuerId(null);
              suspendOnChainAction.reset();
            }
          );
        } else {
          setSelectedIssuer(null);
          setRevokeReason("");
        }
      } else if (modalType === "reactivate") {
        // Step 1: DB update
        await activateIssuer(selectedIssuer.id, "");
        setApiIssuers((prev) =>
          prev.map((i) =>
            i.id === selectedIssuer.id ? { ...i, status: "active" as const } : i
          )
        );
        setIsSubmitting(false);
        setModalType(null);

        // Step 2: On-chain — attempt if issuer has a wallet and registry is configured
        const chainStatus = onChainStatus[selectedIssuer.id] ?? "unknown";
        const hadChainEntry = chainStatus !== "unknown" && chainStatus !== "checking";
        if (hadChainEntry && selectedIssuer.wallet !== "—") {
          const capturedId = selectedIssuer.id;
          const capturedName = selectedIssuer.name;
          const capturedWallet = selectedIssuer.wallet;
          setSelectedIssuer(null);
          setRevokeReason("");
          setChainActionIssuerId(capturedId);
          await executeChainReactivate(
            capturedWallet,
            () => { /* success handled by the isConfirmed effect */ },
            (msg) => {
              if (msg.includes("not suspended")) {
                setOnChainStatus((prev) => ({ ...prev, [capturedId]: "registered" }));
                showSuccess(
                  "Issuer Reactivated",
                  `${capturedName} reactivated in DB. Already active on-chain.`
                );
              } else {
                showError("On-Chain Reactivate Failed", `${capturedName}: ${msg}`);
              }
              setChainActionIssuerId(null);
              reactivateOnChainAction.reset();
            }
          );
        } else {
          setSelectedIssuer(null);
          setRevokeReason("");
        }
      }
    } catch (err) {
      console.error("Issuer action failed:", err);
      setIsSubmitting(false);
    }
  };

  const columns = buildIssuerColumns((issuer: Issuer, action: IssuerAction, fee?: number) => {
    setSelectedIssuer(issuer);
    setModalType(action);
    if (action === "fee" && fee !== undefined) setNewFee(fee.toString());
    resetChainActions();
  });

  const active = apiIssuers.filter((i) => i.status === "active").length;
  const pendingCount = apiIssuers.filter((i) => i.status === "pending").length;

  // Role warning shown inside the modal
  const chainActionModalOpen = modalType === "revoke" || modalType === "reactivate";
  const roleWarning =
    chainActionModalOpen && selectedIsOnChain && isConnected && hasManagerRole === false
      ? "The connected wallet does not have ISSUER_MANAGER_ROLE on IssuerRegistry and is not the contract owner. The on-chain transaction will revert. Grant the role first."
      : null;

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
        {/* Inline stats */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {[
            { label: "Total Issuers", value: apiIssuers.length, icon: Building2, color: "text-zinc-600" },
            { label: "Active", value: active, icon: Check, color: "text-green-600" },
            { label: "Pending", value: pendingCount, icon: Clock, color: "text-amber-600" },
            {
              label: "Total Raised",
              value: `$${apiIssuers.reduce((sum, i) => sum + i.totalRaised, 0).toLocaleString()}`,
              icon: DollarSign,
              color: "text-purple-600",
            },
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

        {/* Filters */}
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
        {apiIssuers.filter((i) => i.status === "active" && i.wallet !== "—").length > 0 && (
          <div className="mt-6 border border-zinc-200 rounded-lg bg-white">
            <div className="px-4 py-3 border-b border-zinc-200 flex items-center gap-2 flex-wrap">
              <Globe className="h-4 w-4 text-zinc-600" />
              <h3 className="text-sm font-semibold text-zinc-900">On-Chain Issuer Registry</h3>
              <span className="text-xs text-zinc-500">
                Register active issuers to the IssuerRegistry contract
              </span>
              <Link
                href="/platform/contracts"
                className="ml-auto text-xs font-medium text-darkAqua hover:underline"
              >
                View all platform contracts →
              </Link>
            </div>
            <div className="divide-y divide-zinc-100">
              {apiIssuers
                .filter((i) => i.status === "active" && i.wallet !== "—")
                .map((issuer) => {
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
                            <ExplorerLinkIcon address={issuer.wallet} />
                          </span>
                          {txHash && (
                            <a
                              href={getTxUrl(getChainId(), txHash) ?? undefined}
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
                        {/* Edit On-Chain button for registered issuers */}
                        {(chainStatus === "registered" || chainStatus === "needs_whitelist") && issuer.wallet !== "—" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUpdateIssuerTarget(issuer)}
                          >
                            Edit On-Chain
                          </Button>
                        )}
                        {chainStatus === "checking" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                        ) : chainStatus === "registered" ? (
                          <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-medium">
                            <Check className="h-3 w-3" /> On-Chain
                          </span>
                        ) : chainStatus === "needs_whitelist" ? (
                          <>
                            <span
                              className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs font-medium"
                              title="Issuer is registered + active on the IssuerRegistry, but the wallet is not whitelisted on the Identity Registry."
                            >
                              <Globe className="h-3 w-3" /> Needs IR whitelist
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isThisRegistering || irWhitelistAction.isPending}
                              onClick={() => handleAddToIRWhitelist(issuer)}
                            >
                              {isThisRegistering &&
                              (irWhitelistAction.isPending || irWhitelistAction.isConfirming) ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                  Whitelisting...
                                </>
                              ) : (
                                <>
                                  <Globe className="h-3.5 w-3.5 mr-1.5" />
                                  Add to Identity Registry
                                </>
                              )}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              isThisRegistering ||
                              registerIssuerAction.isPending ||
                              activateIssuerAction.isPending ||
                              irWhitelistAction.isPending
                            }
                            onClick={() => handleRegisterOnChain(issuer)}
                          >
                            {isThisRegistering &&
                            (registerIssuerAction.isPending || registerIssuerAction.isConfirming) ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                Registering (1/3)...
                              </>
                            ) : isThisRegistering &&
                              (activateIssuerAction.isPending ||
                                activateIssuerAction.isConfirming) ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                Activating (2/3)...
                              </>
                            ) : isThisRegistering &&
                              (irWhitelistAction.isPending || irWhitelistAction.isConfirming) ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                Whitelisting (3/3)...
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
          isOnChain={selectedIsOnChain}
          roleWarning={roleWarning}
          suspendTxState={
            modalType === "revoke"
              ? {
                  isPending: suspendOnChainAction.isPending,
                  isConfirming: suspendOnChainAction.isConfirming,
                  isConfirmed: suspendOnChainAction.isConfirmed,
                  txHash: suspendOnChainAction.txHash,
                  txUrl: suspendOnChainAction.txUrl,
                  error: suspendOnChainAction.error,
                }
              : null
          }
          reactivateTxState={
            modalType === "reactivate"
              ? {
                  isPending: reactivateOnChainAction.isPending,
                  isConfirming: reactivateOnChainAction.isConfirming,
                  isConfirmed: reactivateOnChainAction.isConfirmed,
                  txHash: reactivateOnChainAction.txHash,
                  txUrl: reactivateOnChainAction.txUrl,
                  error: reactivateOnChainAction.error,
                }
              : null
          }
          onNewFeeChange={setNewFee}
          onRevokeReasonChange={setRevokeReason}
          onConfirm={handleAction}
          onClose={() => {
            setModalType(null);
            setSelectedIssuer(null);
            resetChainActions();
          }}
        />
      </PlatformAdminLayout>

      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Update issuer on-chain modal */}
      {updateIssuerTarget && (
        <UpdateIssuerModal
          issuerWallet={updateIssuerTarget.wallet}
          issuerName={updateIssuerTarget.name}
          issuerJurisdiction={updateIssuerTarget.jurisdiction}
          onClose={() => setUpdateIssuerTarget(null)}
        />
      )}
    </>
  );
}
