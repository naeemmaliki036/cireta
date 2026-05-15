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
                  done ? "bg-blue-500" : "bg-white/10"
                }`}
              />
              <span
                className={`text-[10px] mt-1 ${
                  active ? "text-white font-medium" : done ? "text-blue-400" : "text-white/30"
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
    <div className="bg-white/[0.03] rounded-lg p-4 mb-4 border border-white/5">
      <p className="text-xs text-white/30 uppercase tracking-wide mb-2 font-medium">
        Delivery Details
      </p>
      <div className="text-sm text-white/60 space-y-1">
        {r.delivery_name && (
          <p>
            <span className="text-white/30">Name:</span> {r.delivery_name}
          </p>
        )}
        {r.delivery_address && (
          <p>
            <span className="text-white/30">Address:</span> {r.delivery_address}
          </p>
        )}
        {r.delivery_phone && (
          <p>
            <span className="text-white/30">Phone:</span> {r.delivery_phone}
          </p>
        )}
      </div>
    </div>
  );
}

function ShippingInfo({ r }: { r: Redemption }) {
  if (!r.shipped_at && !r.tracking_number) return null;
  return (
    <div className="bg-blue-500/5 rounded-lg p-4 mb-4 border border-blue-500/10">
      <p className="text-xs text-blue-400/60 uppercase tracking-wide mb-2 font-medium">
        Shipping Info
      </p>
      <div className="text-sm space-y-1">
        {r.tracking_number && (
          <p className="text-white/60">
            <span className="text-white/30">Tracking #:</span> {r.tracking_number}
          </p>
        )}
        {r.shipped_at && (
          <p className="text-white/60">
            <span className="text-white/30">Shipped:</span>{" "}
            {parseApiDate(r.shipped_at).toLocaleDateString()}
          </p>
        )}
        {r.fulfilled_at && (
          <p className="text-white/60">
            <span className="text-white/30">Fulfilled:</span>{" "}
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

    // Non-fulfil transitions (processing, shipped) stay DB-only.
    if (!isFulfilStep) {
      onUpdate(
        r.id,
        next,
        next === "shipped" && trackingInput ? { tracking_number: trackingInput } : undefined,
      );
      return;
    }

    // Fulfilment for an off-chain redemption — DB-only.
    if (!hasOnChain) {
      onUpdate(r.id, "fulfilled");
      return;
    }

    // Fulfilment for an on-chain redemption — wallet signs fulfil(onchain_id).
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
      // useContractAction already surfaced .error — also stash a local copy
      // so the card shows it inline next to the button.
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

  return (
    <div className="bg-white/5 rounded-xl p-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-white font-medium">
            {Number(r.amount).toLocaleString()} {r.token_symbol ?? "tokens"}
          </p>
          <p className="text-white/40 text-xs mt-0.5">
            {r.created_at ? parseApiDate(r.created_at).toLocaleDateString() : "—"}
            {isPhysical && (
              <span className="ml-2 text-blue-400">Physical Delivery</span>
            )}
            {!isPhysical && r.fulfillment_method && (
              <span className="ml-2 text-green-400">Cash Settlement</span>
            )}
            {r.user_email && (
              <span className="ml-2 text-white/40">· {r.user_email}</span>
            )}
            {r.onchain_id !== null && r.onchain_id !== undefined && (
              <span className="ml-2 text-white/30">· on-chain #{r.onchain_id}</span>
            )}
          </p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            r.status === "fulfilled"
              ? "bg-green-500/20 text-green-400"
              : r.status === "shipped"
                ? "bg-blue-500/20 text-blue-400"
                : r.status === "processing"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : r.status === "cancelled"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-white/10 text-white/40"
          }`}
        >
          {r.status}
        </span>
      </div>

      {isPhysical && r.status !== "cancelled" && <StatusBar current={r.status} />}

      {isPhysical && <DeliveryCard r={r} />}
      {isPhysical && <ShippingInfo r={r} />}

      {/* Inline tx hash for the just-signed fulfil call */}
      {action.txUrl && (
        <p className="text-[11px] text-blue-400 mb-2">
          On-chain tx:{" "}
          <a href={action.txUrl} target="_blank" rel="noreferrer" className="underline">
            {action.txHash?.slice(0, 10)}…
          </a>
        </p>
      )}
      {chainError && <p className="text-[11px] text-red-400 mb-2">{chainError}</p>}

      {next && r.status !== "cancelled" && (
        <div className="flex items-end gap-3 mt-4">
          {next === "shipped" && isPhysical && (
            <div className="flex-1">
              <label className="text-xs text-white/40 block mb-1">Tracking Number</label>
              <input
                type="text"
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="Enter tracking number"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50"
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
        <p className="text-[11px] text-white/40 mt-2">
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
      <h1 className="text-2xl font-bold text-white mb-8">Redemption Requests</h1>
      {loading ? (
        <p className="text-white/40 text-sm">Loading...</p>
      ) : redemptions.length === 0 ? (
        <p className="text-white/40 text-sm">No redemption requests.</p>
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
