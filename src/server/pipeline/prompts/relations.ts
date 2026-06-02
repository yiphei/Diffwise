/**
 * Stage `relations` prompts (§5.4). Produces refactor-trace relations whose jump
 * targets are drawn from real paths + Symbol.names.
 */
import type { ModelFile } from "@/lib/model/model";
import type { ParsedDiff } from "@/lib/model/parsed-diff";
import { withPreamble } from "./common";
import { summaryContext, filesGrounding } from "../context";

export function system(): string {
  return withPreamble(
    `STAGE: relations.
Identify refactor traces: where a unit (a file/symbol that was deleted, moved, or
substantially changed) sent its responsibilities. Each relation has a \`title\`, a \`tagKind\`
(ChangeKind), a human-label \`source\`, an optional \`sourceTarget\` cross-link, and \`edges\`.
Each edge maps one responsibility (\`what\`) to its new home (\`to\`), with an optional
\`target\` cross-link. Fill \`target.file\`/\`target.sym\` ONLY with a path and symbol name that
appear in the provided file list. If unsure of a target, omit it. An empty relations array is
valid for purely additive PRs. Emit via the emit_relations tool.`,
  );
}

export function user(parsed: ParsedDiff, fileCards: ModelFile[]): string {
  return [
    "Diff summary (paths/status/±counts):",
    summaryContext(parsed),
    "",
    "Files with symbols (your only valid jump targets are these paths and Symbol.names):",
    filesGrounding(fileCards),
  ].join("\n");
}
