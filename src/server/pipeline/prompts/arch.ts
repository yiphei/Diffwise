/**
 * Stage `arch` prompts (§5.4). Produces a STATIC before→after wiring diagram
 * (nodes/edges/netEffect). v1: before/after states only, no timeline.
 */
import type { ModelFile, Relation } from "@/lib/model/model";
import type { ParsedDiff } from "@/lib/model/parsed-diff";
import { withPreamble } from "./common";
import { summaryContext, symbolsGrounding, relationsGrounding } from "../context";

export function system(): string {
  return withPreamble(
    `STAGE: arch.
Produce a small before→after wiring diagram (aim 4–10 nodes, 3–12 edges). It is STATIC:
each node and edge has only a \`before\` and an \`after\` state — no timeline, no intermediate
keyframes.
- Each node has \`id\`, \`label\`, \`sub\`, \`kind\` (ChangeKind), \`shape\` (one of ext, module, fn,
  param, state, panel; if unsure use "module"), and \`states.before\`/\`states.after\` each with
  normalized \`x\`,\`y\` in 0..1 and a \`present\` flag (false = absent in that state).
- Lay nodes out left→right roughly following data flow; avoid overlaps.
- Each edge has \`id\`, \`from\`, \`to\` (existing node ids), \`type\` (subscribe, compute, guard,
  state, render, frame), \`label\`, and \`states.before\`/\`states.after\` each with a \`present\`
  flag (and optional re-parented \`from\`/\`to\`). Optional \`metric.before\`/\`metric.after\`.
- \`node.jump\` ("file#sym") and \`netEffect[].jump\` MUST point at a real path + Symbol.name.
An empty or minimal arch is acceptable. Emit via the emit_arch tool.`,
  );
}

export function user(parsed: ParsedDiff, fileCards: ModelFile[], relations: Relation[]): string {
  return [
    "Diff summary (paths/status/±counts):",
    summaryContext(parsed),
    "",
    "Symbol inventory (valid jump targets are these path#name pairs):",
    symbolsGrounding(fileCards),
    "",
    "Relations (refactor traces to ground the wiring):",
    relationsGrounding(relations),
  ].join("\n");
}
