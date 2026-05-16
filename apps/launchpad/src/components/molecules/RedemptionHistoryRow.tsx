"use client";

import { getTxUrl } from "@/lib/contracts/addresses";
import type { RedemptionRequest } from "@/lib/api/repositories/portfolio.repository";

interface Props {
  redemption: RedemptionRequest;
  chainId: number;
  tokenSymbolFallback?: string;
  onCancel?: (id: string) => void;
  cancelling?: boolean;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString();
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

const STATUS_PILL: Record<RedemptionRequest["status"], string> = {
  pending: "bg-darkAqua/10 text-darkAqua",
  processing: "bg-amber-100 text-amber-700",
  shipped: "bg-blue-100 text-blue-700",
  fulfilled: "bg-green-100 text-green-700",
  cancelled: "bg-gray-200 text-gray-500",
};

const STEP_ORDER: RedemptionRequest["status"][] = [
  "pending",
  "processing",
  "shipped",
  "fulfilled",
];

function StatusBar({ current }: { current: RedemptionRequest["status"] }) {
  if (current === "cancelled") return null;
  const idx = STEP_ORDER.indexOf(current);
  return (
    <div className="flex items-center gap-1 mt-3 mb-1">
      {STEP_ORDER.map((step, i) => {
        const done = i <= idx;
        const active = i === idx;
        return (
          <div key={step} className="flex-1">
            <div
              className={`h-1.5 rounded-full ${done ? "bg-darkAqua" : "bg-gray-200"}`}
            />
            <p
              className={`text-[10px] mt-1 text-center ${
                active
                  ? "text-text font-semibold"
                  : done
                    ? "text-darkAqua"
                    : "text-gray-400"
              }`}
            >
              {step}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function RedemptionHistoryRow({
  redemption: r,
  chainId,
  tokenSymbolFallback,
  onCancel,
  cancelling,
}: Props) {
  const symbol = r.token_symbol || tokenSymbolFallback || "tokens";
  const isPhysical = r.fulfillment_method === "physical";
  const hasDelivery = r.delivery_name || r.delivery_address || r.delivery_phone;
  const txUrl = r.tx_hash ? getTxUrl(chainId, r.tx_hash) : null;

  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">
            {Number(r.amount).toLocaleString()} {symbol}
            <span className="ml-2 text-xs font-normal text-black/50">
              · {isPhysical ? "Physical delivery" : "Cash settlement"}
            </span>
            {r.onchain_id !== null && r.onchain_id !== undefined && (
              <span className="ml-2 text-xs font-normal text-black/40">
                · on-chain #{r.onchain_id}
              </span>
            )}
          </p>
          <p className="text-xs text-black/40 mt-0.5">
            Requested {fmtDate(r.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${STATUS_PILL[r.status]}`}
          >
            {r.status}
          </span>
          {r.status === "pending" && onCancel && (
            <button
              type="button"
              onClick={() => onCancel(r.id)}
              disabled={cancelling}
              className="text-xs text-red-600 hover:underline disabled:opacity-40"
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          )}
        </div>
      </div>

      {isPhysical && <StatusBar current={r.status} />}

      {isPhysical && hasDelivery && (
        <div className="mt-3 rounded-md bg-gray-50 border border-gray-100 p-3 text-xs space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-black/40 font-semibold mb-1">
            Delivery
          </p>
          {r.delivery_name && (
            <p>
              <span className="text-black/40">Name:</span> {r.delivery_name}
            </p>
          )}
          {r.delivery_address && (
            <p className="whitespace-pre-line">
              <span className="text-black/40">Address:</span> {r.delivery_address}
            </p>
          )}
          {r.delivery_phone && (
            <p>
              <span className="text-black/40">Phone:</span> {r.delivery_phone}
            </p>
          )}
          {r.shipping_country_mismatch && (
            <p className="mt-2 text-amber-700">
              ⚠ Shipping country differs from your verified country. The issuer
              may request additional documentation.
            </p>
          )}
        </div>
      )}

      {(r.tracking_number || r.shipped_at || r.fulfilled_at || txUrl) && (
        <div className="mt-3 rounded-md bg-darkAqua/5 border border-darkAqua/10 p-3 text-xs space-y-1">
          {r.tracking_number && (
            <p>
              <span className="text-black/40">Tracking #:</span>{" "}
              <span className="font-mono">{r.tracking_number}</span>
            </p>
          )}
          {r.shipped_at && (
            <p>
              <span className="text-black/40">Shipped:</span> {fmtDate(r.shipped_at)}
            </p>
          )}
          {r.fulfilled_at && (
            <p>
              <span className="text-black/40">Fulfilled:</span> {fmtDate(r.fulfilled_at)}
            </p>
          )}
          {txUrl && (
            <p>
              <span className="text-black/40">Burn tx:</span>{" "}
              <a
                href={txUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-darkAqua hover:underline font-mono"
              >
                {shortHash(r.tx_hash!)}
              </a>
            </p>
          )}
        </div>
      )}

      {r.rejection_reason && (
        <p className="mt-2 text-xs text-red-700">
          <span className="font-semibold">Rejection reason:</span> {r.rejection_reason}
        </p>
      )}
      {r.notes && (
        <p className="mt-2 text-xs text-black/60">
          <span className="text-black/40">Issuer notes:</span> {r.notes}
        </p>
      )}
    </li>
  );
}
