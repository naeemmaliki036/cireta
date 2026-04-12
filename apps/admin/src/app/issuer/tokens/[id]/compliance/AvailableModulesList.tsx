"use client";

import { Shield, AlertTriangle } from "lucide-react";
import { Button } from "@/components/atoms";
import {
  ALL_COMPLIANCE_MODULES,
  type ComplianceModuleInfo,
} from "@/lib/contracts/complianceModules";

interface AvailableModulesListProps {
  attachedAddresses: Set<string>;
  isConnected: boolean;
  isAttaching: boolean;
  isRemoving: boolean;
  onAttach: (moduleAddress: string, moduleName: string) => void;
  onRemove: (moduleAddress: string) => void;
}

function ModuleRow({
  mod,
  isAttached,
  isDeployed,
  isAttaching,
  isRemoving,
  isConnected,
  onAttach,
  onRemove,
}: {
  mod: ComplianceModuleInfo;
  isAttached: boolean;
  isDeployed: boolean;
  isAttaching: boolean;
  isRemoving: boolean;
  isConnected: boolean;
  onAttach: (addr: string, name: string) => void;
  onRemove: (addr: string) => void;
}) {
  const Icon = mod.icon;

  return (
    <div
      className={`rounded-lg border-2 p-4 transition-all ${
        isAttached
          ? "border-green-300 bg-green-50/50"
          : isDeployed
            ? "border-zinc-200 bg-white"
            : "border-zinc-100 bg-zinc-50/50 opacity-60"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isAttached
              ? "bg-green-100 text-green-600"
              : isDeployed
                ? "bg-zinc-100 text-zinc-400"
                : "bg-zinc-50 text-zinc-300"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-sm font-semibold text-zinc-900">{mod.name}</p>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${mod.tagColor}`}
            >
              {mod.tag}
            </span>
            {isAttached && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-green-100 text-green-700">
                Active
              </span>
            )}
            {!isDeployed && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-200 text-zinc-500">
                Not Deployed
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500">{mod.description}</p>
          {!isDeployed && (
            <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Deploy this module on-chain before it can be attached.
            </p>
          )}
        </div>
        <div className="flex-shrink-0">
          {isAttached ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRemove(mod.address)}
              disabled={isRemoving}
              isLoading={isRemoving}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              Remove
            </Button>
          ) : isDeployed ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onAttach(mod.address, mod.name)}
              disabled={isAttaching}
              isLoading={isAttaching}
            >
              {!isConnected ? "Connect Wallet" : "Attach"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Unavailable
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AvailableModulesList({
  attachedAddresses,
  isConnected,
  isAttaching,
  isRemoving,
  onAttach,
  onRemove,
}: AvailableModulesListProps) {
  const deployed = ALL_COMPLIANCE_MODULES.filter((m) => !!m.address);
  const undeployed = ALL_COMPLIANCE_MODULES.filter((m) => !m.address);

  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-zinc-900 mb-1">
        Available Modules
      </h3>
      <p className="text-xs text-zinc-400 mb-4">
        Select which rules to enforce on every token transfer. Attach from your
        connected wallet.
      </p>

      {/* Deployed modules */}
      <div className="space-y-3 mb-6">
        {deployed.map((mod) => (
          <ModuleRow
            key={mod.id}
            mod={mod}
            isAttached={attachedAddresses.has(mod.address.toLowerCase())}
            isDeployed
            isAttaching={isAttaching}
            isRemoving={isRemoving}
            isConnected={isConnected}
            onAttach={onAttach}
            onRemove={onRemove}
          />
        ))}
      </div>

      {/* Undeployed modules section */}
      {undeployed.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3 mt-6">
            <Shield className="h-4 w-4 text-zinc-300" />
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Not Yet Deployed ({undeployed.length})
            </h4>
          </div>
          <div className="space-y-3">
            {undeployed.map((mod) => (
              <ModuleRow
                key={mod.id}
                mod={mod}
                isAttached={false}
                isDeployed={false}
                isAttaching={false}
                isRemoving={false}
                isConnected={isConnected}
                onAttach={onAttach}
                onRemove={onRemove}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
