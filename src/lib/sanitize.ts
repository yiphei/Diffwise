/**
 * The single chokepoint for ALL LLM-authored prose (§10.2 Rule 2). Pipeline:
 * inline-markdown → HTML → DOMPurify with a tight allowlist (emphasis + inline
 * code only; NO attributes, NO links, NO images). Diff content is NEVER passed
 * here — it is rendered as text (§10.2 Rule 1). isomorphic-dompurify works on both
 * server (SSR) and client.
 */
import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ["b", "strong", "i", "em", "code", "span", "br"],
  ALLOWED_ATTR: [] as string[], // no attributes at all
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "a", "img", "svg", "math"],
};

/**
 * Sanitize untrusted prose. Renders inline markdown (no block tags, no raw HTML
 * survives the allowlist) and strips everything outside the allowlist.
 */
export function sanitizeProse(input: string | undefined | null): string {
  if (!input) return "";
  // parseInline keeps output inline (no <p> wrapper) and matches the tag allowlist.
  const html = marked.parseInline(input, { async: false }) as string;
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as unknown as string;
}

/** Sanitize to PLAIN TEXT (no tags) — for attributes like title="" and dot tooltips. */
export function sanitizeText(input: string | undefined | null): string {
  if (!input) return "";
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) as unknown as string;
}
