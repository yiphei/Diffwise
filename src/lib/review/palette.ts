/**
 * Semantic chip-color / glyph tables (§7.5, §7.9) — ported from the prototype's
 * `KIND` / `SYMGLYPH` / `EDGECOLOR` / `BADGE`. These are THEME-INDEPENDENT
 * semantic colors (chip foreground `c` + soft background `bg`), reused verbatim
 * across all five level slots. Glyphs per §6.3.
 */
import type {
  ChangeKind,
  SymbolKind,
  EdgeType,
  FileStatus,
} from "@/lib/model/model";

export interface KindStyle {
  /** Chip / text foreground color. */
  c: string;
  /** Soft chip background. */
  bg: string;
  /** Human label for the chip. */
  label: string;
}

/** Change-kind chip colors + labels. Drives theme chips, file/symbol kind chips,
 *  symbol change chips, net-effect chips, arch node tint. */
export const KIND: Record<ChangeKind, KindStyle> = {
  added: { c: "#1a7f37", bg: "rgba(26,127,55,0.14)", label: "added" },
  removed: { c: "#cf222e", bg: "rgba(207,34,46,0.14)", label: "removed" },
  renamed: { c: "#9a6700", bg: "rgba(154,103,0,0.14)", label: "renamed" },
  moved: { c: "#8250df", bg: "rgba(130,80,223,0.14)", label: "moved" },
  modified: { c: "#0969da", bg: "rgba(9,105,218,0.14)", label: "modified" },
  signature: { c: "#bc4c00", bg: "rgba(188,76,0,0.14)", label: "signature" },
  style: { c: "#6e7781", bg: "rgba(110,119,129,0.14)", label: "style" },
  cleanup: { c: "#57606a", bg: "rgba(87,96,106,0.14)", label: "cleanup" },
  imports: { c: "#1b7c83", bg: "rgba(27,124,131,0.14)", label: "imports" },
};

/** Monospace glyph per symbol kind (§6.3): ƒ ⬡ π ⎈ ❖ ⌥ {} ⇄ ¶ */
export const SYMGLYPH: Record<SymbolKind, string> = {
  function: "ƒ",
  component: "⬡",
  const: "π",
  hook: "⎈",
  style: "❖",
  param: "⌥",
  internal: "{}",
  imports: "⇄",
  text: "¶",
};

/** Edge stroke color per architecture edge type (level-4 arch, §9). */
export const EDGECOLOR: Record<EdgeType, string> = {
  subscribe: "#0969da",
  compute: "#8250df",
  guard: "#bc4c00",
  state: "#1a7f37",
  render: "#cf222e",
  frame: "#6e7781",
};

/** File-status badge (level 1 file card). */
export const BADGE: Record<FileStatus, KindStyle> = {
  added: { c: "#1a7f37", bg: "rgba(26,127,55,0.14)", label: "added" },
  deleted: { c: "#cf222e", bg: "rgba(207,34,46,0.14)", label: "deleted" },
  modified: { c: "#0969da", bg: "rgba(9,105,218,0.14)", label: "modified" },
  renamed: { c: "#9a6700", bg: "rgba(154,103,0,0.14)", label: "renamed" },
};
