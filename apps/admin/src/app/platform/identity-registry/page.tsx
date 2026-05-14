"use client";

import { useState } from "react";
import { isAddress, type Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ShieldAlert, Users } from "lucide-react";
import { Button, Badge } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { CheckRolesPanel } from "@/components/molecules/CheckRolesPanel";
import { PlatformAdminLayout } from "@/components/templates/PlatformAdminLayout";
import { useContractAction } from "@/hooks/useContractAction";
import { SIMPLE_IDENTITY_REGISTRY_ABI } from "@/lib/contracts/abis/simpleIdentityRegistry";

const IR_ADDRESS = (
  process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS ?? ""
) as `0x${string}`;

// Standard bytes32 role constants
const REGISTRAR_ROLE =
  "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6" as const;
const COMPLIANCE_ROLE =
  "0x2427b1dcc74a5fd2e00a7cd1c578789d9a68f8a42a40e83b7c543bd98e4fc73a" as const;
const AGENT_ROLE =
  "0xcdbf1d1c64faad6046b5b53d6a6821b434c73ab58fcfa37f7fc6c8d3b8e7d68f" as const;
const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

type RoleKey = "DEFAULT_ADMIN_ROLE" | "REGISTRAR_ROLE" | "COMPLIANCE_ROLE" | "AGENT_ROLE";

const ROLE_OPTIONS: { key: RoleKey; label: string; hash: `0x${string}` }[] = [
  { key: "DEFAULT_ADMIN_ROLE", label: "Default Admin", hash: DEFAULT_ADMIN_ROLE },
  { key: "REGISTRAR_ROLE", label: "Registrar", hash: REGISTRAR_ROLE },
  { key: "COMPLIANCE_ROLE", label: "Compliance", hash: COMPLIANCE_ROLE },
  { key: "AGENT_ROLE", label: "Agent", hash: AGENT_ROLE },
];

export default function IdentityRegistryRolesPage() {
  const { address: connectedAddress, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [grantRole, setGrantRole] = useState<`0x${string}`>(DEFAULT_ADMIN_ROLE);
  const [grantAddress, setGrantAddress] = useState("");
  const [revokeRole, setRevokeRole] = useState<`0x${string}`>(DEFAULT_ADMIN_ROLE);
  const [revokeAddress, setRevokeAddress] = useState("");

  const grantAction = useContractAction();
  const revokeAction = useContractAction();

  // Pre-flight: check if connected wallet has DEFAULT_ADMIN_ROLE
  const { data: adminCheckData } = useReadContracts({
    contracts:
      connectedAddress && IR_ADDRESS
        ? [
            {
              address: IR_ADDRESS,
              abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
              functionName: "hasRole",
              args: [DEFAULT_ADMIN_ROLE, connectedAddress],
            },
          ]
        : [],
    query: { enabled: !!connectedAddress && !!IR_ADDRESS },
  });
  const isAdmin = adminCheckData?.[0]?.result === true;

  const handleGrant = async (): Promise<void> => {
    if (!isConnected) { openConnectModal?.(); return; }
    grantAction.reset();
    await grantAction.execute({
      address: IR_ADDRESS,
      abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
      functionName: "grantRole",
      args: [grantRole, grantAddress as `0x${string}`],
    });
  };

  const handleRevoke = async (): Promise<void> => {
    if (!isConnected) { openConnectModal?.(); return; }
    revokeAction.reset();
    await revokeAction.execute({
      address: IR_ADDRESS,
      abi: SIMPLE_IDENTITY_REGISTRY_ABI as unknown as Abi,
      functionName: "revokeRole",
      args: [revokeRole, revokeAddress as `0x${string}`],
    });
  };

  const addressInputClass = (val: string): string =>
    `w-full bg-box border rounded-lg px-3 py-2 text-text text-sm font-mono ${
      val && !isAddress(val) ? "border-red-300" : "border-black/10"
    }`;

  if (!IR_ADDRESS) {
    return (
      <PlatformAdminLayout title="Identity Registry" description="Role management">
        <p className="text-sm text-red-600">
          NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS is not configured.
        </p>
      </PlatformAdminLayout>
    );
  }

  return (
    <PlatformAdminLayout
      title="Identity Registry — Role Management"
      description="Grant, revoke, and manage roles on the SimpleIdentityRegistry contract"
      breadcrumbs={[
        { label: "Platform", href: "/platform/overview" },
        { label: "Identity Registry" },
      ]}
    >
      <div className="max-w-2xl space-y-8">
        {/* Admin role pre-flight warning */}
        {isConnected && !isAdmin && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            Your connected wallet does not hold DEFAULT_ADMIN_ROLE on the
            identity registry. Role grant/revoke calls will revert.
          </div>
        )}

        {/* Contract info */}
        <div className="bg-white rounded-lg border border-zinc-100 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Registry Contract</p>
            <code className="text-xs font-mono text-zinc-700">{IR_ADDRESS}</code>
          </div>
          {isConnected && isAdmin && (
            <Badge variant="success" size="sm">Admin confirmed</Badge>
          )}
        </div>

        {/* Role reference */}
        <div className="bg-white rounded-lg border border-zinc-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-900">Role Constants</h2>
          </div>
          <p className="text-xs text-zinc-400 mb-3">
            Role membership is stored on-chain. Use your block explorer to query{" "}
            <code className="font-mono">getRoleMemberCount</code> /{" "}
            <code className="font-mono">getRoleMember</code> if your registry
            supports AccessControlEnumerable.
          </p>
          <div className="space-y-2">
            {ROLE_OPTIONS.map(({ key, label, hash }) => (
              <div key={key} className="flex items-center gap-3 text-xs">
                <Badge variant="default" size="sm">{label}</Badge>
                <code className="font-mono text-zinc-500 break-all">{hash}</code>
              </div>
            ))}
          </div>
        </div>

        {/* Grant role */}
        <div className="bg-white rounded-lg border border-zinc-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900">Grant Role</h2>
          <div>
            <label className="block text-xs text-zinc-600 mb-1">Role</label>
            <select
              value={grantRole}
              onChange={(e) => setGrantRole(e.target.value as `0x${string}`)}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
            >
              {ROLE_OPTIONS.map(({ key, label, hash }) => (
                <option key={key} value={hash}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-600 mb-1">Address</label>
            <input
              value={grantAddress}
              onChange={(e) => { setGrantAddress(e.target.value.trim()); grantAction.reset(); }}
              placeholder="0x..."
              maxLength={42}
              className={addressInputClass(grantAddress)}
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleGrant}
            disabled={!isAddress(grantAddress) || grantAction.isPending || grantAction.isConfirming}
            isLoading={grantAction.isPending || grantAction.isConfirming}
          >
            Grant Role
          </Button>
          <TransactionStatus
            isPending={grantAction.isPending}
            isConfirming={grantAction.isConfirming}
            isConfirmed={grantAction.isConfirmed}
            txHash={grantAction.txHash}
            txUrl={grantAction.txUrl}
            error={grantAction.error}
            successMessage="Role granted on-chain."
          />
        </div>

        {/* Revoke role */}
        <div className="bg-white rounded-lg border border-zinc-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900">Revoke Role</h2>
          <div>
            <label className="block text-xs text-zinc-600 mb-1">Role</label>
            <select
              value={revokeRole}
              onChange={(e) => setRevokeRole(e.target.value as `0x${string}`)}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
            >
              {ROLE_OPTIONS.map(({ key, label, hash }) => (
                <option key={key} value={hash}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-600 mb-1">Address</label>
            <input
              value={revokeAddress}
              onChange={(e) => { setRevokeAddress(e.target.value.trim()); revokeAction.reset(); }}
              placeholder="0x..."
              maxLength={42}
              className={addressInputClass(revokeAddress)}
            />
          </div>
          <Button
            variant="dangerOutline"
            size="sm"
            onClick={handleRevoke}
            disabled={!isAddress(revokeAddress) || revokeAction.isPending || revokeAction.isConfirming}
            isLoading={revokeAction.isPending || revokeAction.isConfirming}
          >
            Revoke Role
          </Button>
          <TransactionStatus
            isPending={revokeAction.isPending}
            isConfirming={revokeAction.isConfirming}
            isConfirmed={revokeAction.isConfirmed}
            txHash={revokeAction.txHash}
            txUrl={revokeAction.txUrl}
            error={revokeAction.error}
            successMessage="Role revoked on-chain."
          />
        </div>

        {/* Check Roles */}
        <CheckRolesPanel registryAddress={IR_ADDRESS} />
      </div>
    </PlatformAdminLayout>
  );
}
