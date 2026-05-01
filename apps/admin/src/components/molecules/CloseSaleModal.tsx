"use client";

import { useState } from "react";
import { Power } from "lucide-react";
import { Button } from "@/components/atoms";

interface CloseSaleModalProps {
  onConfirm: (failed: boolean) => void;
  onCancel: () => void;
}

/**
 * Modal for the issuer's "Close Sale" action on open-ended sales.
 * Lets the issuer choose between closing as success (claims path)
 * or as failed (refunds path), mapping to closeSale(false/true).
 */
export function CloseSaleModal({ onConfirm, onCancel }: CloseSaleModalProps) {
  const [closeFailed, setCloseFailed] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h3 className="text-base font-semibold text-text mb-2 flex items-center gap-2">
          <Power className="h-4 w-4" /> Close Sale
        </h3>
        <p className="text-sm text-black/60 mb-4">
          How should this open-ended sale be closed?
        </p>
        <div className="space-y-3 mb-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="close-type"
              className="mt-0.5 accent-[#13636F]"
              checked={!closeFailed}
              onChange={() => setCloseFailed(false)}
            />
            <div>
              <p className="text-sm font-medium text-text">End successfully</p>
              <p className="text-xs text-black/50">
                Claims path — buyers can redeem tokens. Maps to{" "}
                <code>closeSale(false)</code>.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="close-type"
              className="mt-0.5 accent-[#13636F]"
              checked={closeFailed}
              onChange={() => setCloseFailed(true)}
            />
            <div>
              <p className="text-sm font-medium text-text">End as failed</p>
              <p className="text-xs text-black/50">
                Refunds path — buyers can reclaim USDC. Maps to{" "}
                <code>closeSale(true)</code>.
              </p>
            </div>
          </label>
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={closeFailed ? "danger" : "primary"}
            size="sm"
            onClick={() => onConfirm(closeFailed)}
          >
            {closeFailed ? "Close as Failed" : "Close as Success"}
          </Button>
        </div>
      </div>
    </div>
  );
}
