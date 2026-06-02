/**
 * Stage `intent` prompts (§5.4). Produces `meta` (title/summary) + `themes`.
 */
import type { ParsedDiff } from "@/lib/model/parsed-diff";
import { withPreamble } from "./common";
import { parsedToContext } from "../context";

export function system(): string {
  return withPreamble(
    `STAGE: intent.
Produce a one-line title (≤ 80 chars) and a 1–3 sentence summary describing what this PR
accomplishes and why, then 3–7 theme chips. Each theme has a short \`label\` and a \`kind\`
that MUST be one of the ChangeKind values:
added, removed, renamed, moved, modified, signature, style, cleanup, imports.
Base your answer only on the diff between the markers. Emit your result via the emit_intent tool.`,
  );
}

export function user(parsed: ParsedDiff, meta: { repo: string; prNumber: number; title: string }): string {
  return [
    `REPO: ${meta.repo}`,
    `PR #${meta.prNumber}: ${meta.title}`,
    "",
    "Compact whole-diff context (per file: path/status/±counts, all hunk headers, first lines of each hunk):",
    parsedToContext(parsed),
  ].join("\n");
}
