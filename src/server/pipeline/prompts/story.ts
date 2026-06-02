/**
 * Stage `story` prompts (§5.4). Produces a guided sequence of story beats.
 */
import type { Arch, ModelFile, Relation } from "@/lib/model/model";
import type { ParsedDiff } from "@/lib/model/parsed-diff";
import { withPreamble } from "./common";
import {
  summaryContext,
  symbolsGrounding,
  relationsGrounding,
  archGrounding,
} from "../context";

export interface StoryIntent {
  meta: { title: string; summary: string };
  themes: Array<{ label: string; kind: string }>;
}

export function system(): string {
  return withPreamble(
    `STAGE: story.
Write a guided sequence of 4–8 beats that walks a reader through the change as a narrative.
Each beat has \`id\` (unique), \`kind\` (ChangeKind), \`level\` (an integer 0–4 zoom level it
forces), \`title\`, \`body\`, a \`target\`, and \`asides\`.
The \`target\` spotlights one of EXACTLY these four types:
- {type:"relations"} — the relations panel,
- {type:"arch"} — the arch diagram,
- {type:"symbol", file, name} — a symbol; file+name MUST resolve to a real symbol,
- {type:"file", file} — a file; file MUST resolve to a real ModelFile.path.
Do NOT use any other target.type. Each \`aside\` is a click-to-reveal "why": a question \`label\`
and its answer \`body\`. Emit via the emit_story tool.`,
  );
}

export function user(
  parsed: ParsedDiff,
  intent: StoryIntent,
  fileCards: ModelFile[],
  relations: Relation[],
  arch: Arch,
): string {
  return [
    `TITLE: ${intent.meta.title}`,
    `SUMMARY: ${intent.meta.summary}`,
    `THEMES: ${intent.themes.map((t) => `${t.label} (${t.kind})`).join(", ")}`,
    "",
    "Diff summary (paths/status/±counts):",
    summaryContext(parsed),
    "",
    "Symbol inventory (valid {type:symbol} targets are these path#name pairs):",
    symbolsGrounding(fileCards),
    "",
    "Relations:",
    relationsGrounding(relations),
    "",
    "Arch (node ids + jump targets):",
    archGrounding(arch),
  ].join("\n");
}
