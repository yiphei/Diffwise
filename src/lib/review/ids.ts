/**
 * Canonical DOM-id builder (§7.1) — the SINGLE source of truth for all DOM ids
 * and deep-link hashes, imported by §7 (the review shell) AND §8 (story mode) so
 * they always agree. The prototype's `slug`/`sid` are the source of truth.
 *
 * A story beat that spotlights a symbol and a deep-link to that same symbol MUST
 * resolve to the IDENTICAL DOM id — so both go through this one module.
 */

/** Prototype slug: non-alphanumerics → '_'. */
export const slug = (s: string): string => s.replace(/[^a-z0-9]/gi, "_");

/** Stable DOM id for a file card: prefix 'f-'. */
export const fileDomId = (path: string): string => `f-${slug(path)}`;

/** Stable DOM id for a symbol row: prefix 's-', single '-' between file + name slugs. */
export const symbolDomId = (path: string, name: string): string =>
  `s-${slug(path)}-${slug(name)}`;

/** Deep-link / story-beat hash: `#L<level>` or `#L<level>/<elementId>`. */
export const beatHash = (level: number, elementId?: string): string =>
  `#L${level}${elementId ? `/${elementId}` : ""}`;
