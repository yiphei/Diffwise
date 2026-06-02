/**
 * Stage `files` prompts (§5.4). Produces file cards (path/status/summary/kinds),
 * WITHOUT symbols (the `symbols` stage attaches those).
 */
import type { ParsedDiff } from "@/lib/model/parsed-diff";
import type { ParsedFile } from "@/lib/model/parsed-diff";
import { withPreamble } from "./common";
import { perFileContext } from "../context";

export function system(): string {
  return withPreamble(
    `STAGE: files.
For each file in the diff, write a one-sentence card \`summary\` and a small set of \`kinds\`
chips (ChangeKind values). Set \`status\` to the file's lifecycle status; the parser's status
is given in the context, so match it unless you have a strong reason. Do NOT list symbols here.
Use the exact \`path\` strings from the context. Emit your result via the emit_files tool.`,
  );
}

export function user(parsed: ParsedDiff, files?: ParsedFile[]): string {
  return [
    "Full per-file diff (each file's hunks shown with HUNK#i indices and numbered t/o/n/c lines):",
    perFileContext(parsed, files),
  ].join("\n");
}
