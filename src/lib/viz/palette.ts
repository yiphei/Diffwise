/**
 * Single source of truth for color/glyph tables is `@/lib/review/palette`
 * (§9.1 — `palette.ts` holds the KIND / SYMGLYPH / EDGECOLOR / BADGE tables).
 * This module re-exports it so viz templates and the rest of the frontend
 * share ONE table (no drift). Do NOT redefine palette values here.
 */
export { KIND, SYMGLYPH, EDGECOLOR, BADGE } from "@/lib/review/palette";
