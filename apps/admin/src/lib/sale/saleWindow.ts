// Shared rules for sale start/end and phase windows.
// Mirrors Sale.sol — keep in lockstep if the contract constants change.

export const MAX_SALE_DURATION_DAYS = 730;
export const INACTIVITY_TIMEOUT_DAYS = 180;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Returns the latest allowed Sale End given a start (datetime-local string). */
export function maxAllowedSaleEnd(saleStart: string): string {
  if (!saleStart) return "";
  const ms = new Date(saleStart).getTime();
  if (Number.isNaN(ms)) return "";
  const cap = new Date(ms + MAX_SALE_DURATION_DAYS * MS_PER_DAY);
  // datetime-local format: YYYY-MM-DDTHH:mm
  return cap.toISOString().slice(0, 16);
}

/** Returns the latest allowed Phase End for a phase inside a sale. */
export function maxAllowedPhaseEnd(opts: {
  saleStart: string;
  saleEnd: string;
  isOpenEnded: boolean;
}): string {
  const { saleStart, saleEnd, isOpenEnded } = opts;
  if (isOpenEnded) return maxAllowedSaleEnd(saleStart);
  return saleEnd || maxAllowedSaleEnd(saleStart);
}

/** True if the sale window exceeds the 730-day cap. */
export function saleWindowTooLong(saleStart: string, saleEnd: string): boolean {
  if (!saleStart || !saleEnd) return false;
  const start = new Date(saleStart).getTime();
  const end = new Date(saleEnd).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return end - start > MAX_SALE_DURATION_DAYS * MS_PER_DAY;
}

/** True if a phase falls outside its sale window. */
export function phaseOutsideSaleWindow(opts: {
  phaseStart: string;
  phaseEnd: string;
  saleStart: string;
  saleEnd: string;
  isOpenEnded: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const { phaseStart, phaseEnd, saleStart, saleEnd, isOpenEnded } = opts;
  if (!phaseStart || !phaseEnd || !saleStart) return { ok: true };
  const ps = new Date(phaseStart).getTime();
  const pe = new Date(phaseEnd).getTime();
  const ss = new Date(saleStart).getTime();
  if (Number.isNaN(ps) || Number.isNaN(pe) || Number.isNaN(ss)) return { ok: true };
  if (ps < ss) return { ok: false, reason: "Phase starts before the sale starts." };
  const cap = isOpenEnded
    ? ss + MAX_SALE_DURATION_DAYS * MS_PER_DAY
    : new Date(saleEnd).getTime();
  if (!Number.isNaN(cap) && pe > cap) {
    return {
      ok: false,
      reason: isOpenEnded
        ? `Phase ends after the 730-day cap (${new Date(cap).toLocaleString()}).`
        : `Phase ends after the sale ends (${new Date(cap).toLocaleString()}).`,
    };
  }
  return { ok: true };
}
