"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/atoms";
import { cn } from "@/lib/utils";
import {
  formatNextUnlock,
  getVestingState,
  isLockupSchedule,
  vestingPercent,
} from "@/lib/vesting";
import type { Holding } from "@/lib/api/repositories/portfolio.repository";

export interface VestingMiniCardProps {
  holding: Holding;
  className?: string;
}

function stateLabel(state: ReturnType<typeof getVestingState>, lockup: boolean): string {
  if (state === "direct") return "Direct";
  if (state === "locked") return "Locked";
  if (state === "vesting") return "Vesting";
  // fully-vested
  return lockup ? "Unlocked" : "Vested";
}

export function VestingMiniCard({ holding, className }: VestingMiniCardProps) {
  const state = getVestingState(holding);
  const lockup = isLockupSchedule(holding);
  const pct = vestingPercent(holding);
  const claimable = parseFloat(holding.claimable_amount ?? holding.claimable ?? "0");

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-black/10 p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text truncate">
            {holding.token_symbol}
          </p>
          <p className="text-xs text-black/50 truncate">{holding.token_name}</p>
        </div>
        <span
          className={cn(
            "text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full",
            state === "fully-vested"
              ? "bg-darkAqua text-white"
              : state === "vesting"
              ? "bg-darkAqua/15 text-darkAqua"
              : "bg-box text-black/60"
          )}
        >
          {stateLabel(state, lockup)}
        </span>
      </div>

      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-black/50">Vested</span>
          <span className="text-xs font-semibold text-text tabular-nums">{pct}%</span>
        </div>
        <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-darkAqua transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Next unlock */}
      <p className="text-xs text-black/60 mb-3">{formatNextUnlock(holding)}</p>

      {/* Claim CTA */}
      {claimable > 0 ? (
        <Link href={`/portfolio/claim/${holding.token_id}`} className="block">
          <Button variant="primary" size="sm" className="w-full">
            Claim {claimable.toLocaleString(undefined, { maximumFractionDigits: 2 })} {holding.token_symbol}
          </Button>
        </Link>
      ) : (
        <Button variant="outline" size="sm" className="w-full" disabled>
          {state === "locked" ? "Locked" : state === "vesting" ? "Wait for unlock" : "Nothing to claim"}
        </Button>
      )}
    </div>
  );
}
