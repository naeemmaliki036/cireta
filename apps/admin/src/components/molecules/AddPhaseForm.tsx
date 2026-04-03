"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { parseUnits, type Abi } from "viem";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";

interface AddPhaseFormProps {
  contractAddress: string;
  tokenDecimals?: number;
  onSuccess?: () => void;
}

interface PhaseFormData {
  name: string;
  pricePerToken: string;
  allocation: string;
  minContribution: string;
  maxContribution: string;
  startTime: string;
  endTime: string;
  whitelistOnly: boolean;
}

const INITIAL_FORM: PhaseFormData = {
  name: "",
  pricePerToken: "",
  allocation: "",
  minContribution: "",
  maxContribution: "",
  startTime: "",
  endTime: "",
  whitelistOnly: false,
};

/**
 * Form to add a new phase to an on-chain Sale contract.
 * pricePerToken: 18 decimals, allocation: token decimals, min/maxContribution: 6 decimals (USDC).
 */
export function AddPhaseForm({
  contractAddress,
  tokenDecimals = 18,
  onSuccess,
}: AddPhaseFormProps) {
  const [form, setForm] = useState<PhaseFormData>(INITIAL_FORM);
  const [validationError, setValidationError] = useState<string | null>(null);
  const addPhaseAction = useContractAction();

  const updateField = <K extends keyof PhaseFormData>(key: K, value: PhaseFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setValidationError(null);
  };

  const handleSubmit = async () => {
    setValidationError(null);

    // Validation
    if (!form.name.trim()) {
      setValidationError("Phase name is required.");
      return;
    }
    if (!form.pricePerToken || parseFloat(form.pricePerToken) <= 0) {
      setValidationError("Price per token must be greater than 0.");
      return;
    }
    if (!form.allocation || parseFloat(form.allocation) <= 0) {
      setValidationError("Allocation must be greater than 0.");
      return;
    }
    if (!form.startTime || !form.endTime) {
      setValidationError("Start and end times are required.");
      return;
    }

    const startTimestamp = BigInt(Math.floor(new Date(form.startTime).getTime() / 1000));
    const endTimestamp = BigInt(Math.floor(new Date(form.endTime).getTime() / 1000));

    if (endTimestamp <= startTimestamp) {
      setValidationError("End time must be after start time.");
      return;
    }

    try {
      const pricePerToken = parseUnits(form.pricePerToken, 18);
      const allocation = parseUnits(form.allocation, tokenDecimals);
      const minContribution = form.minContribution
        ? parseUnits(form.minContribution, 6)
        : BigInt(0);
      const maxContribution = form.maxContribution
        ? parseUnits(form.maxContribution, 6)
        : BigInt(0);

      const receipt = await addPhaseAction.execute({
        address: contractAddress as `0x${string}`,
        abi: SALE_ABI as unknown as Abi,
        functionName: "addPhase",
        args: [
          form.name,
          pricePerToken,
          allocation,
          minContribution,
          maxContribution,
          startTimestamp,
          endTimestamp,
          form.whitelistOnly,
        ],
      });

      if (receipt) {
        setForm(INITIAL_FORM);
        addPhaseAction.reset();
        onSuccess?.();
      }
    } catch {
      setValidationError("Failed to parse numeric values. Check your inputs.");
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-box border border-darkBlack/5">
      <h3 className="font-medium text-text mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4" /> Add New Phase
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Phase Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
            placeholder="e.g. Seed Round"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Price per Token <span className="text-zinc-400">(USD, 18 dec)</span>
          </label>
          <input
            type="text"
            value={form.pricePerToken}
            onChange={(e) => updateField("pricePerToken", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
            placeholder="0.50"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Allocation <span className="text-zinc-400">(tokens)</span>
          </label>
          <input
            type="text"
            value={form.allocation}
            onChange={(e) => updateField("allocation", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
            placeholder="1000000"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Min Contribution <span className="text-zinc-400">(USDC)</span>
          </label>
          <input
            type="text"
            value={form.minContribution}
            onChange={(e) => updateField("minContribution", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
            placeholder="100"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Max Contribution <span className="text-zinc-400">(USDC)</span>
          </label>
          <input
            type="text"
            value={form.maxContribution}
            onChange={(e) => updateField("maxContribution", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
            placeholder="50000"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Start Time</label>
          <input
            type="datetime-local"
            value={form.startTime}
            onChange={(e) => updateField("startTime", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">End Time</label>
          <input
            type="datetime-local"
            value={form.endTime}
            onChange={(e) => updateField("endTime", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            id="whitelistOnly"
            checked={form.whitelistOnly}
            onChange={(e) => updateField("whitelistOnly", e.target.checked)}
            className="rounded border-zinc-300 text-darkAqua focus:ring-darkAqua/30"
          />
          <label htmlFor="whitelistOnly" className="text-sm text-zinc-600">
            Whitelist Only
          </label>
        </div>
      </div>

      {validationError && (
        <p className="text-sm text-red-600 mb-3">{validationError}</p>
      )}

      <Button
        variant="primary"
        size="sm"
        onClick={handleSubmit}
        disabled={addPhaseAction.isPending || addPhaseAction.isConfirming}
        isLoading={addPhaseAction.isPending || addPhaseAction.isConfirming}
        leftIcon={<Plus className="h-4 w-4" />}
      >
        Add Phase On-Chain
      </Button>

      <TransactionStatus
        isPending={addPhaseAction.isPending}
        isConfirming={addPhaseAction.isConfirming}
        isConfirmed={addPhaseAction.isConfirmed}
        txHash={addPhaseAction.txHash}
        txUrl={addPhaseAction.txUrl}
        error={addPhaseAction.error}
        successMessage="Phase added on-chain successfully."
      />
    </div>
  );
}
