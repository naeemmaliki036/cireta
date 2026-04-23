import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind CSS conflict resolution
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Validate an email with the same shape FastAPI's Pydantic EmailStr
 * expects: non-empty local part, @, domain with a dot, TLD of 2+ chars.
 * The browser's built-in type="email" validator accepts things like
 * `foo@bar` which the server then rejects — hence this stricter
 * client-side check.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim().toLowerCase());
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
  return formatNumber(amount, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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
 * Format a token allocation amount that may already be a decimal-scaled number.
 * Handles three cases: zero, very small (renders "<0.0001" or scientific),
 * and normal (locale-formatted with up to 4 decimals).
 *
 * Used by the Transactions table where the value comes from the backend as a
 * decimal string and may underflow to scientific notation (e.g. "1.176470E-12").
 */
export function formatTokenDisplay(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!isFinite(num) || num === 0) return "0";
  if (num < 0.0001 && num > -0.0001) {
    // Show one significant figure in scientific form for tiny values
    return num.toExponential(2);
  }
  if (Math.abs(num) < 1) {
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/**
 * Truncate wallet address for display
 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Sanitize a `?redirect=` query param from the URL.
 * Only relative paths rooted at "/" are allowed to prevent open-redirect
 * phishing. Anything else (external URLs, protocol-relative `//evil.com`,
 * `javascript:` schemes, empty strings) collapses to the provided default.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = "/projects"): string {
  if (!raw) return fallback;
  const decoded = decodeURIComponent(raw).trim();
  if (!decoded) return fallback;
  // Reject absolute URLs, protocol-relative, and dangerous schemes
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return fallback;
  if (decoded.startsWith("//")) return fallback;
  if (decoded.startsWith("\\")) return fallback;
  if (!decoded.startsWith("/")) return fallback;
  return decoded;
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
