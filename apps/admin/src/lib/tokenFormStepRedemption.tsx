"use client";

import React from "react";
import { Input, Textarea } from "@/components/atoms";
import type { RedemptionType } from "@/lib/api/repositories/tokens";

export interface RedemptionFormData {
  redemptionType: RedemptionType;
  redemptionUrl: string;
  redemptionDescription: string;
  redemptionManagerAddress: string;
}

export const DEFAULT_REDEMPTION: RedemptionFormData = {
  redemptionType: "none",
  redemptionUrl: "",
  redemptionDescription: "",
  redemptionManagerAddress: "",
};

const RADIO_OPTIONS: { value: RedemptionType; label: string; hint: string }[] = [
  {
    value: "none",
    label: "Not redeemable",
    hint: "Tokens cannot be redeemed for the underlying asset.",
  },
  {
    value: "manual_off_chain",
    label: "Manual / off-platform",
    hint: "Holders contact the issuer directly to redeem. Optionally provide a URL and instructions.",
  },
  {
    value: "on_chain",
    label: "On-chain via RedemptionManager",
    hint: "Redemptions are processed automatically via a smart contract.",
  },
];

export function StepRedemption({
  data,
  onChange,
}: {
  data: RedemptionFormData;
  onChange: (d: RedemptionFormData) => void;
}): React.ReactElement {
  const set = (partial: Partial<RedemptionFormData>): void =>
    onChange({ ...data, ...partial });

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-text mb-1">Redemption</h2>
      <p className="text-sm text-zinc-500 mb-6">
        Defines how holders convert tokens back to the underlying commodity.
        Buyers will see this on every sale of this token.
      </p>

      <div className="space-y-3">
        {RADIO_OPTIONS.map((opt) => {
          const selected = data.redemptionType === opt.value;
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
                onClick={() => set({ redemptionType: opt.value })}
                className="w-full flex items-start gap-3 p-4 text-left"
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                    selected
                      ? "border-darkAqua bg-darkAqua"
                      : "border-zinc-300"
                  }`}
                />
                <div>
                  <p className="font-semibold text-sm text-text">{opt.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{opt.hint}</p>
                </div>
              </button>

              {selected && opt.value === "manual_off_chain" && (
                <div className="px-4 pb-4 ml-7 border-t border-zinc-100 pt-3 space-y-3">
                  <Input
                    label="Redemption URL (optional)"
                    placeholder="https://..."
                    value={data.redemptionUrl}
                    onChange={(e) => set({ redemptionUrl: e.target.value })}
                  />
                  <Textarea
                    label="Redemption Instructions (optional)"
                    placeholder="Describe the off-platform redemption process..."
                    value={data.redemptionDescription}
                    onChange={(e) => set({ redemptionDescription: e.target.value })}
                    rows={3}
                  />
                </div>
              )}

              {selected && opt.value === "on_chain" && (
                <div className="px-4 pb-4 ml-7 border-t border-zinc-100 pt-3 space-y-3">
                  <div className="rounded-md bg-darkAqua/5 border border-darkAqua/15 p-3 text-xs text-zinc-700">
                    <p className="font-semibold text-darkAqua mb-1">
                      RedemptionManager is deployed after the token
                    </p>
                    <p>
                      The RedemptionManager contract takes the token address as a
                      constructor argument, so it can&apos;t be deployed until the
                      token exists. After you finish this wizard, open the token
                      detail page and click <strong>Deploy RM</strong> — your
                      wallet signs <code>redemptionFactory.deployRedemptionManager(token)</code>
                      {" "}and the address is filled in automatically. No manual paste.
                    </p>
                  </div>
                  <Textarea
                    label="Redemption Description (optional)"
                    placeholder="Describe the on-chain redemption process for buyers..."
                    value={data.redemptionDescription}
                    onChange={(e) => set({ redemptionDescription: e.target.value })}
                    rows={3}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
