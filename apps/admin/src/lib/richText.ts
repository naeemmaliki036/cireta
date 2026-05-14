import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

// Detect HTML payloads (from TipTap) vs markdown (from seeded / SQL-inserted sales).
function looksLikeHtml(value: string): boolean {
  const trimmed = value.trim();
  return /^<[a-zA-Z][\s\S]*>/.test(trimmed);
}

/**
 * Convert a sale's `full_description` field to safe HTML for the admin UI.
 * Mirrors apps/launchpad/src/lib/richText.ts so both portals render the
 * same content identically.
 */
export function richDescriptionToHtml(value: string | null | undefined): string {
  if (!value) return "";
  const html = looksLikeHtml(value) ? value : (marked.parse(value) as string);
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
