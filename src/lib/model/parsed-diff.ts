/**
 * ParsedDiff — the deterministic, non-LLM parse of a raw unified diff (§6.4).
 * Contains ZERO LLM output; it is the ground truth the MODEL annotates and is
 * validated against. Held only in browser-tab memory for the session.
 *
 * This module owns the ParsedDiff TYPES plus the deterministic helpers
 * `statusOf` / `computeStats` / `buildByPath` (§6.7). The parser body lives in
 * `@/server/diff/parse` (server-only); see the re-export at the bottom would
 * introduce a server import into a shared module, so callers import the parser
 * directly from `@/server/diff/parse`.
 */
import type { FileStatus, ModelStats } from "./model";

/** Noise classification (§4.7). Demotes (never drops) uninteresting files. */
export type NoiseClass = "lockfile" | "generated" | "vendored" | "binary" | "minified";

/** One physical line in a hunk. [D]
 *  `c` is the RAW content WITHOUT the leading +/-/space marker, ALWAYS rendered
 *  as text, never HTML (untrusted). */
export interface Line {
  t: "add" | "del" | "ctx";
  o: number | null; // old (left) line number; null on 'add'
  n: number | null; // new (right) line number; null on 'del'
  c: string;
}

/** A contiguous @@ hunk. [D] */
export interface Hunk {
  header: string; // the literal "@@ -a,b +c,d @@ ..." line (text-only)
  lines: Line[];
}

/** One file's parsed diff. [D] hunk order is STABLE — Symbol.hunks index into it. */
export interface ParsedFile {
  oldPath: string | null; // a/<path>; null for newly-added files
  newPath: string | null; // b/<path>; null/"/dev/null" for deleted files
  status: FileStatus;
  additions: number;
  deletions: number;
  isBinary: boolean;
  noise: NoiseClass | null;
  hunks: Hunk[];
}

/** The whole parsed diff. [D] */
export interface ParsedDiff {
  files: ParsedFile[];
  /** Every non-null oldPath AND newPath maps to its ParsedFile. The MODEL keys
   *  by the post-change path (newPath) for modified/added files and by oldPath
   *  for deleted files. */
  byPath: Record<string, ParsedFile>;
}

/** The display path for a file (post-change wins; falls back to old for deletes). */
export function filePath(pf: ParsedFile): string {
  return pf.newPath ?? pf.oldPath ?? "(unknown)";
}

/** Build the byPath lookup once. Maps both oldPath and newPath to the file. [D] */
export function buildByPath(files: ParsedFile[]): Record<string, ParsedFile> {
  const byPath: Record<string, ParsedFile> = {};
  for (const f of files) {
    if (f.newPath && f.newPath !== "/dev/null") byPath[f.newPath] = f;
    if (f.oldPath && f.oldPath !== "/dev/null") byPath[f.oldPath] = f;
  }
  return byPath;
}

/** Deterministic file-status detection (§6.7). [D] */
export function statusOf(pf: ParsedFile): FileStatus {
  if (pf.oldPath && (!pf.newPath || pf.newPath === "/dev/null")) return "deleted";
  if (
    pf.additions > 0 &&
    pf.deletions === 0 &&
    (!pf.oldPath || pf.oldPath === "/dev/null")
  )
    return "added";
  if (pf.oldPath && pf.newPath && pf.oldPath !== pf.newPath) return "renamed";
  return "modified";
}

/** Single source of truth for MODEL.stats (§6.7). [C] never trust the LLM here. */
export function computeStats(parsed: ParsedDiff): ModelStats {
  const perFile = parsed.files.map((f) => ({
    path: filePath(f),
    additions: f.additions,
    deletions: f.deletions,
  }));
  return {
    filesChanged: parsed.files.length,
    additions: perFile.reduce((s, f) => s + f.additions, 0),
    deletions: perFile.reduce((s, f) => s + f.deletions, 0),
    perFile,
  };
}

/** Total changed lines = additions + deletions (the cap metric). */
export function changedLines(parsed: ParsedDiff): number {
  const s = computeStats(parsed);
  return s.additions + s.deletions;
}
