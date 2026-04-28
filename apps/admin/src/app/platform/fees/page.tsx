"use client";

import { useState, useEffect } from "react";
import { parseApiDate } from "@/lib/utils";
import { DollarSign, Users, Settings, ExternalLink, RefreshCw } from "lucide-react";
import { useReadContract, useChainId } from "wagmi";
import { isAddress, type Abi } from "viem";
import { Button, Input, Badge, Spinner } from "@/components/atoms";
import { StatCard } from "@/components/molecules";
import { CopyableAddress } from "@/components/atoms/CopyableAddress";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { PlatformAdminLayout } from "@/components/templates";
import { useContractAction } from "@/hooks/useContractAction";
import { PLATFORM_FEE_MANAGER_ABI } from "@/lib/contracts/abis/platformFeeManager";
import { requireAddress, getAddressUrl } from "@/lib/contracts/addresses";
import { apiFetch } from "@/lib/api/client";

interface PlatformStats {
  total_users: number;
  total_issuers: number;
  active_sales: number;
  tvl_usdc: number;
  total_raised_usdc: number;
  platform_fees_collected_usdc: number;
}

interface AuditLogEntry {
  id: string;
  action: string;
  details: string;
  created_at: string;
  actor_email?: string;
}

interface IssuerFeeOverride {
  issuer_address: string;
  issuer_name: string;
  fee_bps: number;
}

export default function FeesPage() {
  const chainId = useChainId();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [issuerOverrides, setIssuerOverrides] = useState<IssuerFeeOverride[]>([]);
  const [loading, setLoading] = useState(true);

  // On-chain fee manager actions
  const setReceiverAction = useContractAction();
  const setDefaultFeeAction = useContractAction();
  const setIssuerFeeAction = useContractAction();
  const removeIssuerFeeAction = useContractAction();
  const [removingIssuer, setRemovingIssuer] = useState<string | null>(null);

  // Form state
  const [newReceiver, setNewReceiver] = useState("");
  const [newDefaultFee, setNewDefaultFee] = useState("");
  const [issuerAddr, setIssuerAddr] = useState("");
  const [issuerFee, setIssuerFee] = useState("");

  let feeManagerAddress: `0x${string}` | null = null;
  try {
    feeManagerAddress = requireAddress("platformFeeManager");
  } catch {
    // Not configured
  }

  // Read on-chain values
  const { data: feeReceiverData, refetch: refetchReceiver } = useReadContract({
    address: feeManagerAddress ?? undefined,
    abi: PLATFORM_FEE_MANAGER_ABI as unknown as Abi,
    functionName: "feeReceiver",
    query: { enabled: !!feeManagerAddress },
  });

  const { data: defaultFeeBpsData, refetch: refetchFee } = useReadContract({
    address: feeManagerAddress ?? undefined,
    abi: PLATFORM_FEE_MANAGER_ABI as unknown as Abi,
    functionName: "defaultFeeBps",
    query: { enabled: !!feeManagerAddress },
  });

  const feeReceiver = feeReceiverData as string | undefined;
  const defaultFeeBps = defaultFeeBpsData as bigint | undefined;
  const defaultFeePercent = defaultFeeBps
    ? (Number(defaultFeeBps) / 100).toFixed(2)
    : "--";

  // Load backend stats and audit logs
  useEffect(() => {
    (async () => {
      try {
        const [statsData, logsData] = await Promise.all([
          apiFetch<PlatformStats>("/api/v1/admin/platform/stats").catch(() => null),
          apiFetch<{ items: AuditLogEntry[] }>("/api/v1/admin/audit-logs?action=fee&page=1&size=10").catch(() => ({ items: [] })),
        ]);
        if (statsData) setStats(statsData);
        setAuditLogs(logsData.items ?? []);
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load issuer fee overrides from backend
  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<IssuerFeeOverride[]>("/api/v1/admin/platform/fee-overrides");
        setIssuerOverrides(data ?? []);
      } catch {
        // endpoint may not exist yet
      }
    })();
  }, []);

  const handleSetReceiver = async () => {
    if (!feeManagerAddress || !newReceiver.trim()) return;
    setReceiverAction.reset();
    const receipt = await setReceiverAction.execute({
      address: feeManagerAddress,
      abi: PLATFORM_FEE_MANAGER_ABI as unknown as Abi,
      functionName: "setFeeReceiver",
      args: [newReceiver.trim() as `0x${string}`],
    });
    if (receipt) {
      setNewReceiver("");
      refetchReceiver();
    }
  };

  const handleSetDefaultFee = async () => {
    if (!feeManagerAddress || !newDefaultFee.trim()) return;
    setDefaultFeeAction.reset();
    const bps = Math.round(parseFloat(newDefaultFee) * 100);
    const receipt = await setDefaultFeeAction.execute({
      address: feeManagerAddress,
      abi: PLATFORM_FEE_MANAGER_ABI as unknown as Abi,
      functionName: "setDefaultFee",
      args: [BigInt(bps)],
    });
    if (receipt) {
      setNewDefaultFee("");
      refetchFee();
    }
  };

  const handleRemoveIssuerFee = async (issuerAddress: string) => {
    if (!feeManagerAddress) return;
    removeIssuerFeeAction.reset();
    setRemovingIssuer(issuerAddress);
    const receipt = await removeIssuerFeeAction.execute({
      address: feeManagerAddress,
      abi: PLATFORM_FEE_MANAGER_ABI as unknown as Abi,
      functionName: "removeIssuerCustomFee",
      args: [issuerAddress as `0x${string}`],
    });
    if (receipt) {
      setIssuerOverrides((prev) => prev.filter((o) => o.issuer_address !== issuerAddress));
    }
    setRemovingIssuer(null);
  };

  const handleSetIssuerFee = async () => {
    if (!feeManagerAddress || !issuerAddr.trim() || !issuerFee.trim()) return;
    setIssuerFeeAction.reset();
    const bps = Math.round(parseFloat(issuerFee) * 100);
    const receipt = await setIssuerFeeAction.execute({
      address: feeManagerAddress,
      abi: PLATFORM_FEE_MANAGER_ABI as unknown as Abi,
      functionName: "setIssuerFee",
      args: [issuerAddr.trim() as `0x${string}`, BigInt(bps)],
    });
    if (receipt) {
      setIssuerAddr("");
      setIssuerFee("");
    }
  };

  const refetchAll = () => {
    refetchReceiver();
    refetchFee();
  };

  return (
    <PlatformAdminLayout
      title="Fee Analytics"
      description="Platform fee configuration and revenue tracking"
      breadcrumbs={[
        { label: "Platform", href: "/platform/overview" },
        { label: "Fees" },
      ]}
      actions={
        <Button variant="outline" size="sm" onClick={refetchAll}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      }
    >
      {/* Summary Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Platform Fee Revenue"
          value={stats?.platform_fees_collected_usdc ?? 0}
          prefix="$"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          label="Total Raised"
          value={stats?.total_raised_usdc ?? 0}
          prefix="$"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          label="Default Fee"
          value={defaultFeePercent}
          suffix="%"
          icon={<Settings className="h-5 w-5" />}
        />
        <StatCard
          label="Active Sales"
          value={stats?.active_sales ?? 0}
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      {!feeManagerAddress && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
          PlatformFeeManager contract address not configured. Set <code className="font-mono bg-amber-100 px-1 rounded">NEXT_PUBLIC_PLATFORM_FEE_MANAGER_ADDRESS</code> in your environment.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* On-Chain Config */}
        <div className="bg-white rounded-lg p-6 border border-black/10">
          <h2 className="text-lg font-semibold text-text mb-4">On-Chain Configuration</h2>

          {/* Current fee receiver */}
          <div className="mb-5">
            <p className="text-sm text-zinc-500 mb-1">Fee Receiver</p>
            {feeReceiver ? (
              <div className="flex items-center gap-2">
                <CopyableAddress address={feeReceiver} truncate className="text-sm" />
                <a
                  href={getAddressUrl(chainId, feeReceiver) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : (
              <p className="text-sm text-zinc-400 italic">Not loaded</p>
            )}
          </div>

          {/* Current default fee */}
          <div className="mb-5">
            <p className="text-sm text-zinc-500 mb-1">Default Fee</p>
            <p className="text-lg font-semibold text-text">
              {defaultFeeBps !== undefined ? `${(Number(defaultFeeBps) / 100).toFixed(2)}%` : "--"}
              {defaultFeeBps !== undefined && (
                <span className="text-xs text-zinc-400 ml-2">({Number(defaultFeeBps)} bps)</span>
              )}
            </p>
          </div>

          {/* Update fee receiver */}
          <div className="border-t border-zinc-100 pt-4 mt-4 space-y-3">
            <Input
              label="Set Fee Receiver"
              placeholder="0x..."
              value={newReceiver}
              maxLength={42}
              onChange={(e) => setNewReceiver(e.target.value)}
              error={newReceiver && !isAddress(newReceiver) ? "Invalid EVM address" : undefined}
              helperText="Update the address that receives platform fees"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleSetReceiver}
              disabled={!feeManagerAddress || setReceiverAction.isPending || setReceiverAction.isConfirming}
              isLoading={setReceiverAction.isPending || setReceiverAction.isConfirming}
            >
              Update Receiver
            </Button>
            <TransactionStatus {...setReceiverAction} successMessage="Fee receiver updated" />
          </div>

          {/* Update default fee */}
          <div className="border-t border-zinc-100 pt-4 mt-4 space-y-3">
            <Input
              label="Set Default Fee (%)"
              placeholder="2.5"
              type="number"
              value={newDefaultFee}
              onChange={(e) => setNewDefaultFee(e.target.value)}
              helperText="Platform-wide default fee as a percentage (e.g. 2.5 = 250 bps)"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleSetDefaultFee}
              disabled={!feeManagerAddress || setDefaultFeeAction.isPending || setDefaultFeeAction.isConfirming}
              isLoading={setDefaultFeeAction.isPending || setDefaultFeeAction.isConfirming}
            >
              Update Default Fee
            </Button>
            <TransactionStatus {...setDefaultFeeAction} successMessage="Default fee updated" />
          </div>
        </div>

        {/* Per-Issuer Fee Override */}
        <div className="bg-white rounded-lg p-6 border border-black/10">
          <h2 className="text-lg font-semibold text-text mb-4">Per-Issuer Fee Override</h2>

          {issuerOverrides.length > 0 ? (
            <div className="space-y-3 mb-5">
              {issuerOverrides.map((o) => {
                const isRemoving = removingIssuer === o.issuer_address &&
                  (removeIssuerFeeAction.isPending || removeIssuerFeeAction.isConfirming);
                return (
                  <div key={o.issuer_address} className="flex items-center justify-between p-3 rounded-lg bg-box">
                    <div>
                      <p className="text-sm font-medium text-text">{o.issuer_name || "Unknown Issuer"}</p>
                      <CopyableAddress address={o.issuer_address} truncate className="text-xs text-zinc-400" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="default" size="sm">{(o.fee_bps / 100).toFixed(2)}%</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveIssuerFee(o.issuer_address)}
                        disabled={!feeManagerAddress || isRemoving}
                        isLoading={isRemoving}
                      >
                        Revert to default
                      </Button>
                    </div>
                  </div>
                );
              })}
              <TransactionStatus {...removeIssuerFeeAction} successMessage="Custom fee removed; issuer reverts to default." />
            </div>
          ) : (
            <p className="text-sm text-zinc-400 mb-5">No per-issuer fee overrides configured.</p>
          )}

          <div className="border-t border-zinc-100 pt-4 space-y-3">
            <Input
              label="Issuer Wallet Address"
              placeholder="0x..."
              value={issuerAddr}
              maxLength={42}
              onChange={(e) => setIssuerAddr(e.target.value)}
              error={issuerAddr && !isAddress(issuerAddr) ? "Invalid EVM address" : undefined}
            />
            <Input
              label="Fee Override (%)"
              placeholder="1.5"
              type="number"
              value={issuerFee}
              onChange={(e) => setIssuerFee(e.target.value)}
              helperText="Custom fee for this issuer. Set 0 to use default."
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleSetIssuerFee}
              disabled={!feeManagerAddress || setIssuerFeeAction.isPending || setIssuerFeeAction.isConfirming}
              isLoading={setIssuerFeeAction.isPending || setIssuerFeeAction.isConfirming}
            >
              Set Issuer Fee
            </Button>
            <TransactionStatus {...setIssuerFeeAction} successMessage="Issuer fee override updated" />
          </div>
        </div>
      </div>

      {/* Recent Fee Events / Audit Logs */}
      <div className="bg-white rounded-lg p-6 border border-black/10">
        <h2 className="text-lg font-semibold text-text mb-4">Recent Fee Activity</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : auditLogs.length === 0 ? (
          <p className="text-center text-zinc-400 py-8 text-sm">No fee-related activity yet.</p>
        ) : (
          <div className="space-y-3">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-start justify-between p-3 rounded-lg bg-box">
                <div>
                  <p className="text-sm font-medium text-text">{log.action}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{log.details}</p>
                  {log.actor_email && (
                    <p className="text-xs text-zinc-400 mt-0.5">by {log.actor_email}</p>
                  )}
                </div>
                <span className="text-xs text-zinc-400 whitespace-nowrap">
                  {parseApiDate(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PlatformAdminLayout>
  );
}
