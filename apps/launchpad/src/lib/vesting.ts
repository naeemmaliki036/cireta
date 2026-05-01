import type { Holding } from "@/lib/api/repositories/portfolio.repository";

export type VestingState =
  | "direct"        // immediate (no cliff/vesting)
  | "locked"        // cliff in the future
  | "vesting"       // cliff passed, vesting ongoing
  | "fully-vested"; // fully unlocked

export function getVestingState(h: Holding): VestingState {
  if (h.sale_mode !== "vested") return "direct";
  if (!h.cliff_end) return "direct";
  const now = Date.now();
  const cliff = new Date(h.cliff_end).getTime();
  const end = h.vesting_end ? new Date(h.vesting_end).getTime() : cliff;
  if (now < cliff) return "locked";
  if (now >= end) return "fully-vested";
  return "vesting";
}

/**
 * Lockup-only variant: every fraction unlocks at the cliff, no linear ramp.
 * Detected by cliff_end == vesting_end (within 1s tolerance for DB rounding).
 * The label "vesting" doesn't apply to these — they're "locked" then "unlocked".
 */
export function isLockupSchedule(h: Holding): boolean {
  if (!h.cliff_end || !h.vesting_end) return false;
  const cliff = new Date(h.cliff_end).getTime();
  const end = new Date(h.vesting_end).getTime();
  return Math.abs(end - cliff) < 1000;
}

/** Short label for the asset row's secondary line. */
export function getStateLabel(h: Holding): string {
  const state = getVestingState(h);
  const lockup = isLockupSchedule(h);
  if (state === "direct") return "direct";
  if (state === "locked") return "locked";
  if (state === "vesting") return "vesting";
  // fully-vested
  return lockup ? "unlocked" : "vested";
}

function fmtDate(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtRemaining(targetMs: number): string {
  const diff = targetMs - Date.now();
  if (diff <= 0) return "now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const m = minutes % 60;
    return m ? `in ${hours}h ${m}m` : `in ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    const h = hours % 24;
    return h ? `in ${days}d ${h}h` : `in ${days}d`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    const d = days % 30;
    return d ? `in ${months}mo ${d}d` : `in ${months}mo`;
  }
  const years = Math.floor(months / 12);
  return `in ${years}y`;
}

/** Compact one-liner for the holdings table "Vesting Status" column. */
export function formatVestingStatus(h: Holding): string {
  const state = getVestingState(h);
  if (state === "direct") return "Direct (immediate)";
  if (!h.next_unlock_at) return "—";
  const target = new Date(h.next_unlock_at);
  const lockup = isLockupSchedule(h);
  if (state === "locked") return `Unlocks ${fmtDate(target)} · ${fmtRemaining(target.getTime())}`;
  if (state === "fully-vested") {
    return lockup ? `Unlocked ${fmtDate(target)}` : `Fully vested ${fmtDate(target)}`;
  }
  // mid-vesting
  const pct = Math.round((h.vesting_progress ?? 0) * 100);
  return `${pct}% vested · full unlock ${fmtDate(target)}`;
}

/** Short label for the vesting milestones panel. */
export function formatNextUnlock(h: Holding): string {
  const state = getVestingState(h);
  if (!h.next_unlock_at) return "—";
  const target = new Date(h.next_unlock_at);
  const lockup = isLockupSchedule(h);
  if (state === "locked") return `Unlocks ${fmtDate(target)}`;
  if (state === "vesting") return `Full unlock ${fmtDate(target)}`;
  return lockup ? `Unlocked ${fmtDate(target)}` : `Fully vested ${fmtDate(target)}`;
}

export function vestingPercent(h: Holding): number {
  const state = getVestingState(h);
  if (state === "fully-vested") return 100;
  if (state === "locked") return 0;
  if (state === "vesting") return Math.round((h.vesting_progress ?? 0) * 100);
  return 0;
}
