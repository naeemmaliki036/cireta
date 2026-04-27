"use client";

import { useState } from "react";
import { isAddress, type Abi } from "viem";
import { Users, Plus, Minus } from "lucide-react";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";

interface Props {
  contractAddress: string | null;
  phaseIndex: number;
  phaseName: string;
  whitelistOnly: boolean;
  isDeployed: boolean;
  phaseStatus: "active" | "upcoming" | "ended";
}

/**
 * Add or remove wallet addresses from a phase whitelist.
 * Only meaningful for whitelist-only phases that are deployed and not yet ended.
 * Calls Sale.setWhitelist(phaseId, addresses[], allow).
 */
export function PhaseWhitelistManager({
  contractAddress,
  phaseIndex,
  phaseName,
  whitelistOnly,
  isDeployed,
  phaseStatus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState("");
  const [allow, setAllow] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const action = useContractAction();

  if (!whitelistOnly || !isDeployed || phaseStatus === "ended") return null;

  const parseAddresses = (): `0x${string}`[] => {
    return addresses
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean) as `0x${string}`[];
  };

  const submit = async () => {
    setValidationError(null);
    if (!contractAddress) return;
    const addrs = parseAddresses();
    if (addrs.length === 0) {
      setValidationError("Enter at least one wallet address.");
      return;
    }
    const invalid = addrs.find((a) => !isAddress(a));
    if (invalid) {
      setValidationError(`Invalid address: ${invalid}`);
      return;
    }
    const receipt = await action.execute({
      address: contractAddress as `0x${string}`,
      abi: SALE_ABI as unknown as Abi,
      functionName: "setWhitelist",
      args: [BigInt(phaseIndex), addrs, allow],
    });
    if (receipt) {
      setAddresses("");
    }
  };

  return (
    <div className="mt-2">
      {!open ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Users className="w-3 h-3 mr-1" /> Manage whitelist
        </Button>
      ) : (
        <div className="bg-white border border-black/10 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-text">
            {phaseName} — whitelist
          </p>
          <p className="text-xs text-black/40">
            Comma- or newline-separated wallet addresses. Toggle to add or remove from the whitelist.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant={allow ? "primary" : "outline"}
              size="sm"
              onClick={() => setAllow(true)}
            >
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
            <Button
              variant={!allow ? "primary" : "outline"}
              size="sm"
              onClick={() => setAllow(false)}
            >
              <Minus className="w-3 h-3 mr-1" /> Remove
            </Button>
          </div>
          <textarea
            value={addresses}
            onChange={(e) => { setAddresses(e.target.value); setValidationError(null); }}
            placeholder="0xabc..., 0xdef..., 0x123..."
            rows={4}
            className="w-full bg-zinc-50 border border-black/10 rounded px-3 py-2 text-sm font-mono"
          />
          {validationError && <p className="text-xs text-red-600">{validationError}</p>}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={action.isPending || action.isConfirming || !addresses}
              isLoading={action.isPending || action.isConfirming}
            >
              {allow ? "Add to whitelist" : "Remove from whitelist"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Close</Button>
          </div>
          <TransactionStatus
            isPending={action.isPending}
            isConfirming={action.isConfirming}
            isConfirmed={action.isConfirmed}
            txHash={action.txHash}
            txUrl={action.txUrl}
            error={action.error}
            successMessage={`Whitelist updated for ${phaseName}.`}
          />
        </div>
      )}
    </div>
  );
}
