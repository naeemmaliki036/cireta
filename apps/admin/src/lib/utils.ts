import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind CSS conflict resolution
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with locale-specific separators
 */
export function formatNumber(
  value: number | string,
  options?: Intl.NumberFormatOptions
): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", options).format(num);
}

/**
 * Format currency amount
 */
export function formatCurrency(
  amount: number | string,
  currency = "USD"
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const hasDecimals = num % 1 !== 0;
  return formatNumber(amount, {
    style: "currency",
    currency,
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  });
}

/**
 * Pretty-print a decimal-typed value that comes from the backend already
 * humanised (e.g. "3600.000000000000000000"). Strips trailing zeros after
 * the decimal point and adds thousands separators. Returns "—" for nullish.
 */
export function prettyDecimal(
  value: string | number | null | undefined,
  opts?: { maxFractionDigits?: number },
): string {
  if (value === null || value === undefined || value === "") return "—";
  const raw = typeof value === "number" ? value.toString() : value;
  const parts = raw.split(".");
  const intRaw = parts[0] ?? "0";
  const fracRaw = parts[1] ?? "";
  const maxFrac = opts?.maxFractionDigits ?? 4;
  const frac = fracRaw.slice(0, maxFrac).replace(/0+$/, "");
  const intNum = Number(intRaw);
  const intStr = Number.isFinite(intNum) ? intNum.toLocaleString() : intRaw;
  return frac ? `${intStr}.${frac}` : intStr;
}

/**
 * Format token amount with proper decimals
 */
export function formatTokenAmount(
  amount: bigint | string,
  decimals = 18,
  displayDecimals = 4
): string {
  const value =
    typeof amount === "string" ? BigInt(amount) : amount;
  const divisor = BigInt(10 ** decimals);
  const integerPart = value / divisor;
  const fractionalPart = value % divisor;

  const fractionalStr = fractionalPart
    .toString()
    .padStart(decimals, "0")
    .slice(0, displayDecimals);

  return `${integerPart.toLocaleString()}.${fractionalStr}`;
}

/**
 * Truncate wallet address for display
 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const now = new Date();
  const target = typeof date === "string" ? new Date(date) : date;
  const diffMs = target.getTime() - now.getTime();
  const diffSecs = Math.round(diffMs / 1000);
  const diffMins = Math.round(diffSecs / 60);
  const diffHours = Math.round(diffMins / 60);
  const diffDays = Math.round(diffHours / 24);

  if (Math.abs(diffSecs) < 60) {
    return rtf.format(diffSecs, "second");
  }
  if (Math.abs(diffMins) < 60) {
    return rtf.format(diffMins, "minute");
  }
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }
  return rtf.format(diffDays, "day");
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format date
 */
/** Parse API timestamp strings that may use a space instead of "T" (Safari-safe). */
export function parseApiDate(ts: string | null | undefined): Date {
  if (!ts) return new Date(NaN);
  return new Date(ts.replace(" ", "T"));
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? parseApiDate(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  }).format(d);
}
