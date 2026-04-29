"use client";

import React, { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/atoms";
import type { TokenFormData } from "@/lib/tokenFormSteps";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

async function validateIRContract(addr: string): Promise<boolean> {
  try {
    const { createPublicClient } = await import("viem");
    const { getChain, getTransport } = await import("@/lib/chain");
    const client = createPublicClient({ chain: getChain(), transport: getTransport() });
    const result = await client.readContract({
      address: addr as `0x${string}`,
      abi: [{
        name: "isVerified", type: "function", stateMutability: "view",
        inputs: [{ name: "userAddress", type: "address" }],
        outputs: [{ name: "", type: "bool" }],
      }],
      functionName: "isVerified",
      args: ["0x0000000000000000000000000000000000000000"],
    });
    return typeof result === "boolean";
  } catch {
    return false;
  }
}

export function StepIdentityRegistry({
  formData, setFormData,
}: { formData: TokenFormData; setFormData: (d: TokenFormData) => void }): React.ReactElement {
  const platformIR = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS ?? "";
  const [mode, setMode] = useState<"platform" | "custom">(
    !formData.identityRegistry || formData.identityRegistry === platformIR ? "platform" : "custom",
  );
  const [customAddr, setCustomAddr] = useState(
    formData.identityRegistry && formData.identityRegistry !== platformIR
      ? formData.identityRegistry : "",
  );
  const [validating, setValidating] = useState(false);
  const [irValid, setIrValid] = useState<boolean | null>(null);

  const handleValidate = async (addr: string): Promise<void> => {
    if (!ADDRESS_RE.test(addr)) { setIrValid(null); return; }
    setValidating(true);
    const ok = await validateIRContract(addr);
    setIrValid(ok);
    setValidating(false);
  };

  const handleModeChange = (m: "platform" | "custom"): void => {
    setMode(m);
    if (m === "platform") {
      setFormData({ ...formData, identityRegistry: platformIR });
      setIrValid(null);
      setCustomAddr("");
    } else {
      setFormData({ ...formData, identityRegistry: "" });
    }
  };

  const handleCustomChange = (addr: string): void => {
    setCustomAddr(addr);
    const trimmed = addr.trim();
    setFormData({ ...formData, identityRegistry: ADDRESS_RE.test(trimmed) ? trimmed : "" });
    setIrValid(null);
    if (ADDRESS_RE.test(trimmed)) handleValidate(trimmed);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-text mb-2">Identity Registry</h2>
      <p className="text-sm text-zinc-500 mb-6">
        The identity registry controls which wallets are allowed to hold this token.
        We recommend the Cireta platform registry for most tokens.
      </p>

      <div className="space-y-3 mb-6">
        <button type="button" onClick={() => handleModeChange("platform")}
          className={`w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all ${
            mode === "platform" ? "border-darkAqua bg-darkAqua/5" : "border-zinc-200 hover:border-zinc-300"
          }`}>
          <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${
            mode === "platform" ? "border-darkAqua bg-darkAqua" : "border-zinc-300"
          }`} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-text">Cireta Platform Identity Registry</p>
            <p className="text-xs text-zinc-500 mt-0.5">All KYC-verified users share this registry. Recommended.</p>
            {platformIR && (
              <p className="font-mono text-[11px] text-zinc-400 mt-1 break-all">{platformIR}</p>
            )}
            {!platformIR && (
              <p className="text-[11px] text-amber-600 mt-1">NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS not set</p>
            )}
          </div>
        </button>

        <button type="button" onClick={() => handleModeChange("custom")}
          className={`w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all ${
            mode === "custom" ? "border-darkAqua bg-darkAqua/5" : "border-zinc-200 hover:border-zinc-300"
          }`}>
          <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${
            mode === "custom" ? "border-darkAqua bg-darkAqua" : "border-zinc-300"
          }`} />
          <div>
            <p className="font-semibold text-sm text-text">Custom address...</p>
            <p className="text-xs text-zinc-500 mt-0.5">Deploy with a different SimpleIdentityRegistry.</p>
          </div>
        </button>
      </div>

      {mode === "custom" && (
        <div className="space-y-2">
          <Input
            label="Identity Registry Address"
            placeholder="0x..."
            value={customAddr}
            onChange={(e) => handleCustomChange(e.target.value)}
            error={
              customAddr && !ADDRESS_RE.test(customAddr.trim())
                ? "Not a valid EVM address"
                : irValid === false
                ? "This address doesn't look like a SimpleIdentityRegistry. isVerified() call failed."
                : undefined
            }
          />
          {validating && (
            <p className="text-xs text-zinc-400 flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 border border-zinc-300 border-t-darkAqua rounded-full animate-spin" />
              Validating contract...
            </p>
          )}
          {irValid === true && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Contract responds to isVerified() — looks like a valid registry.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
