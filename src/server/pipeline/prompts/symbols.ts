/**
 * Stage `symbols` prompts (§5.4). Produces, per file path, the meaningful symbols
 * that changed (name/kind/change/hunks/detail), grounded by the `files` cards.
 */
import type { ModelFile } from "@/lib/model/model";
import type { ParsedDiff } from "@/lib/model/parsed-diff";
import type { ParsedFile } from "@/lib/model/parsed-diff";
import { withPreamble } from "./common";
import { perFileContext, filesGrounding } from "../context";

export function system(): string {
  return withPreamble(
    `STAGE: symbols.
For each file, identify the meaningful symbols that changed (functions, components, hooks,
consts, styles, params, the import block, or — for non-code files — a \`text\`/\`file contents\`
pseudo-symbol). For each symbol set:
- \`name\`: a display name a reader recognizes (pseudo-symbol names like "imports", "loop body",
  or ".my-class" are allowed),
- \`kind\`: a SymbolKind (function, component, const, hook, style, param, internal, imports, text),
- \`change\`: a ChangeKind,
- optional \`renamedFrom\` when change is "renamed",
- \`hunks\`: the integer hunk indices it touches (indices into THAT file's hunks, 0-based),
- \`detail\`: an explanation of what changed and why.
Only use \`path\` strings that appear in the file cards below. Emit via the emit_symbols tool.`,
  );
}

export function user(parsed: ParsedDiff, fileCards: ModelFile[], files?: ParsedFile[]): string {
  return [
    "File cards (grounding — keep your symbols consistent with these):",
    filesGrounding(fileCards),
    "",
    "Full per-file diff (each file's hunks shown with HUNK#i indices and numbered t/o/n/c lines):",
    perFileContext(parsed, files),
  ].join("\n");
}
