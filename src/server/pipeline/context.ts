/**
 * Context serializers (§5.4 / §5.8). Turn the deterministic `ParsedDiff` into
 * compact, untrusted-fenced text for each stage's *user* turn, and serialize
 * prior stage outputs as grounding for the downstream stages.
 *
 * Every diff body is wrapped in <UNTRUSTED_DIFF>…</UNTRUSTED_DIFF> markers and
 * any literal occurrence of those markers inside diff content is neutralized so
 * a malicious diff cannot close the fence early (§5.8 rule 2).
 *
 * This module builds model INPUT only. It performs NO `path`→`file` mapping
 * (that legacy-key normalization lives in the validator, §5.4 note).
 */
import type { ModelFile, Relation, Arch } from "@/lib/model/model";
import { filePath, statusOf } from "@/lib/model/parsed-diff";
import type { Hunk, ParsedDiff, ParsedFile } from "@/lib/model/parsed-diff";

/** Default number of leading lines per hunk included in the compact whole-diff view. */
export const COMPACT_HUNK_LINES = 8;

const OPEN = "<UNTRUSTED_DIFF>";
const CLOSE = "</UNTRUSTED_DIFF>";

/**
 * Neutralize any literal `<UNTRUSTED_DIFF>` / `</UNTRUSTED_DIFF>` occurring in
 * diff content by inserting a zero-width joiner after the angle bracket, so the
 * fence cannot be closed (or re-opened) early. The marker remains human-legible
 * but no longer matches the literal delimiter.
 */
export function escapeUntrustedMarkers(content: string): string {
  return content
    .replace(/<\/UNTRUSTED_DIFF>/g, "<‍/UNTRUSTED_DIFF>")
    .replace(/<UNTRUSTED_DIFF>/g, "<‍UNTRUSTED_DIFF>");
}

/** The display path used to key a file in the MODEL/context (post-change wins). */
function ctxPath(f: ParsedFile): string {
  return filePath(f);
}

/** Per-hunk line prefix `t/o/n/c` line (§5.4). `t` is add|del|ctx. */
function lineRow(l: { t: "add" | "del" | "ctx"; o: number | null; n: number | null; c: string }): string {
  const tag = l.t === "add" ? "add" : l.t === "del" ? "del" : "ctx";
  const o = l.o === null ? "·" : String(l.o);
  const n = l.n === null ? "·" : String(l.n);
  return `    ${tag.padEnd(3)} o=${o} n=${n}  | ${escapeUntrustedMarkers(l.c)}`;
}

/** Serialize one file fully: every hunk with its index and numbered lines. */
function serializeFileFull(f: ParsedFile): string {
  const path = ctxPath(f);
  const status = statusOf(f);
  const lines: string[] = [
    `FILE [path="${path}" status="${status}" +${f.additions} -${f.deletions}]`,
  ];
  f.hunks.forEach((h: Hunk, i: number) => {
    lines.push(`  HUNK#${i}  ${escapeUntrustedMarkers(h.header)}`);
    for (const l of h.lines) lines.push(lineRow(l));
  });
  if (f.hunks.length === 0) lines.push("  (no text hunks)");
  return lines.join("\n");
}

/** Serialize one file compactly: first N lines of each hunk + all hunk headers. */
function serializeFileCompact(f: ParsedFile, headLines: number): string {
  const path = ctxPath(f);
  const status = statusOf(f);
  const lines: string[] = [
    `FILE [path="${path}" status="${status}" +${f.additions} -${f.deletions}]`,
  ];
  f.hunks.forEach((h: Hunk, i: number) => {
    lines.push(`  HUNK#${i}  ${escapeUntrustedMarkers(h.header)}`);
    const shown = h.lines.slice(0, headLines);
    for (const l of shown) lines.push(lineRow(l));
    if (h.lines.length > shown.length) {
      lines.push(`    … (${h.lines.length - shown.length} more lines)`);
    }
  });
  if (f.hunks.length === 0) lines.push("  (no text hunks)");
  return lines.join("\n");
}

/** Wrap a body in the untrusted-diff fence. */
function fence(body: string): string {
  return `${OPEN}\n${body}\n${CLOSE}`;
}

/**
 * Compact whole-diff context for the `intent` stage (§5.4): every file's
 * path/status/±counts, all hunk headers, and the first N lines of each hunk.
 */
export function parsedToContext(parsed: ParsedDiff, headLines = COMPACT_HUNK_LINES): string {
  const body = parsed.files.map((f) => serializeFileCompact(f, headLines)).join("\n\n");
  return fence(body);
}

/** Full per-file serialization of one file (HUNK#i + numbered t/o/n/c lines). */
export function fileSlice(parsed: ParsedDiff, path: string): string {
  const f = parsed.byPath[path];
  if (!f) return fence(`FILE [path="${path}" status="unknown"]\n  (file not found)`);
  return fence(serializeFileFull(f));
}

/**
 * Full per-file serialization of the whole diff (HUNK#i indices + numbered
 * lines) for the `files` / `symbols` stages. Optionally restricted to a subset
 * of files (used for per-file-atomic chunking, §5.4.1).
 */
export function perFileContext(parsed: ParsedDiff, files?: ParsedFile[]): string {
  const list = files ?? parsed.files;
  const body = list.map((f) => serializeFileFull(f)).join("\n\n");
  return fence(body);
}

/**
 * A short, bounded diff summary (paths/status/±counts only, no bodies) used by
 * the `relations` / `arch` / `story` stages, which never receive full bodies.
 */
export function summaryContext(parsed: ParsedDiff): string {
  const rows = parsed.files.map((f) => {
    const path = ctxPath(f);
    const status = statusOf(f);
    return `- ${path} [${status}] +${f.additions} -${f.deletions} (${f.hunks.length} hunks)`;
  });
  return rows.join("\n");
}

// ---------------------------------------------------------------------------
// Prior-output serializers (grounding passed to downstream stages)
// ---------------------------------------------------------------------------

/** Serialize `files[]` cards (with any nested symbols) as grounding text. */
export function filesGrounding(files: ModelFile[]): string {
  return files
    .map((f) => {
      const head = `- ${f.path} [${f.status}] kinds=[${f.kinds.join(", ")}]: ${f.summary}`;
      if (!f.symbols || f.symbols.length === 0) return head;
      const syms = f.symbols
        .map(
          (s) =>
            `    · ${s.name} (${s.kind}/${s.change}) hunks=[${s.hunks.join(",")}]${
              s.renamedFrom ? ` renamedFrom=${s.renamedFrom}` : ""
            }`,
        )
        .join("\n");
      return `${head}\n${syms}`;
    })
    .join("\n");
}

/** Serialize the symbol inventory only (name + file), for jump-target grounding. */
export function symbolsGrounding(files: ModelFile[]): string {
  const rows: string[] = [];
  for (const f of files) {
    for (const s of f.symbols ?? []) {
      rows.push(`- ${f.path}#${s.name} (${s.kind}/${s.change})`);
    }
  }
  return rows.join("\n");
}

/** Serialize the relations output as grounding for `arch` / `story`. */
export function relationsGrounding(relations: Relation[]): string {
  if (relations.length === 0) return "(no relations)";
  return relations
    .map((r) => {
      const edges = r.edges
        .map((e) => `    → ${e.what} ⇒ ${e.to}${e.target ? ` [${e.target.file}#${e.target.sym}]` : ""}`)
        .join("\n");
      return `- ${r.title} (${r.tagKind}) from ${r.source}\n${edges}`;
    })
    .join("\n");
}

/** Serialize the arch output (node ids + jump targets) as grounding for `story`. */
export function archGrounding(arch: Arch): string {
  if (!arch || arch.nodes.length === 0) return "(no arch)";
  const nodes = arch.nodes
    .map((n) => `- node ${n.id}: ${n.label} (${n.kind})${n.jump ? ` jump=${n.jump}` : ""}`)
    .join("\n");
  const edges = arch.edges
    .map((e) => `- edge ${e.id}: ${e.from} →(${e.type}) ${e.to} "${e.label}"`)
    .join("\n");
  return `NODES:\n${nodes}\nEDGES:\n${edges}`;
}
