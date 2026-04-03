"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Shield, CheckCircle2, Globe, Users, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Abi } from "viem";
import { Button, Badge, Spinner } from "@/components/atoms";
import { IssuerDashboardLayout } from "@/components/templates";
import { getToken as fetchToken, type Token } from "@/lib/api/repositories/tokens";
import {
  getComplianceStatus,
  type ComplianceStatus,
} from "@/lib/api/repositories/token-compliance";
import { useContractAction } from "@/hooks/useContractAction";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { ModuleCard } from "./ComplianceModuleCards";

// ModularCompliance ABI — addModule / removeModule
const COMPLIANCE_ABI = [
  { name: "addModule", type: "function", stateMutability: "nonpayable", inputs: [{ name: "module", type: "address" }], outputs: [] },
  { name: "removeModule", type: "function", stateMutability: "nonpayable", inputs: [{ name: "module", type: "address" }], outputs: [] },
  { name: "getModules", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address[]" }] },
  { name: "owner", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
] as const;

// Platform-deployed compliance modules
const AVAILABLE_MODULES = [
  {
    id: "country_allow",
    name: "Country Allow List",
    description: "Only wallets from approved countries can hold or receive tokens. Configure allowed countries after attaching.",
    icon: Globe,
    address: process.env.NEXT_PUBLIC_COUNTRY_ALLOW_MODULE_ADDRESS || "",
    tag: "Regulatory",
    tagColor: "bg-blue-100 text-blue-700",
  },
  {
    id: "max_holders",
    name: "Max Holder Count",
    description: "Limits the total number of unique token holders. New investors are blocked once the cap is reached.",
    icon: Users,
    address: process.env.NEXT_PUBLIC_MAX_HOLDER_COUNT_MODULE_ADDRESS || "",
    tag: "Regulatory",
    tagColor: "bg-blue-100 text-blue-700",
  },
];

export default function TokenCompliancePage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const [tokenId, setTokenId] = useState("");
  const [token, setToken] = useState<Token | null>(null);
  const [compliance, setCompliance] = useState<ComplianceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const attachAction = useContractAction();
  const removeAction = useContractAction();

  useEffect(() => { paramsPromise.then((p) => setTokenId(p.id)); }, [paramsPromise]);

  const loadData = useCallback(async () => {
    if (!tokenId) return;
    setLoading(true);
    setError("");
    try {
      const [tokenData, complianceData] = await Promise.all([
        fetchToken(tokenId),
        getComplianceStatus(tokenId).catch(() => null),
      ]);
      setToken(tokenData);
      setCompliance(complianceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    setLoading(false);
  }, [tokenId]);

  useEffect(() => { loadData(); }, [loadData]);

  const complianceAddr = token?.compliance_address;
  const attachedAddresses = new Set(
    (compliance?.modules ?? []).map((m) => m.address.toLowerCase())
  );

  const handleAttach = async (moduleAddress: string, moduleName: string) => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!complianceAddr) { setActionMessage({ type: "error", text: "Compliance contract not found" }); return; }
    setActionMessage(null);

    const receipt = await attachAction.execute({
      address: complianceAddr as `0x${string}`,
      abi: COMPLIANCE_ABI as unknown as Abi,
      functionName: "addModule",
      args: [moduleAddress as `0x${string}`],
    });

    if (receipt) {
      setActionMessage({ type: "success", text: `${moduleName} attached successfully.` });
      await loadData();
    }
  };

  const handleRemove = async (moduleAddress: string) => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!complianceAddr) return;
    setActionMessage(null);

    const receipt = await removeAction.execute({
      address: complianceAddr as `0x${string}`,
      abi: COMPLIANCE_ABI as unknown as Abi,
      functionName: "removeModule",
      args: [moduleAddress as `0x${string}`],
    });

    if (receipt) {
      setActionMessage({ type: "success", text: "Module removed." });
      await loadData();
    }
  };

  if (loading) {
    return (
      <IssuerDashboardLayout title="Compliance" description="">
        <div className="flex justify-center py-24"><Spinner /></div>
      </IssuerDashboardLayout>
    );
  }

  if (error || !token) {
    return (
      <IssuerDashboardLayout title="Compliance" description="">
        <div className="mb-6">
          <Link href={tokenId ? `/issuer/tokens/${tokenId}` : "/issuer/tokens"}
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-text">
            <ArrowLeft className="h-4 w-4" /> Back to Token
          </Link>
        </div>
        <p className="text-center text-zinc-400 py-24">{error || "Token not found"}</p>
      </IssuerDashboardLayout>
    );
  }

  return (
    <IssuerDashboardLayout title={`${token.name} — Compliance`} description="Manage transfer restrictions for this token">
      <div className="mb-6">
        <Link href={`/issuer/tokens/${tokenId}`} className="flex items-center gap-2 text-sm text-zinc-500 hover:text-text">
          <ArrowLeft className="h-4 w-4" /> Back to Token
        </Link>
      </div>

      {/* Status messages */}
      {actionMessage && (
        <div className={`mb-4 p-3 rounded-xl border text-sm flex items-center gap-2 ${
          actionMessage.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-600"
        }`}>
          {actionMessage.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {actionMessage.text}
        </div>
      )}

      {/* Tx status for attach/remove */}
      {(attachAction.isPending || attachAction.isConfirming || attachAction.error) && (
        <div className="mb-4">
          <TransactionStatus isPending={attachAction.isPending} isConfirming={attachAction.isConfirming}
            isConfirmed={attachAction.isConfirmed} txHash={attachAction.txHash} txUrl={attachAction.txUrl}
            error={attachAction.error} successMessage="Module attached on-chain." />
        </div>
      )}
      {(removeAction.isPending || removeAction.isConfirming || removeAction.error) && (
        <div className="mb-4">
          <TransactionStatus isPending={removeAction.isPending} isConfirming={removeAction.isConfirming}
            isConfirmed={removeAction.isConfirmed} txHash={removeAction.txHash} txUrl={removeAction.txUrl}
            error={removeAction.error} successMessage="Module removed." />
        </div>
      )}

      {/* Summary */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-5 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Compliance Contract</p>
          {complianceAddr && (
            <p className="text-xs text-zinc-400 font-mono mt-0.5">{complianceAddr}</p>
          )}
        </div>
        <Badge variant={attachedAddresses.size > 0 ? "active" : "pending"} size="sm">
          {attachedAddresses.size} module{attachedAddresses.size !== 1 ? "s" : ""} active
        </Badge>
      </div>

      {/* Available Modules */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-zinc-900 mb-1">Available Modules</h3>
        <p className="text-xs text-zinc-400 mb-4">Select which rules to enforce on every token transfer. Attach from your connected wallet.</p>

        <div className="space-y-3">
          {AVAILABLE_MODULES.map((mod) => {
            const isAttached = attachedAddresses.has(mod.address.toLowerCase());
            const isAttaching = attachAction.isPending || attachAction.isConfirming;
            const isRemoving = removeAction.isPending || removeAction.isConfirming;
            const Icon = mod.icon;

            return (
              <div key={mod.id} className={`rounded-xl border-2 p-4 transition-all ${
                isAttached ? "border-green-300 bg-green-50/50" : "border-zinc-200 bg-white"
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isAttached ? "bg-green-100 text-green-600" : "bg-zinc-100 text-zinc-400"
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-zinc-900">{mod.name}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${mod.tagColor}`}>{mod.tag}</span>
                      {isAttached && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">{mod.description}</p>
                  </div>
                  <div className="flex-shrink-0">
                    {isAttached ? (
                      <Button variant="outline" size="sm" onClick={() => handleRemove(mod.address)}
                        disabled={isRemoving} isLoading={isRemoving}
                        className="text-red-600 border-red-200 hover:bg-red-50">
                        Remove
                      </Button>
                    ) : (
                      <Button variant="primary" size="sm" onClick={() => handleAttach(mod.address, mod.name)}
                        disabled={isAttaching || !mod.address} isLoading={isAttaching}>
                        {!isConnected ? "Connect Wallet" : "Attach"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Attached Module Configuration */}
      {compliance && compliance.modules.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 mb-1">Module Configuration</h3>
          <p className="text-xs text-zinc-400 mb-4">Configure the rules for each attached module.</p>
          <div className="space-y-4">
            {compliance.modules.map((mod) => (
              <ModuleCard key={mod.address} module={mod} tokenId={tokenId}
                complianceAddress={complianceAddr || ""}
                onRemove={handleRemove} onRefresh={loadData}
                removing={removeAction.isPending || removeAction.isConfirming} />
            ))}
          </div>
        </div>
      )}

      {(!compliance || compliance.modules.length === 0) && (
        <div className="text-center py-12">
          <Shield className="h-10 w-10 text-zinc-200 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">No modules attached yet.</p>
          <p className="text-xs text-zinc-300 mt-1">Attach a module above to start enforcing transfer rules.</p>
        </div>
      )}
    </IssuerDashboardLayout>
  );
}
