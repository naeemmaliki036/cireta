"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight, Coins } from "lucide-react";
import { Button } from "@/components/atoms";
import { cn, formatCurrency } from "@/lib/utils";
import {
  formatVestingStatus,
  getVestingState,
  vestingPercent,
} from "@/lib/vesting";
import type { Holding } from "@/lib/api/repositories/portfolio.repository";

export interface HoldingItem extends Holding {
  /** Per-holding presentation extras handed in by the parent page. */
  projectSlug: string;
}

export interface PortfolioTableProps {
  holdings: HoldingItem[];
  className?: string;
}

export function PortfolioTable({ holdings, className }: PortfolioTableProps) {
  if (holdings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-box rounded-2xl border border-black/10">
        <div className="w-14 h-14 mb-4 rounded-full bg-darkAqua/10 flex items-center justify-center">
          <Coins className="w-7 h-7 text-darkAqua" />
        </div>
        <h3 className="text-base font-semibold text-text mb-1">No holdings yet</h3>
        <p className="text-sm text-black/60 max-w-sm mb-4">
          Buy in a sale to start building your portfolio.
        </p>
        <Link href="/projects">
          <Button variant="primary" size="sm">Browse Sales</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-black/50 bg-box">
            <th className="px-4 py-3 text-left font-medium rounded-tl-2xl">Asset</th>
            <th className="px-4 py-3 text-right font-medium">Balance</th>
            <th className="px-4 py-3 text-right font-medium">Value</th>
            <th className="hidden md:table-cell px-4 py-3 text-left font-medium">Vesting Status</th>
            <th className="hidden sm:table-cell px-4 py-3 text-right font-medium">Claimable</th>
            <th className="px-4 py-3 text-right font-medium rounded-tr-2xl">Action</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <HoldingRow key={`${h.token_id}-${h.locked ? "L" : "U"}`} h={h} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoldingRow({ h }: { h: HoldingItem }) {
  const state = getVestingState(h);
  const isVested = h.sale_mode === "vested";
  const pct = vestingPercent(h);
  const claimable = parseFloat(h.claimable_amount ?? h.claimable ?? "0");
  const balance = parseFloat(h.balance);
  const value = parseFloat(h.value_usd);
  const symbol = h.token_symbol;
  const balLabel = isVested ? `fr${symbol}` : symbol;

  return (
    <tr className="border-t border-black/5 hover:bg-box/50 transition-colors">
      {/* Asset */}
      <td className="px-4 py-3.5">
        <Link
          href={`/project/${h.projectSlug}`}
          className="flex items-center gap-3 group"
        >
          <div className="w-9 h-9 rounded-full bg-darkAqua flex items-center justify-center text-white text-xs font-semibold shrink-0">
            {symbol.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text group-hover:text-darkAqua transition-colors truncate">
              {h.token_name}
            </p>
            <p className="text-xs text-black/50">
              {balLabel} · {state === "direct" ? "direct" : state === "locked" ? "locked" : state === "vesting" ? "vesting" : "vested"}
            </p>
          </div>
        </Link>
      </td>

      {/* Balance */}
      <td className="px-4 py-3.5 text-right">
        <p className="text-sm font-semibold text-text">
          {balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
        </p>
        <p className="text-xs text-black/50">{balLabel}</p>
      </td>

      {/* Value */}
      <td className="px-4 py-3.5 text-right">
        <p className="text-sm font-semibold text-text">{formatCurrency(value)}</p>
      </td>

      {/* Vesting Status */}
      <td className="hidden md:table-cell px-4 py-3.5">
        {state === "direct" ? (
          <p className="text-xs text-black/50">Direct (immediate)</p>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-1.5 bg-black/10 rounded-full overflow-hidden max-w-[120px]">
                <div
                  className="h-full bg-darkAqua transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-text tabular-nums">{pct}%</span>
            </div>
            <p className="text-xs text-black/60 leading-tight">
              {formatVestingStatus(h)}
            </p>
          </div>
        )}
      </td>

      {/* Claimable */}
      <td className="hidden sm:table-cell px-4 py-3.5 text-right">
        {claimable > 0 ? (
          <p className="text-sm font-semibold text-darkAqua tabular-nums">
            {claimable.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            <span className="text-xs font-normal text-black/50 ml-1">{symbol}</span>
          </p>
        ) : state === "locked" ? (
          <p className="text-xs text-black/50">Locked</p>
        ) : state === "fully-vested" ? (
          <p className="text-xs text-black/50">All claimed</p>
        ) : state === "vesting" ? (
          <p className="text-xs text-black/50">Vesting</p>
        ) : (
          <p className="text-xs text-black/40">—</p>
        )}
      </td>

      {/* Action */}
      <td className="px-4 py-3.5 text-right">
        {claimable > 0 ? (
          <Link href={`/portfolio/claim/${h.token_id}`}>
            <Button variant="primary" size="sm">Claim</Button>
          </Link>
        ) : (
          <Link
            href={`/project/${h.projectSlug}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-darkAqua hover:underline"
          >
            View <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </td>
    </tr>
  );
}
