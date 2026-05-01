"use client";

import { useState } from "react";
import { isAddress, type Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/atoms";
import { AddressSetterRow } from "@/components/molecules/AddressSetterRow";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { PlatformAdminLayout } from "@/components/templates/PlatformAdminLayout";
import { useContractAction } from "@/hooks/useContractAction";
import { TOKEN_FACTORY_ABI } from "@/lib/contracts/abis/tokenFactory";
import { SALE_FACTORY_ABI } from "@/lib/contracts/abis/saleFactory";
import { FRACTION_FACTORY_ABI } from "@/lib/contracts/abis/fractionFactory";
import { OTC_TOKEN_FACTORY_ABI } from "@/lib/contracts/abis/otcTokenFactory";
import { getAddresses } from "@/lib/contracts/addresses";

const addr = getAddresses();
const TOKEN_FACTORY = addr.tokenFactory;
const SALE_FACTORY = addr.saleFactory;
const FRACTION_FACTORY = addr.fractionFactory;
const OTC_FACTORY = addr.otcTokenFactory;

function OwnerPreflight({
  factoryAddress,
  abi,
  label,
}: {
  factoryAddress: `0x${string}`;
  abi: Abi;
  label: string;
}) {
  const { address: wallet, isConnected } = useAccount();
  const { data } = useReadContracts({
    contracts: wallet
      ? [{ address: factoryAddress, abi, functionName: "owner" }]
      : [],
    query: { enabled: !!wallet },
  });
  const owner = data?.[0]?.result as string | undefined;
  const isOwner =
    owner && wallet ? owner.toLowerCase() === wallet.toLowerCase() : undefined;

  if (!isConnected || isOwner === undefined) return null;
  if (isOwner) {
    return (
      <Badge variant="success" size="sm" className="ml-2">
        Owner — {label}
      </Badge>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg ml-2">
      <ShieldAlert className="h-3.5 w-3.5" />
      Not owner of {label}
    </span>
  );
}

function SimpleIdentityModePanel({ factoryAddress }: { factoryAddress: `0x${string}` }) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const action = useContractAction();

  const handleSet = async (enabled: boolean) => {
    if (!isConnected) { openConnectModal?.(); return; }
    action.reset();
    await action.execute({
      address: factoryAddress,
      abi: TOKEN_FACTORY_ABI as unknown as Abi,
      functionName: "setSimpleIdentityMode",
      args: [enabled],
    });
  };

  return (
    <div className="py-3 border-b border-zinc-100 last:border-0">
      <p className="text-xs font-semibold text-zinc-700 mb-1">setSimpleIdentityMode</p>
      <p className="text-[11px] text-zinc-400 mb-3">
        Toggle between SimpleIdentityRegistry mode and full ONCHAINID mode.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => handleSet(true)}
          className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
          disabled={action.isPending || action.isConfirming}
        >
          Enable Simple Mode
        </button>
        <button
          onClick={() => handleSet(false)}
          className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
          disabled={action.isPending || action.isConfirming}
        >
          Disable Simple Mode
        </button>
      </div>
      <TransactionStatus
        isPending={action.isPending}
        isConfirming={action.isConfirming}
        isConfirmed={action.isConfirmed}
        txHash={action.txHash}
        txUrl={action.txUrl}
        error={action.error}
        successMessage="simpleIdentityMode updated on-chain."
      />
    </div>
  );
}

function UpdateImplementationsPanel({ factoryAddress }: { factoryAddress: `0x${string}` }) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const action = useContractAction();
  const [tokenImpl, setTokenImpl] = useState("");
  const [irImpl, setIrImpl] = useState("");
  const [complianceImpl, setComplianceImpl] = useState("");

  const allValid = isAddress(tokenImpl) && isAddress(irImpl) && isAddress(complianceImpl);

  const handleSave = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!allValid) return;
    action.reset();
    await action.execute({
      address: factoryAddress,
      abi: TOKEN_FACTORY_ABI as unknown as Abi,
      functionName: "updateImplementations",
      args: [tokenImpl as `0x${string}`, irImpl as `0x${string}`, complianceImpl as `0x${string}`],
    });
  };

  const fields = [
    { label: "tokenImpl", val: tokenImpl, set: setTokenImpl },
    { label: "identityRegistryImpl", val: irImpl, set: setIrImpl },
    { label: "complianceImpl", val: complianceImpl, set: setComplianceImpl },
  ];

  return (
    <div className="py-3 border-b border-zinc-100">
      <p className="text-xs font-semibold text-zinc-700 mb-2">
        updateImplementations (3 args in one tx)
      </p>
      <div className="space-y-2">
        {fields.map(({ label, val, set }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-40 shrink-0">{label}</span>
            <input
              value={val}
              onChange={(e) => { set(e.target.value.trim()); action.reset(); }}
              placeholder="0x..."
              maxLength={42}
              className={`flex-1 text-xs font-mono border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua ${
                val && !isAddress(val) ? "border-red-300" : "border-zinc-200"
              }`}
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={!allValid || action.isPending || action.isConfirming}
        className="mt-3 px-3 py-1.5 text-xs bg-darkAqua text-white rounded-lg disabled:opacity-40 hover:bg-darkAqua/90"
      >
        {action.isPending || action.isConfirming ? "Saving..." : "Save All Three"}
      </button>
      <TransactionStatus
        isPending={action.isPending}
        isConfirming={action.isConfirming}
        isConfirmed={action.isConfirmed}
        txHash={action.txHash}
        txUrl={action.txUrl}
        error={action.error}
        successMessage="TokenFactory implementations updated on-chain."
      />
    </div>
  );
}

function FactoryCard({
  title,
  address: factoryAddr,
  abi,
  label,
  children,
}: {
  title: string;
  address: `0x${string}`;
  abi: Abi;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-zinc-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50 flex items-center flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        <code className="text-[10px] font-mono text-zinc-400">{factoryAddr}</code>
        <OwnerPreflight factoryAddress={factoryAddr} abi={abi} label={label} />
      </div>
      <div className="px-5">{children}</div>
    </div>
  );
}

export default function ProtocolConfigPage() {
  if (!TOKEN_FACTORY && !SALE_FACTORY && !FRACTION_FACTORY && !OTC_FACTORY) {
    return (
      <PlatformAdminLayout title="Protocol Config" description="Factory implementation setters">
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
          No factory contract addresses are configured. Set the{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">NEXT_PUBLIC_*_FACTORY_ADDRESS</code>{" "}
          environment variables in this deployment.
        </div>
      </PlatformAdminLayout>
    );
  }

  return (
    <PlatformAdminLayout
      title="Protocol Config"
      description="Factory implementation setters — admin-only. Each call requires the connected wallet to be the factory owner."
      breadcrumbs={[
        { label: "Platform", href: "/platform/overview" },
        { label: "Protocol Config" },
      ]}
    >
      <div className="max-w-3xl space-y-8">
        {/* TokenFactory */}
        {TOKEN_FACTORY && (
          <FactoryCard
            title="CiretaTokenFactory"
            address={TOKEN_FACTORY}
            abi={TOKEN_FACTORY_ABI as unknown as Abi}
            label="TokenFactory"
          >
            <UpdateImplementationsPanel factoryAddress={TOKEN_FACTORY} />
            <SimpleIdentityModePanel factoryAddress={TOKEN_FACTORY} />
          </FactoryCard>
        )}

        {/* SaleFactory */}
        {SALE_FACTORY && (
          <FactoryCard
            title="CiretaSaleFactory"
            address={SALE_FACTORY}
            abi={SALE_FACTORY_ABI as unknown as Abi}
            label="SaleFactory"
          >
            {(
              [
                "setSaleImplementation",
                "setFractionFactory",
                "setFractionVaultImpl",
                "setFractionTokenImpl",
                "setIssuerRegistry",
                "setPlatformFeeManager",
              ] as const
            ).map((fn) => (
              <AddressSetterRow
                key={fn}
                label={fn}
                contractAddress={SALE_FACTORY}
                abi={SALE_FACTORY_ABI as unknown as Abi}
                functionName={fn}
              />
            ))}
          </FactoryCard>
        )}

        {/* FractionFactory */}
        {FRACTION_FACTORY && (
          <FactoryCard
            title="CiretaFractionFactory"
            address={FRACTION_FACTORY}
            abi={FRACTION_FACTORY_ABI as unknown as Abi}
            label="FractionFactory"
          >
            {(
              [
                "setFractionTokenImplementation",
                "setVaultImplementation",
              ] as const
            ).map((fn) => (
              <AddressSetterRow
                key={fn}
                label={fn}
                contractAddress={FRACTION_FACTORY}
                abi={FRACTION_FACTORY_ABI as unknown as Abi}
                functionName={fn}
              />
            ))}
          </FactoryCard>
        )}

        {/* OTCTokenFactory */}
        {OTC_FACTORY && (
          <FactoryCard
            title="IssuerOTCTokenFactory"
            address={OTC_FACTORY}
            abi={OTC_TOKEN_FACTORY_ABI as unknown as Abi}
            label="OTCFactory"
          >
            {(["setOTCTokenImplementation", "setIssuerRegistry"] as const).map((fn) => (
              <AddressSetterRow
                key={fn}
                label={fn}
                contractAddress={OTC_FACTORY}
                abi={OTC_TOKEN_FACTORY_ABI as unknown as Abi}
                functionName={fn}
              />
            ))}
          </FactoryCard>
        )}
      </div>
    </PlatformAdminLayout>
  );
}
