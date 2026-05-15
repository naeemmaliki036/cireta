"use client";

import { useState, useEffect } from "react";
import { isAddress, type Abi } from "viem";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseApiDate } from "@/lib/utils";
import { Button } from "@/components/atoms";
import { useContractAction } from "@/hooks/useContractAction";
import { REDEMPTION_MANAGER_ABI } from "@/lib/contracts/abis/redemptionManager";
import {
  listRedemptions,
  updateRedemptionStatus,
  type Redemption,
} from "@/lib/api/repositories/redemptions";

const STATUS_FLOW = ["pending", "processing", "shipped", "fulfilled"];

function StatusBar({ current }: { current: string }) {
  const idx = STATUS_FLOW.indexOf(current);
  return (
    <div className="flex items-center gap-1 mb-4">
      {STATUS_FLOW.map((step, i) => {
        const done = i <= idx;
        const active = i === idx;
        return (
          <div key={step} className="flex items-center gap-1 flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-full h-1.5 rounded-full ${
                  done ? "bg-[#13636F]" : "bg-zinc-200"
                }`}
              />
              <span
                className={`text-[10px] mt-1 ${
                  active
                    ? "text-zinc-900 font-medium"
                    : done
                      ? "text-[#13636F]"
                      : "text-zinc-400"
                }`}
              >
                {step}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DeliveryCard({ r }: { r: Redemption }) {
  if (!r.delivery_name && !r.delivery_address && !r.delivery_phone) return null;
  return (
    <div className="bg-zinc-50 rounded-lg p-4 mb-4 border border-zinc-100">
      <p className="text-xs text-zinc-400 uppercase tracking-wide mb-2 font-medium">
        Delivery Details
      </p>
      <div className="text-sm text-zinc-700 space-y-1">
        {r.delivery_name && (
          <p>
            <span className="text-zinc-400">Name:</span> {r.delivery_name}
          </p>
        )}
        {r.delivery_address && (
          <p>
            <span className="text-zinc-400">Address:</span> {r.delivery_address}
          </p>
        )}
        {r.delivery_phone && (
          <p>
            <span className="text-zinc-400">Phone:</span> {r.delivery_phone}
          </p>
        )}
      </div>
    </div>
  );
}

function ShippingInfo({ r }: { r: Redemption }) {
  if (!r.shipped_at && !r.tracking_number) return null;
  return (
    <div className="bg-[#ECF3F4] rounded-lg p-4 mb-4 border border-[#13636F]/15">
      <p className="text-xs text-[#13636F] uppercase tracking-wide mb-2 font-medium">
        Shipping Info
      </p>
      <div className="text-sm space-y-1">
        {r.tracking_number && (
          <p className="text-zinc-700">
            <span className="text-zinc-400">Tracking #:</span> {r.tracking_number}
          </p>
        )}
        {r.shipped_at && (
          <p className="text-zinc-700">
            <span className="text-zinc-400">Shipped:</span>{" "}
            {parseApiDate(r.shipped_at).toLocaleDateString()}
          </p>
        )}
        {r.fulfilled_at && (
          <p className="text-zinc-700">
            <span className="text-zinc-400">Fulfilled:</span>{" "}
            {parseApiDate(r.fulfilled_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}

interface RedemptionCardProps {
  r: Redemption;
  onUpdate: (
    id: string,
    status: string,
    extra?: { tracking_number?: string; tx_hash?: string },
  ) => void;
  updating: boolean;
}

function RedemptionCard({ r, onUpdate, updating }: RedemptionCardProps) {
  const [trackingInput, setTrackingInput] = useState("");
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const action = useContractAction();
  const [chainError, setChainError] = useState<string | null>(null);

  const next = nextStatus(r.status);
  const isPhysical = r.fulfillment_method === "physical";
  const isFulfilStep = next === "fulfilled";
  const hasOnChain =
    r.onchain_id !== null &&
    r.onchain_id !== undefined &&
    !!r.redemption_manager_address &&
    isAddress(r.redemption_manager_address);

  const handleClickNext = async () => {
    if (!next) return;
    setChainError(null);

    if (!isFulfilStep) {
      onUpdate(
        r.id,
        next,
        next === "shipped" && trackingInput ? { tracking_number: trackingInput } : undefined,
      );
      return;
    }

    if (!hasOnChain) {
      onUpdate(r.id, "fulfilled");
      return;
    }

    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    action.reset();
    const receipt = await action.execute({
      address: r.redemption_manager_address as `0x${string}`,
      abi: REDEMPTION_MANAGER_ABI as unknown as Abi,
      functionName: "fulfil",
      args: [BigInt(r.onchain_id as number)],
    });

    if (!receipt) {
      setChainError(action.error ?? "Transaction failed or was rejected.");
      return;
    }

    onUpdate(r.id, "fulfilled", { tx_hash: receipt.transactionHash });
  };

  const buttonLabel = (() => {
    if (action.isPending) return "Sign in wallet…";
    if (action.isConfirming) return "Confirming on-chain…";
    if (updating) return "Updating…";
    if (next === "shipped") return "Mark Shipped";
    if (next === "fulfilled") return hasOnChain ? "Sign Fulfil Tx" : "Mark Fulfilled";
    return `Mark as ${next}`;
  })();

  const buttonDisabled = updating || action.isPending || action.isConfirming;

  const statusBadgeClass = (() => {
    switch (r.status) {
      case "fulfilled":
        return "bg-green-50 text-green-700 border border-green-200";
      case "shipped":
        return "bg-[#ECF3F4] text-[#13636F] border border-[#13636F]/20";
      case "processing":
        return "bg-amber-50 text-amber-700 border border-amber-200";
      case "cancelled":
        return "bg-red-50 text-red-700 border border-red-200";
      default:
        return "bg-zinc-100 text-zinc-600 border border-zinc-200";
    }
  })();

  return (
    <div className="bg-white rounded-xl border border-zinc-100 p-6 shadow-sm">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <p className="text-zinc-900 font-semibold">
            {Number(r.amount).toLocaleString()} {r.token_symbol ?? "tokens"}
          </p>
          <p className="text-zinc-500 text-xs mt-1">
            {r.created_at ? parseApiDate(r.created_at).toLocaleDateString() : "—"}
            {isPhysical && (
              <span className="ml-2 text-[#13636F] font-medium">Physical Delivery</span>
            )}
            {!isPhysical && r.fulfillment_method && (
              <span className="ml-2 text-green-700 font-medium">Cash Settlement</span>
            )}
            {r.user_email && (
              <span className="ml-2 text-zinc-500">· {r.user_email}</span>
            )}
            {r.onchain_id !== null && r.onchain_id !== undefined && (
              <span className="ml-2 text-zinc-400">· on-chain #{r.onchain_id}</span>
            )}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusBadgeClass}`}>
          {r.status}
        </span>
      </div>

      {isPhysical && r.status !== "cancelled" && <StatusBar current={r.status} />}

      {isPhysical && <DeliveryCard r={r} />}
      {isPhysical && <ShippingInfo r={r} />}

      {action.txUrl && (
        <p className="text-[11px] text-[#13636F] mb-2">
          On-chain tx:{" "}
          <a href={action.txUrl} target="_blank" rel="noreferrer" className="underline">
            {action.txHash?.slice(0, 10)}…
          </a>
        </p>
      )}
      {chainError && <p className="text-[11px] text-red-600 mb-2">{chainError}</p>}

      {next && r.status !== "cancelled" && (
        <div className="flex items-end gap-3 mt-4">
          {next === "shipped" && isPhysical && (
            <div className="flex-1">
              <label className="text-xs text-zinc-500 block mb-1">Tracking Number</label>
              <input
                type="text"
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="Enter tracking number"
                className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-[#13636F]"
              />
            </div>
          )}
          <Button
            onClick={handleClickNext}
            disabled={buttonDisabled}
            isLoading={action.isPending || action.isConfirming || updating}
            variant="primary"
            size="sm"
          >
            {buttonLabel}
          </Button>
        </div>
      )}

      {isFulfilStep && hasOnChain && !isConnected && (
        <p className="text-[11px] text-zinc-500 mt-2">
          Connect your issuer wallet to sign the on-chain burn.
        </p>
      )}
    </div>
  );
}

function nextStatus(current: string) {
  const idx = STATUS_FLOW.indexOf(current);
  return idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
}

export default function RedemptionsPage() {
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchRedemptions = async () => {
    try {
      setRedemptions(await listRedemptions());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRedemptions();
  }, []);

  const handleUpdate = async (
    id: string,
    status: string,
    extra?: { tracking_number?: string; tx_hash?: string },
  ) => {
    setUpdating(id);
    try {
      await updateRedemptionStatus(id, status, extra);
      fetchRedemptions();
    } catch {
      /* ignore */
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-8">Redemption Requests</h1>
      {loading ? (
        <p className="text-zinc-500 text-sm">Loading...</p>
      ) : redemptions.length === 0 ? (
        <p className="text-zinc-500 text-sm">No redemption requests.</p>
      ) : (
        <div className="space-y-4">
          {redemptions.map((r) => (
            <RedemptionCard
              key={r.id}
              r={r}
              onUpdate={handleUpdate}
              updating={updating === r.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
