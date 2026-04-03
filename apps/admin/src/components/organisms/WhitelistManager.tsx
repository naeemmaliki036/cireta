"use client";

import { useState } from "react";
import { Users, Plus, Minus } from "lucide-react";
import { isAddress } from "viem";
import type { Abi } from "viem";
import { Button, Textarea } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";
import type { SalePhase } from "@/lib/api/repositories/sales";

interface WhitelistManagerProps {
  saleContractAddress: `0x${string}`;
  phases: SalePhase[];
}

/**
 * Per-phase whitelist management for sale contracts.
 * Allows adding/removing wallet addresses from whitelisted phases.
 */
export function WhitelistManager({
  saleContractAddress,
  phases,
}: WhitelistManagerProps) {
  const whitelistedPhases = phases.filter((p) => p.whitelist_only);
  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(0);
  const [addressInput, setAddressInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const addAction = useContractAction();
  const removeAction = useContractAction();

  if (whitelistedPhases.length === 0) return null;

  const selectedPhase = whitelistedPhases[selectedPhaseIdx];
  if (!selectedPhase) return null;

  const parseAddresses = (): `0x${string}`[] | null => {
    setParseError(null);
    const raw = addressInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (raw.length === 0) {
      setParseError("Enter at least one wallet address.");
      return null;
    }

    const invalid = raw.filter((a) => !isAddress(a));
    if (invalid.length > 0) {
      setParseError(`Invalid address(es): ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "..." : ""}`);
      return null;
    }

    return raw as `0x${string}`[];
  };

  const handleAdd = async () => {
    const addresses = parseAddresses();
    if (!addresses) return;
    addAction.reset();
    await addAction.execute({
      address: saleContractAddress,
      abi: SALE_ABI as unknown as Abi,
      functionName: "setWhitelist",
      args: [BigInt(selectedPhase.phase_number), addresses, true],
    });
  };

  const handleRemove = async () => {
    const addresses = parseAddresses();
    if (!addresses) return;
    removeAction.reset();
    await removeAction.execute({
      address: saleContractAddress,
      abi: SALE_ABI as unknown as Abi,
      functionName: "setWhitelist",
      args: [BigInt(selectedPhase.phase_number), addresses, false],
    });
  };

  const isBusy =
    addAction.isPending || addAction.isConfirming ||
    removeAction.isPending || removeAction.isConfirming;

  return (
    <div className="bg-white rounded-3xl p-6 border border-darkBlack/10">
      <h2 className="text-lg font-semibold text-text flex items-center gap-2 mb-4">
        <Users className="h-5 w-5" /> Phase Whitelist Management
      </h2>

      {/* Phase selector */}
      {whitelistedPhases.length > 1 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-600 mb-1">
            Select Phase
          </label>
          <select
            value={selectedPhaseIdx}
            onChange={(e) => setSelectedPhaseIdx(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
          >
            {whitelistedPhases.map((phase, idx) => (
              <option key={phase.id} value={idx}>
                Phase {phase.phase_number}: {phase.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {whitelistedPhases.length === 1 && (
        <p className="text-sm text-zinc-500 mb-3">
          Phase {selectedPhase.phase_number}: <span className="font-medium text-text">{selectedPhase.name}</span>
        </p>
      )}

      <Textarea
        label="Wallet Addresses"
        helperText="Enter addresses separated by commas or one per line"
        placeholder={"0xAbc123...DEF\n0x789ghi...JKL"}
        value={addressInput}
        onChange={(e) => { setAddressInput(e.target.value); setParseError(null); }}
        rows={4}
        error={parseError ?? undefined}
      />

      <div className="flex items-center gap-3 mt-4">
        <Button
          variant="primary"
          onClick={handleAdd}
          disabled={isBusy || !addressInput.trim()}
          isLoading={addAction.isPending || addAction.isConfirming}
        >
          <Plus className="h-4 w-4 mr-1" /> Add to Whitelist
        </Button>
        <Button
          variant="outline"
          onClick={handleRemove}
          disabled={isBusy || !addressInput.trim()}
          isLoading={removeAction.isPending || removeAction.isConfirming}
        >
          <Minus className="h-4 w-4 mr-1" /> Remove from Whitelist
        </Button>
      </div>

      <TransactionStatus
        isPending={addAction.isPending}
        isConfirming={addAction.isConfirming}
        isConfirmed={addAction.isConfirmed}
        txHash={addAction.txHash}
        txUrl={addAction.txUrl}
        error={addAction.error}
        successMessage="Addresses added to whitelist"
      />
      <TransactionStatus
        isPending={removeAction.isPending}
        isConfirming={removeAction.isConfirming}
        isConfirmed={removeAction.isConfirmed}
        txHash={removeAction.txHash}
        txUrl={removeAction.txUrl}
        error={removeAction.error}
        successMessage="Addresses removed from whitelist"
      />
    </div>
  );
}
