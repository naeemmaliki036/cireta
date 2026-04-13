"use client";

import { useState } from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { parseUnits, type Abi } from "viem";
import { Button } from "@/components/atoms";
import { TransactionStatus } from "@/components/molecules/TransactionStatus";
import { useContractAction } from "@/hooks/useContractAction";
import { SALE_ABI } from "@/lib/contracts/abis/sale";

interface ExistingPhase {
  name: string;
  price_per_token: string;
}

interface AddPhaseFormProps {
  contractAddress: string;
  saleId?: string;
  tokenDecimals?: number;
  /** Total token supply available (deposited - already allocated across existing phases) */
  availableSupply?: number;
  /** Existing phases (used to warn when new price is lower than a previous phase) */
  existingPhases?: ExistingPhase[];
  onSuccess?: () => void;
}

interface PhaseFormData {
  name: string;
  pricePerToken: string;
  allocation: string;
  minContribution: string;
  maxContribution: string;
  topUpMin: string;          // Round-5
  startTime: string;
  endTime: string;
  whitelistOnly: boolean;
  allocationMode: "fixed" | "remaining"; // Round-5
}

const INITIAL_FORM: PhaseFormData = {
  name: "",
  pricePerToken: "",
  allocation: "",
  minContribution: "",
  maxContribution: "",
  topUpMin: "1000",          // Round-5: contract floor
  startTime: "",
  endTime: "",
  whitelistOnly: false,
  allocationMode: "fixed",
};

/** Only allow numeric + decimal point */
function numericOnly(value: string): string {
  return value.replace(/[^0-9.]/g, "").replace(/(\..*?)\..*/g, "$1");
}

/**
 * Form to add a new phase to an on-chain Sale contract.
 * pricePerToken: 18 decimals, allocation: token decimals, min/maxContribution: 6 decimals (USDC).
 */
export function AddPhaseForm({
  contractAddress,
  saleId,
  tokenDecimals = 18,
  availableSupply,
  existingPhases,
  onSuccess,
}: AddPhaseFormProps) {
  const [form, setForm] = useState<PhaseFormData>(INITIAL_FORM);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const addPhaseAction = useContractAction();

  const updateField = <K extends keyof PhaseFormData>(key: K, value: PhaseFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setValidationError(null);
  };

  const updateNumeric = (key: keyof PhaseFormData, value: string) => {
    updateField(key, numericOnly(value));
  };

  const allocationNum = parseFloat(form.allocation) || 0;
  const allocationExceedsSupply = availableSupply !== undefined && availableSupply > 0 && allocationNum > availableSupply;

  // Price warning: check if new price is lower than any existing phase
  const newPrice = parseFloat(form.pricePerToken) || 0;
  const higherPhase = newPrice > 0 && existingPhases?.length
    ? existingPhases.find((p) => parseFloat(p.price_per_token) > newPrice)
    : undefined;

  const handleSubmit = async () => {
    setValidationError(null);

    if (!form.name.trim()) {
      setValidationError("Phase name is required.");
      return;
    }
    if (!form.pricePerToken || parseFloat(form.pricePerToken) <= 0) {
      setValidationError("Price per token must be greater than 0.");
      return;
    }
    // Round-5: Fixed mode requires allocation > 0; Remaining mode allows 0.
    if (form.allocationMode === "fixed" && (!form.allocation || parseFloat(form.allocation) <= 0)) {
      setValidationError("Fixed allocation mode requires allocation > 0.");
      return;
    }
    if (allocationExceedsSupply) {
      setValidationError(`Allocation cannot exceed available supply (${availableSupply!.toLocaleString()} tokens).`);
      return;
    }
    // Round-5: top-up minimum hard floor of 1000 USDC
    const topUpMinNum = parseFloat(form.topUpMin) || 0;
    if (topUpMinNum < 1000) {
      setValidationError("Top-up minimum must be at least 1000 USDC (contract floor).");
      return;
    }
    // Min contribution is required > 0 — mirrors Sale.addPhase ZeroMinContribution()
    // revert. Issuers who want a low floor should set $1.
    if (!form.minContribution || parseFloat(form.minContribution) <= 0) {
      setValidationError("Min contribution is required and must be greater than 0. Use $1 for a low floor.");
      return;
    }
    if (form.maxContribution && parseFloat(form.minContribution) > parseFloat(form.maxContribution)) {
      setValidationError("Min contribution cannot exceed max contribution.");
      return;
    }
    if (!form.startTime || !form.endTime) {
      setValidationError("Start and end times are required.");
      return;
    }

    const startTimestamp = BigInt(Math.floor(new Date(form.startTime).getTime() / 1000));
    const endTimestamp = BigInt(Math.floor(new Date(form.endTime).getTime() / 1000));
    const nowTs = BigInt(Math.floor(Date.now() / 1000));

    if (endTimestamp <= startTimestamp) {
      setValidationError("End time must be after start time.");
      return;
    }
    if (endTimestamp <= nowTs) {
      setValidationError("Phase end time must be in the future.");
      return;
    }

    try {
      const pricePerToken = parseUnits(form.pricePerToken, 18);
      const allocation = form.allocationMode === "fixed"
        ? parseUnits(form.allocation || "0", tokenDecimals)
        : BigInt(0);
      const minContribution = parseUnits(form.minContribution, 6);
      const maxContribution = form.maxContribution
        ? parseUnits(form.maxContribution, 6)
        : BigInt(0);
      const topUpMin = parseUnits(form.topUpMin, 6);
      // AllocationMode enum: 0 = Fixed, 1 = Remaining
      const allocationModeEnum = form.allocationMode === "fixed" ? 0 : 1;

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
          topUpMin,
          startTimestamp,
          endTimestamp,
          form.whitelistOnly,
          allocationModeEnum,
        ],
      });

      if (receipt) {
        // Sync phase to DB
        if (saleId) {
          try {
            await fetch(`/api/proxy/api/v1/sales/${saleId}/phases`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                name: form.name,
                price_per_token: form.pricePerToken,
                allocation: form.allocation || "0",
                min_contribution: form.minContribution || "0",
                max_contribution: form.maxContribution || "0",
                top_up_min: form.topUpMin,
                start_time: new Date(form.startTime).toISOString(),
                end_time: new Date(form.endTime).toISOString(),
                whitelist_only: form.whitelistOnly,
                allocation_mode: form.allocationMode,
              }),
            });
          } catch { /* on-chain is source of truth */ }
        }
        setForm(INITIAL_FORM);
        setExpanded(false);
        addPhaseAction.reset();
        onSuccess?.();
      }
    } catch {
      setValidationError("Failed to parse numeric values. Check your inputs.");
    }
  };

  return (
    <div className="rounded-lg bg-box border border-black/5">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left">
        <h3 className="font-medium text-text flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add New Phase
        </h3>
        {expanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
      </button>

      {!expanded ? null : <div className="px-4 pb-4">

      {availableSupply !== undefined && availableSupply > 0 && (
        <p className="text-xs text-black/40 mb-3">
          Available supply: <span className="font-semibold text-text">{availableSupply.toLocaleString()}</span> tokens
        </p>
      )}

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
            Price per Token <span className="text-zinc-400">(USD)</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={form.pricePerToken}
            onChange={(e) => updateNumeric("pricePerToken", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
            placeholder="0.50"
          />
          {higherPhase && (
            <p className="text-xs text-amber-600 mt-1">
              This phase price (${newPrice}) is lower than a previous phase (${parseFloat(higherPhase.price_per_token)}) &mdash; {higherPhase.name}. Earlier buyers paid more per token.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Allocation <span className="text-zinc-400">(tokens)</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={form.allocation}
            onChange={(e) => updateNumeric("allocation", e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua ${
              allocationExceedsSupply ? "border-red-300 bg-red-50/30" : "border-zinc-200"
            }`}
            placeholder="1000000"
          />
          {allocationExceedsSupply && (
            <p className="text-xs text-red-500 mt-1">Exceeds available supply ({availableSupply!.toLocaleString()})</p>
          )}
          {allocationNum > 0 && !allocationExceedsSupply && (
            <p className="text-xs text-black/30 mt-1">{allocationNum.toLocaleString()} tokens</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Min Contribution <span className="text-red-500">*</span>{" "}
            <span className="text-zinc-400">(USDC, must be &gt; 0)</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={form.minContribution}
            onChange={(e) => updateNumeric("minContribution", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
            placeholder="100"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Max Contribution <span className="text-zinc-400">(USDC)</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={form.maxContribution}
            onChange={(e) => updateNumeric("maxContribution", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
            placeholder="50000 (0 = unlimited)"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Top-up Minimum <span className="text-red-500">*</span>{" "}
            <span className="text-zinc-400">(USDC, ≥ 1000)</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={form.topUpMin}
            onChange={(e) => updateNumeric("topUpMin", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-darkAqua/30 focus:border-darkAqua"
            placeholder="1000"
            required
          />
          <p className="text-xs text-zinc-400 mt-1">
            Minimum amount for repeat buyers in this phase. Contract floor is 1000 USDC.
          </p>
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-zinc-500 mb-1">
            Allocation Mode <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="allocationMode"
                checked={form.allocationMode === "fixed"}
                onChange={() => updateField("allocationMode", "fixed")}
                className="text-darkAqua focus:ring-darkAqua/30"
              />
              <span>
                <strong>Fixed</strong>
                <span className="text-zinc-400"> — phase has its own token cap</span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="allocationMode"
                checked={form.allocationMode === "remaining"}
                onChange={() => updateField("allocationMode", "remaining")}
                className="text-darkAqua focus:ring-darkAqua/30"
              />
              <span>
                <strong>Remaining</strong>
                <span className="text-zinc-400"> — phase sells unsold supply from prior phases</span>
              </span>
            </label>
          </div>
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
        disabled={addPhaseAction.isPending || addPhaseAction.isConfirming || allocationExceedsSupply}
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
      </div>}
    </div>
  );
}
