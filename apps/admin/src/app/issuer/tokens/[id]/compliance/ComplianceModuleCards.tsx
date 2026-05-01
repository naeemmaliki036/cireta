"use client";

import { useState } from "react";
import { Globe, Users, Lock, CheckSquare, ArrowLeftRight, Link2, Shield, Trash2, Scale, Clock, Timer } from "lucide-react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Abi } from "viem";
import { Button, Input } from "@/components/atoms";
import {
  MaxBalanceConfig,
  MaxOwnershipConfig,
  TimeModuleConfig,
  TIME_LOCKED_TRANSFER_MODULE_ABI,
  TIME_TRANSFERS_LIMIT_MODULE_ABI,
} from "./NumericTimeModuleConfig";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { CountrySelector, COUNTRIES } from "@/components/molecules/CountrySelector";
import type { ComplianceModule } from "@/lib/api/repositories/token-compliance";
import {
  LockConfig,
  WhitelistConfig,
  TransferRestrictConfig,
  ConditionalTransferConfig,
} from "./AddressModuleConfig";

const COUNTRY_ALLOW_ABI = [
  { name: "batchAllowCountries", type: "function", stateMutability: "nonpayable", inputs: [{ name: "compliance", type: "address" }, { name: "countries", type: "uint16[]" }], outputs: [] },
  { name: "removeAllowedCountry", type: "function", stateMutability: "nonpayable", inputs: [{ name: "compliance", type: "address" }, { name: "country", type: "uint16" }], outputs: [] },
] as const;

const MAX_HOLDER_ABI = [
  { name: "setMaxHolderCount", type: "function", stateMutability: "nonpayable", inputs: [{ name: "compliance", type: "address" }, { name: "maxCount", type: "uint256" }], outputs: [] },
] as const;

function countryName(code: number): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? `Code ${code}`;
}

function CountryAllowConfig({
  module, complianceAddress, onRefresh,
}: { module: ComplianceModule; complianceAddress: string; onRefresh: () => void }) {
  const [selectedCodes, setSelectedCodes] = useState<Set<number>>(new Set());
  const allowed = module.config.allowed_countries ?? [];
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const batchAddAction = useContractAction();
  const removeAction = useContractAction();

  const handleBatchAdd = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (selectedCodes.size === 0) return;

    // Always include country code 0 (System/Contracts) if not already allowed
    const codes = new Set(selectedCodes);
    if (!allowed.includes(0)) codes.add(0);

    const receipt = await batchAddAction.execute({
      address: module.address as `0x${string}`,
      abi: COUNTRY_ALLOW_ABI as unknown as Abi,
      functionName: "batchAllowCountries",
      args: [complianceAddress as `0x${string}`, Array.from(codes)],
    });

    if (receipt) {
      setSelectedCodes(new Set());
      onRefresh();
    }
  };

  const handleRemove = async (code: number) => {
    if (!isConnected) { openConnectModal?.(); return; }

    const receipt = await removeAction.execute({
      address: module.address as `0x${string}`,
      abi: COUNTRY_ALLOW_ABI as unknown as Abi,
      functionName: "removeAllowedCountry",
      args: [complianceAddress as `0x${string}`, code],
    });

    if (receipt) onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* Tx status */}
      {(batchAddAction.isPending || batchAddAction.isConfirming || batchAddAction.error) && (
        <TransactionStatus isPending={batchAddAction.isPending} isConfirming={batchAddAction.isConfirming}
          isConfirmed={batchAddAction.isConfirmed} txHash={batchAddAction.txHash} txUrl={batchAddAction.txUrl}
          error={batchAddAction.error} successMessage="Countries added." />
      )}
      {(removeAction.isPending || removeAction.isConfirming || removeAction.error) && (
        <TransactionStatus isPending={removeAction.isPending} isConfirming={removeAction.isConfirming}
          isConfirmed={removeAction.isConfirmed} txHash={removeAction.txHash} txUrl={removeAction.txUrl}
          error={removeAction.error} successMessage="Country removed." />
      )}

      {/* Current allowed */}
      <div>
        <h4 className="text-xs font-semibold text-zinc-500 mb-2">Allowed Countries ({allowed.length})</h4>
        {allowed.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {allowed.map((code) => (
              <span key={code} className="inline-flex items-center gap-1 rounded-md bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-medium text-green-700">
                {countryName(code)}
                <button onClick={() => handleRemove(code)} className="ml-0.5 hover:text-red-600" title="Remove">
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">No countries allowed — all transfers will be blocked.</p>
        )}
      </div>

      {/* Add countries — region-grouped multi-select */}
      <div>
        <h4 className="text-xs font-semibold text-zinc-500 mb-2">Add Countries</h4>
        <p className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5 mb-2">
          Country code 0 (System) is automatically included to allow smart contracts (sale, vault) to hold tokens.
        </p>
        <CountrySelector selected={selectedCodes} onChange={setSelectedCodes} alreadyAllowed={allowed} />
        {selectedCodes.size > 0 && (
          <Button variant="primary" size="sm" onClick={handleBatchAdd} className="mt-3"
            disabled={batchAddAction.isPending || batchAddAction.isConfirming}
            isLoading={batchAddAction.isPending || batchAddAction.isConfirming}>
            Add {selectedCodes.size} {selectedCodes.size === 1 ? "Country" : "Countries"} (1 transaction)
          </Button>
        )}
      </div>
    </div>
  );
}

function MaxHolderConfig({
  module, complianceAddress, onRefresh,
}: { module: ComplianceModule; complianceAddress: string; onRefresh: () => void }) {
  const [maxCount, setMaxCount] = useState(String(module.config.max_holder_count ?? ""));
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const setMaxAction = useContractAction();

  const handleSave = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    const count = parseInt(maxCount, 10);
    if (!count || count < 1) return;

    const receipt = await setMaxAction.execute({
      address: module.address as `0x${string}`,
      abi: MAX_HOLDER_ABI as unknown as Abi,
      functionName: "setMaxHolderCount",
      args: [complianceAddress as `0x${string}`, BigInt(count)],
    });

    if (receipt) onRefresh();
  };

  return (
    <div className="space-y-3">
      {(setMaxAction.isPending || setMaxAction.isConfirming || setMaxAction.error) && (
        <TransactionStatus isPending={setMaxAction.isPending} isConfirming={setMaxAction.isConfirming}
          isConfirmed={setMaxAction.isConfirmed} txHash={setMaxAction.txHash} txUrl={setMaxAction.txUrl}
          error={setMaxAction.error} successMessage="Max holder count updated." />
      )}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-zinc-500">Current Holders:</span>
        <span className="font-semibold">{module.config.current_holder_count ?? 0}</span>
        <span className="text-zinc-500">Max:</span>
        <span className="font-semibold">{module.config.max_holder_count || "Not set"}</span>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Set Max Holder Count</label>
          <Input type="number" min={1} value={maxCount} onChange={(e) => setMaxCount(e.target.value)} placeholder="e.g. 500" />
        </div>
        <Button variant="primary" size="sm" onClick={handleSave}
          disabled={setMaxAction.isPending || setMaxAction.isConfirming || !maxCount}
          isLoading={setMaxAction.isPending || setMaxAction.isConfirming}>
          Set Max
        </Button>
      </div>
    </div>
  );
}

const MODULE_ICONS: Record<string, React.ReactElement> = {
  CountryAllowModule: <Globe className="h-5 w-5 text-darkAqua" />,
  MaxHolderCountModule: <Users className="h-5 w-5 text-darkAqua" />,
  LockModule: <Lock className="h-5 w-5 text-darkAqua" />,
  WhitelistModule: <CheckSquare className="h-5 w-5 text-darkAqua" />,
  TransferRestrictModule: <ArrowLeftRight className="h-5 w-5 text-darkAqua" />,
  ConditionalTransferModule: <Link2 className="h-5 w-5 text-darkAqua" />,
  MaxBalanceModule: <Scale className="h-5 w-5 text-darkAqua" />,
  MaxOwnershipModule: <Lock className="h-5 w-5 text-darkAqua" />,
  TimeLockedTransferModule: <Clock className="h-5 w-5 text-darkAqua" />,
  TimeTransfersLimitModule: <Timer className="h-5 w-5 text-darkAqua" />,
};

function ModuleConfigPanel({
  module, complianceAddress, tokenDecimals, onRefresh,
}: { module: ComplianceModule; complianceAddress: string; tokenDecimals: number; onRefresh: () => void }) {
  switch (module.name) {
    case "CountryAllowModule":
      return <CountryAllowConfig module={module} complianceAddress={complianceAddress} onRefresh={onRefresh} />;
    case "MaxHolderCountModule":
      return <MaxHolderConfig module={module} complianceAddress={complianceAddress} onRefresh={onRefresh} />;
    case "LockModule":
      return <LockConfig module={module} complianceAddress={complianceAddress} onRefresh={onRefresh} />;
    case "WhitelistModule":
      return <WhitelistConfig module={module} complianceAddress={complianceAddress} onRefresh={onRefresh} />;
    case "TransferRestrictModule":
      return <TransferRestrictConfig module={module} complianceAddress={complianceAddress} onRefresh={onRefresh} />;
    case "ConditionalTransferModule":
      return <ConditionalTransferConfig module={module} complianceAddress={complianceAddress} onRefresh={onRefresh} />;
    case "MaxBalanceModule":
      return <MaxBalanceConfig module={module} complianceAddress={complianceAddress} tokenDecimals={tokenDecimals} onRefresh={onRefresh} />;
    case "MaxOwnershipModule":
      return <MaxOwnershipConfig module={module} complianceAddress={complianceAddress} tokenDecimals={tokenDecimals} onRefresh={onRefresh} />;
    case "TimeLockedTransferModule":
      return <TimeModuleConfig module={module} complianceAddress={complianceAddress}
        abiFragment={TIME_LOCKED_TRANSFER_MODULE_ABI as unknown as Abi}
        successMessage="Transfer lock time updated." onRefresh={onRefresh} />;
    case "TimeTransfersLimitModule":
      return <TimeModuleConfig module={module} complianceAddress={complianceAddress}
        abiFragment={TIME_TRANSFERS_LIMIT_MODULE_ABI as unknown as Abi}
        successMessage="Transfer limit time updated." onRefresh={onRefresh} />;
    default:
      return <p className="text-xs text-zinc-400">No configuration UI available for this module type.</p>;
  }
}

export function ModuleCard({
  module, tokenId: _tokenId, tokenDecimals = 18, complianceAddress, onRemove, onRefresh, removing,
}: {
  module: ComplianceModule; tokenId: string; tokenDecimals?: number; complianceAddress?: string;
  onRemove: (addr: string) => void; onRefresh: () => void; removing: boolean;
}) {
  const icon = MODULE_ICONS[module.name] ?? <Shield className="h-5 w-5 text-darkAqua" />;
  const compAddr = complianceAddress || "";

  return (
    <div className="bg-white rounded-lg border border-zinc-100 p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-darkAqua/10">{icon}</div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">{module.name}</h3>
            <p className="text-xs text-zinc-400 font-mono">{module.address.slice(0, 6)}...{module.address.slice(-4)}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onRemove(module.address)} disabled={removing}
          isLoading={removing} className="text-red-600 border-red-200 hover:bg-red-50">
          Remove
        </Button>
      </div>
      <div className="border-t border-zinc-100 pt-4">
        <ModuleConfigPanel module={module} complianceAddress={compAddr} tokenDecimals={tokenDecimals} onRefresh={onRefresh} />
      </div>
    </div>
  );
}
