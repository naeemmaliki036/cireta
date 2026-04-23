import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

// Detect rendered HTML by looking for a leading tag. Content produced by the
// TipTap editor in the admin app always starts with an HTML tag; markdown
// content from older seeded sales starts with text, a heading (`#`), or a
// table pipe — renderers treat HTML as-is and markdown through `marked`.
function looksLikeHtml(value: string): boolean {
  const trimmed = value.trim();
  return /^<[a-zA-Z][\s\S]*>/.test(trimmed);
}

/**
 * Convert a sale's `full_description` field to safe HTML.
 *
 * Accepts either HTML (new TipTap-produced content) or markdown (older seeded
 * content) and always returns sanitized HTML ready for `dangerouslySetInnerHTML`.
 * Pass the return value straight into `{ __html: ... }`.
 */
export function richDescriptionToHtml(value: string | null | undefined): string {
  if (!value) return "";
  const html = looksLikeHtml(value) ? value : (marked.parse(value) as string);
  // DOMPurify requires a `window` object; guard for SSR and fall back to the
  // raw string (server rendering is safe because React won't parse it into
  // live nodes until hydration, at which point we sanitize on the client).
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
