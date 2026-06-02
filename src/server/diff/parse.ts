/**
 * Deterministic unified-diff parser (§4.4). Server-only. Produces the canonical
 * ParsedFile[] / ParsedDiff shape (the ground truth the LLM MODEL annotates and
 * is validated against). ZERO LLM involvement.
 *
 * The output type contract (`Line`, `Hunk`, `ParsedFile`, `ParsedDiff`) is owned
 * by `@/lib/model/parsed-diff`; this module imports it and never redefines it.
 */
import type { Hunk, Line, ParsedDiff, ParsedFile } from "@/lib/model/parsed-diff";
import { buildByPath } from "@/lib/model/parsed-diff";
import type { FileStatus } from "@/lib/model/model";
import { classifyNoise } from "@/server/diff/noise";

/** A single entry from the GitHub PR "files" list (§4.3c). */
export interface GithubFileEntry {
  filename: string;
  previous_filename?: string;
  status: string; // added|removed|modified|renamed|copied|changed|unchanged
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

/**
 * Parse a raw unified diff (`git`/GitHub `.diff` media type) into ParsedFile[].
 * Mirrors the §4.4 algorithm verbatim, hardened against real-world diffs:
 *  - CRLF normalized to LF.
 *  - status taken from extended headers, not inferred from line counts.
 *  - binary files set isBinary and contribute 0 hunks.
 *  - mode/copy/index/no-newline lines are skipped without corrupting numbering.
 */
export function parseUnifiedDiff(text: string): ParsedFile[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const files: ParsedFile[] = [];
  let file: ParsedFile | null = null;
  let hunk: Hunk | null = null;
  let oldN = 0;
  let newN = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      file = {
        oldPath: null,
        newPath: null,
        status: "modified",
        additions: 0,
        deletions: 0,
        isBinary: false,
        noise: null,
        hunks: [],
      };
      files.push(file);
      hunk = null;
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (m) {
        file.oldPath = m[1] ?? null;
        file.newPath = m[2] ?? null;
      }
      continue;
    }
    if (!file) continue;

    // --- header lines that mutate file state ---
    if (line.startsWith("new file")) {
      file.status = "added";
      file.oldPath = null;
      continue;
    }
    if (line.startsWith("deleted file")) {
      file.status = "deleted";
      file.newPath = null;
      continue;
    }
    if (line.startsWith("rename from ")) {
      file.oldPath = line.slice(12);
      file.status = "renamed";
      continue;
    }
    if (line.startsWith("rename to ")) {
      file.newPath = line.slice(10);
      file.status = "renamed";
      continue;
    }
    if (line.startsWith("Binary files") || /^GIT binary patch/.test(line)) {
      file.isBinary = true;
      continue;
    }
    if (line.startsWith("--- ")) {
      if (line.endsWith("/dev/null")) file.oldPath = null;
      continue;
    }
    if (line.startsWith("+++ ")) {
      if (line.endsWith("/dev/null")) file.newPath = null;
      continue;
    }
    if (
      line.startsWith("index ") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("similarity") ||
      line.startsWith("copy ") ||
      line.startsWith("dissimilarity")
    ) {
      continue;
    }

    // --- hunk header ---
    if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
      oldN = m ? +(m[1] as string) : 0;
      newN = m ? +(m[2] as string) : 0;
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (line.startsWith("\\")) continue; // "\ No newline at end of file"
    if (!hunk) continue;

    // --- body lines ---
    const c = line[0];
    if (c === "+") {
      const ln: Line = { t: "add", o: null, n: newN++, c: line.slice(1) };
      hunk.lines.push(ln);
      file.additions++;
    } else if (c === "-") {
      const ln: Line = { t: "del", o: oldN++, n: null, c: line.slice(1) };
      hunk.lines.push(ln);
      file.deletions++;
    } else {
      const ln: Line = { t: "ctx", o: oldN++, n: newN++, c: line.slice(1) };
      hunk.lines.push(ln);
    }
  }

  for (const f of files) finalizeStatus(f);
  return files;
}

/**
 * Resolve status when no explicit extended header set it (the common `modified`
 * case) and normalize the /dev/null cases (§4.4). Explicit renames are kept.
 */
export function finalizeStatus(f: ParsedFile): void {
  if (f.status === "renamed") return; // explicit
  if (f.oldPath === null && f.newPath) f.status = "added";
  else if (f.newPath === null && f.oldPath) f.status = "deleted";
  else f.status = "modified";
}

/** Normalize GitHub's wider status set to the canonical FileStatus (§4.3). */
function normalizeGithubStatus(status: string): FileStatus | null {
  switch (status) {
    case "added":
      return "added";
    case "copied":
      return "added";
    case "removed":
      return "deleted";
    case "deleted":
      return "deleted";
    case "renamed":
      return "renamed";
    case "modified":
      return "modified";
    case "changed":
      return "modified";
    case "unchanged":
      return "modified";
    default:
      return null;
  }
}

/** Match a files-list entry to a ParsedFile by new/old path. */
function matchFile(files: ParsedFile[], entry: GithubFileEntry): ParsedFile | undefined {
  const fn = entry.filename;
  const prev = entry.previous_filename;
  return files.find((f) => {
    if (f.newPath === fn || f.oldPath === fn) return true;
    if (prev !== undefined && (f.oldPath === prev || f.newPath === prev)) return true;
    return false;
  });
}

/**
 * Backfill the parsed files with the GitHub files list (§4.3 / §4.5):
 *  - binary files (entry has changes>0 and no patch) get additions/deletions
 *    that the diff body never carried, and isBinary is set.
 *  - GitHub's wider status set is normalized into the canonical FileStatus.
 *  - files that GitHub returned but the diff body elided are synthesized so they
 *    still appear in the ParsedDiff (and count toward the cap).
 *  - every file's noise class is stamped via classifyNoise.
 */
export function reconcileWithFilesList(
  files: ParsedFile[],
  ghFiles: GithubFileEntry[],
): ParsedFile[] {
  for (const entry of ghFiles) {
    const isBinaryEntry = entry.changes > 0 && entry.patch === undefined;
    let pf = matchFile(files, entry);

    if (!pf) {
      // GitHub knows about this file but the diff body elided it (often binary
      // or too-large). Synthesize a ParsedFile so it is not silently dropped.
      const status = normalizeGithubStatus(entry.status) ?? "modified";
      pf = {
        oldPath: entry.previous_filename ?? (status === "added" ? null : entry.filename),
        newPath: status === "deleted" ? null : entry.filename,
        status,
        additions: 0,
        deletions: 0,
        isBinary: false,
        noise: null,
        hunks: [],
      };
      files.push(pf);
    }

    if (isBinaryEntry) {
      pf.isBinary = true;
    }

    // Binary files carry no hunks, so the parser counted 0 add/del — backfill.
    if (pf.isBinary && pf.additions === 0 && pf.deletions === 0) {
      pf.additions = entry.additions;
      pf.deletions = entry.deletions;
    }

    // Normalize GitHub status onto files we did not parse a rename for.
    const ghStatus = normalizeGithubStatus(entry.status);
    if (ghStatus && pf.status !== "renamed") {
      pf.status = ghStatus;
    }

    if (entry.previous_filename !== undefined && pf.oldPath === null) {
      pf.oldPath = entry.previous_filename;
    }
  }

  for (const f of files) {
    f.noise = classifyNoise(f);
  }
  return files;
}

/** Build the canonical ParsedDiff (files + byPath lookup). */
export function buildParsedDiff(files: ParsedFile[]): ParsedDiff {
  return { files, byPath: buildByPath(files) };
}

/**
 * Resolve a {path, hunkIdx} reference against the parsed diff. Used by the
 * pipeline's structural validator to ground every Symbol.hunks index and jump.
 * Returns the Hunk or null if the path or index is out of range.
 */
export function resolveHunkRef(parsed: ParsedDiff, path: string, idx: number): Hunk | null {
  const file = parsed.byPath[path];
  if (!file) return null;
  if (!Number.isInteger(idx) || idx < 0 || idx >= file.hunks.length) return null;
  return file.hunks[idx] ?? null;
}
