/**
 * Resolve media URLs — converts relative /uploads/... paths to absolute
 * URLs using the API base. GCS URLs (https://...) pass through unchanged.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  // Already absolute
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  // Relative path — prefix with API base
  return `${API_BASE}${url}`;
}
