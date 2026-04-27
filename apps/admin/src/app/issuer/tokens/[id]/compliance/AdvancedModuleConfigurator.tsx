"use client";

import { useState } from "react";
import { type Abi, isAddress, isHex } from "viem";
import { Settings2 } from "lucide-react";
import { Button, Input } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { MODULAR_COMPLIANCE_ABI } from "@/lib/contracts/abis/modularCompliance";

interface Props {
  complianceAddress: string;
  attachedModules: { address: string; name: string }[];
}

/**
 * Generic configurator for ModularCompliance.callModuleFunction.
 * Lets advanced users invoke any module function via raw ABI-encoded callData
 * without waiting for first-class UI. Use cases: rare modules, new module
 * variants, debugging, one-off compliance updates.
 */
export function AdvancedModuleConfigurator({ complianceAddress, attachedModules }: Props) {
  const [selectedModule, setSelectedModule] = useState("");
  const [callData, setCallData] = useState("");
  const action = useContractAction();
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = async () => {
    setValidationError(null);
    if (!isAddress(selectedModule)) {
      setValidationError("Pick a valid attached module from the dropdown.");
      return;
    }
    if (!callData || !isHex(callData)) {
      setValidationError("Calldata must be 0x-prefixed hex (ABI-encoded function call to the module).");
      return;
    }
    await action.execute({
      address: complianceAddress as `0x${string}`,
      abi: MODULAR_COMPLIANCE_ABI as unknown as Abi,
      functionName: "callModuleFunction",
      args: [callData as `0x${string}`, selectedModule as `0x${string}`],
    });
  };

  return (
    <div className="bg-white rounded-lg border border-zinc-100 p-5 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Settings2 className="h-4 w-4 text-zinc-500" />
        <h3 className="text-sm font-semibold text-zinc-900">Advanced — Generic Module Configurator</h3>
      </div>
      <p className="text-xs text-zinc-400 mb-4">
        Call any function on an attached compliance module via ABI-encoded calldata.
        Use only when a module exposes options not surfaced by the standard editor above.
        The selector must be on ModularCompliance&apos;s allowed list (default: most read/write helpers).
      </p>

      <div className="space-y-3 max-w-xl">
        <div>
          <label className="block text-xs text-zinc-600 mb-1">Module</label>
          <select
            value={selectedModule}
            onChange={(e) => { setSelectedModule(e.target.value); setValidationError(null); }}
            className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
          >
            <option value="">Select an attached module&hellip;</option>
            {attachedModules.map((m) => (
              <option key={m.address} value={m.address}>
                {m.name} — {m.address.slice(0, 6)}&hellip;{m.address.slice(-4)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Input
            label="ABI-encoded calldata (0x...)"
            value={callData}
            onChange={(e) => { setCallData(e.target.value); setValidationError(null); }}
            placeholder="0x..."
            helperText="Use viem.encodeFunctionData or ethers.Interface.encodeFunctionData to produce."
          />
        </div>

        {validationError && <p className="text-xs text-red-600">{validationError}</p>}

        <Button
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={action.isPending || action.isConfirming || !selectedModule || !callData}
          isLoading={action.isPending || action.isConfirming}
        >
          Execute callModuleFunction
        </Button>

        <TransactionStatus
          isPending={action.isPending}
          isConfirming={action.isConfirming}
          isConfirmed={action.isConfirmed}
          txHash={action.txHash}
          txUrl={action.txUrl}
          error={action.error}
          successMessage="Module function executed."
        />
      </div>
    </div>
  );
}
