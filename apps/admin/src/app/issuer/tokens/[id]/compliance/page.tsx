"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Shield, CheckCircle2, AlertCircle } from "lucide-react";
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
import { MODULAR_COMPLIANCE_ABI } from "@/lib/contracts/abis/modularCompliance";
import { ALL_COMPLIANCE_MODULES } from "@/lib/contracts/complianceModules";
import { ModuleCard } from "./ComplianceModuleCards";
import { AvailableModulesList } from "./AvailableModulesList";

// CountryAllowModule ABI — for auto-configuring system access after attach
const COUNTRY_ALLOW_ABI = [
  { name: "batchAllowCountries", type: "function", stateMutability: "nonpayable", inputs: [{ name: "compliance", type: "address" }, { name: "countries", type: "uint16[]" }], outputs: [] },
] as const;

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
  const autoConfigAction = useContractAction();
  const [autoConfigStatus, setAutoConfigStatus] = useState("");

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
    setAutoConfigStatus("");

    const receipt = await attachAction.execute({
      address: complianceAddr as `0x${string}`,
      abi: MODULAR_COMPLIANCE_ABI as unknown as Abi,
      functionName: "addModule",
      args: [moduleAddress as `0x${string}`],
    });

    if (receipt) {
      // Auto-configure system access for CountryAllowModule
      const countryMod = ALL_COMPLIANCE_MODULES.find((m) => m.id === "country_allow");
      if (moduleAddress.toLowerCase() === countryMod?.address?.toLowerCase()) {
        setAutoConfigStatus("Auto-configuring system access...");
        const configReceipt = await autoConfigAction.execute({
          address: moduleAddress as `0x${string}`,
          abi: COUNTRY_ALLOW_ABI as unknown as Abi,
          functionName: "batchAllowCountries",
          args: [complianceAddr as `0x${string}`, [0]],
          gas: 200_000n,
        });
        if (configReceipt) {
          setAutoConfigStatus("");
          setActionMessage({ type: "success", text: `${moduleName} attached and system access (country 0) configured.` });
        } else {
          setAutoConfigStatus("");
          setActionMessage({ type: "error", text: `${moduleName} attached, but auto-config of country code 0 failed. Add it manually.` });
        }
      } else {
        setActionMessage({ type: "success", text: `${moduleName} attached successfully.` });
      }
      await loadData();
    }
  };

  const handleRemove = async (moduleAddress: string) => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!complianceAddr) return;
    setActionMessage(null);

    const receipt = await removeAction.execute({
      address: complianceAddr as `0x${string}`,
      abi: MODULAR_COMPLIANCE_ABI as unknown as Abi,
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
    <IssuerDashboardLayout title={`${token.name} — Compliance`} description="Manage transfer restrictions for this token"
      actions={
        <Link href={`/issuer/tokens/${tokenId}`}>
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to Token
          </Button>
        </Link>
      }
    >
      {/* Status messages */}
      {actionMessage && (
        <div className={`mb-4 p-3 rounded-lg border text-sm flex items-center gap-2 ${
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
      {autoConfigStatus && (
        <div className="mb-4 p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-700 flex items-center gap-2">
          <Spinner className="h-4 w-4" /> {autoConfigStatus}
        </div>
      )}
      {(autoConfigAction.isPending || autoConfigAction.isConfirming || autoConfigAction.error) && (
        <div className="mb-4">
          <TransactionStatus isPending={autoConfigAction.isPending} isConfirming={autoConfigAction.isConfirming}
            isConfirmed={autoConfigAction.isConfirmed} txHash={autoConfigAction.txHash} txUrl={autoConfigAction.txUrl}
            error={autoConfigAction.error} successMessage="System access (country 0) configured." />
        </div>
      )}

      {/* Summary */}
      <div className="bg-white rounded-lg border border-zinc-100 p-5 mb-6 flex items-center justify-between">
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

      {/* Available Modules — all 11 */}
      <AvailableModulesList
        attachedAddresses={attachedAddresses}
        isConnected={isConnected}
        isAttaching={attachAction.isPending || attachAction.isConfirming}
        isRemoving={removeAction.isPending || removeAction.isConfirming}
        onAttach={handleAttach}
        onRemove={handleRemove}
      />

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
