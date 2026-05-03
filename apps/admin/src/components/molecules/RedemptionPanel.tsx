"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { RefreshCw } from "lucide-react";
import { Button, Input, Textarea } from "@/components/atoms";
import { updateTokenRedemption, type RedemptionType, type Token } from "@/lib/api/repositories/tokens";

interface RedemptionPanelProps {
  token: Token;
  onUpdated: (updated: Token) => void;
}

const RADIO_OPTIONS: { value: RedemptionType; label: string }[] = [
  { value: "none", label: "Not redeemable" },
  { value: "manual_off_chain", label: "Manual / off-platform" },
  { value: "on_chain", label: "On-chain via RedemptionManager" },
];

export function RedemptionPanel({ token, onUpdated }: RedemptionPanelProps) {
  const [type, setType] = useState<RedemptionType>(token.redemption_type ?? "none");
  const [url, setUrl] = useState(token.redemption_url ?? "");
  const [description, setDescription] = useState(token.redemption_description ?? "");
  const [managerAddress, setManagerAddress] = useState(token.redemption_manager_address ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const addressInvalid =
    type === "on_chain" && managerAddress !== "" && !isAddress(managerAddress);

  const handleSave = async (): Promise<void> => {
    setError(null);
    setSuccess(false);
    if (addressInvalid) {
      setError("Provide a valid 0x-prefixed 42-character address.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateTokenRedemption(token.id, {
        redemption_type: type,
        redemption_url: type === "manual_off_chain" ? (url || null) : null,
        redemption_description:
          type !== "none" ? (description || null) : null,
        redemption_manager_address:
          type === "on_chain" ? (managerAddress || null) : null,
      });
      onUpdated(updated);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-zinc-100 overflow-hidden mt-6">
      <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50 flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-darkAqua" />
        <h2 className="text-sm font-semibold text-zinc-900">Redemption</h2>
        <span className="text-xs text-zinc-400 ml-1">
          — off-chain metadata, no on-chain transaction required
        </span>
      </div>
      <div className="px-5 py-4 space-y-3">
        {/* Radio group */}
        {RADIO_OPTIONS.map((opt) => {
          const selected = type === opt.value;
          return (
            <div
              key={opt.value}
              className={`rounded-lg border-2 transition-all overflow-hidden ${
                selected
                  ? "border-darkAqua bg-darkAqua/5"
                  : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <button
                type="button"
                onClick={() => { setType(opt.value); setError(null); setSuccess(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                    selected ? "border-darkAqua bg-darkAqua" : "border-zinc-300"
                  }`}
                />
                <span className="text-sm font-medium text-zinc-800">{opt.label}</span>
              </button>

              {selected && opt.value === "manual_off_chain" && (
                <div className="px-4 pb-4 ml-7 border-t border-zinc-100 pt-3 space-y-3">
                  <Input
                    label="Redemption URL (optional)"
                    placeholder="https://..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <Textarea
                    label="Instructions (optional)"
                    placeholder="Describe how holders redeem off-platform..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              )}

              {selected && opt.value === "on_chain" && (
                <div className="px-4 pb-4 ml-7 border-t border-zinc-100 pt-3 space-y-3">
                  <Input
                    label="RedemptionManager Address"
                    placeholder="0x..."
                    value={managerAddress}
                    onChange={(e) => { setManagerAddress(e.target.value.trim()); setError(null); }}
                    error={addressInvalid ? "Must be a valid 0x-prefixed 42-character address" : undefined}
                  />
                  <Textarea
                    label="Description (optional)"
                    placeholder="Describe the on-chain redemption process..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              )}
            </div>
          );
        })}

        {error && (
          <p className="text-xs text-red-600 px-1">{error}</p>
        )}
        {success && (
          <p className="text-xs text-green-600 px-1">Redemption settings saved.</p>
        )}

        <div className="pt-1">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={saving}
            disabled={saving || addressInvalid}
          >
            Save Redemption Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
