/**
 * The Semantic MODEL schema — the SINGLE source of truth for the contract between
 * the generation pipeline (producer) and the frontend (consumer) (§6).
 *
 * This module contains ONLY types + string-literal-union enums + the version
 * constant — no runtime logic, no I/O (§6.1). Imported by both the server
 * pipeline and every client component.
 *
 * Producer legend: [D] deterministic (parser/frontend), [L] LLM-produced (must be
 * structurally validated), [C] computed/derived from ParsedDiff (not the LLM).
 */
import type { ParsedDiff } from "./parsed-diff";
import type { ErrorCode } from "./errors";

/** Bump on ANY breaking change to MODEL or ParsedDiff shape. The frontend asserts
 *  equality and refuses to render on mismatch; the validator FATALs on mismatch.
 *  No migration logic exists — nothing is persisted, so a mismatch => "regenerate". */
export const MODEL_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Enums (string-literal unions so they serialize transparently over SSE/JSON)
// ---------------------------------------------------------------------------

/** Semantic category of a change. Drives chip color + glyph everywhere. [L] */
export type ChangeKind =
  | "added"
  | "removed"
  | "renamed"
  | "moved"
  | "modified"
  | "signature"
  | "style"
  | "cleanup"
  | "imports";

export const CHANGE_KINDS: readonly ChangeKind[] = [
  "added",
  "removed",
  "renamed",
  "moved",
  "modified",
  "signature",
  "style",
  "cleanup",
  "imports",
];

/** What KIND of symbol a level-2 entry is. Drives the monospace glyph. [L] */
export type SymbolKind =
  | "function"
  | "component"
  | "const"
  | "hook"
  | "style"
  | "param"
  | "internal"
  | "imports"
  | "text";

export const SYMBOL_KINDS: readonly SymbolKind[] = [
  "function",
  "component",
  "const",
  "hook",
  "style",
  "param",
  "internal",
  "imports",
  "text",
];

/** Architecture-edge semantics. Drives edge stroke color (level-4 arch). [L] */
export type EdgeType = "subscribe" | "compute" | "guard" | "state" | "render" | "frame";

export const EDGE_TYPES: readonly EdgeType[] = [
  "subscribe",
  "compute",
  "guard",
  "state",
  "render",
  "frame",
];

/** File lifecycle status. [C] derived by statusOf(); validator wins on conflict. */
export type FileStatus = "added" | "deleted" | "modified" | "renamed";

/** Where a story beat / cross-link points. NOTE: 'demo' is OUT of v1. */
export type StoryTargetType = "relations" | "arch" | "symbol" | "file";

/** Architecture node visual template (selects a sub-template glyph). */
export type ArchShape = "ext" | "module" | "fn" | "param" | "state" | "panel";

export const ARCH_SHAPES: readonly ArchShape[] = [
  "ext",
  "module",
  "fn",
  "param",
  "state",
  "panel",
];

// ---------------------------------------------------------------------------
// MODEL types (§6.5)
// ---------------------------------------------------------------------------

export interface Model {
  /** Schema version; MUST equal MODEL_VERSION. [D] */
  modelVersion: number;

  /** Level 0 (Intent). [L] (prose; sanitized at render) */
  meta: {
    title: string;
    summary: string;
  };

  /** Level 0 stats strip. [C] computed from ParsedDiff — NEVER the LLM's numbers. */
  stats: {
    filesChanged: number;
    additions: number;
    deletions: number;
    perFile: Array<{ path: string; additions: number; deletions: number }>;
  };

  /** Level 0 theme chips. [L] */
  themes: Array<{ label: string; kind: ChangeKind }>;

  /** Refactor-trace panel (level 0 + the static arch view). [L] */
  relations: Relation[];

  /** Levels 1 (Files) + 2 (Symbols). [L] (status reconciled with [C]) */
  files: ModelFile[];

  /** Level 4 STATIC architecture diagram. [L] */
  arch: Arch;

  /** Guided story mode. [L] */
  story: StoryBeat[];
}

/** A named alias for the computed stats slice. */
export type ModelStats = Model["stats"];

/** One refactor-trace card. [L] */
export interface Relation {
  title: string;
  tagKind: ChangeKind;
  source: string; // human label, e.g. "src/x.ts (deleted, 71 lines)"
  sourceTarget?: JumpRef;
  edges: Array<{
    what: string; // the responsibility that moved (left chip)
    to: string; // its new home, human label (right chip)
    target?: JumpRef;
  }>;
}

/** Level 1 file card + its level 2 symbols. [L] */
export interface ModelFile {
  path: string; // MUST resolve in ParsedDiff.byPath
  status: FileStatus; // [L] but [C] wins on conflict (validator)
  summary: string;
  kinds: ChangeKind[];
  symbols: Symbol[];
}

/** Level 2 symbol entry. [L] */
export interface Symbol {
  name: string; // display name, e.g. "MapView()"
  kind: SymbolKind;
  change: ChangeKind;
  renamedFrom?: string; // shown struck-through when change==='renamed'
  hunks: number[]; // INDICES into THIS file's ParsedFile.hunks (0..len-1)
  detail: string; // AI explanation; sanitized
}

/** A cross-link / jump target. Serialized as "file#sym" in arch/story, or as a
 *  structured pair in relations. Both forms MUST resolve (§6.6). */
export interface JumpRef {
  file: string; // a path present in ParsedDiff.byPath AND in some MODEL.files[]
  sym: string; // a Symbol.name within that file (or a known pseudo-symbol)
}

// ---- Architecture (STATIC in v1: before/after states only) ----

export interface Arch {
  nodes: ArchNode[];
  edges: ArchEdge[];
  netEffect: Array<{ label: string; kind: ChangeKind; jump?: string /* "file#sym" */ }>;
  /** Optional advisory template-id hint (§9.7); inert in v1, soft-dropped if unknown. */
  preferredViz?: string;
}

export interface ArchNode {
  id: string; // unique within arch.nodes; referenced by edges.from/.to
  label: string;
  sub: string;
  kind: ChangeKind;
  shape: ArchShape; // unknown -> 'module'
  states: { before: ArchNodeState; after: ArchNodeState };
  jump?: string; // "file#sym"; MUST resolve if present
  caption?: string; // sanitized
}

export interface ArchNodeState {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  present: boolean;
}

export interface ArchEdge {
  id: string;
  from: string; // an ArchNode.id; MUST exist
  to: string; // an ArchNode.id; MUST exist
  type: EdgeType;
  label: string;
  states: { before: ArchEdgeState; after: ArchEdgeState };
  metric?: { before: string; after: string };
}

export interface ArchEdgeState {
  present: boolean;
  from?: string; // optional re-parented endpoint override (ArchNode.id)
  to?: string;
}

// ---- Story mode ----

export interface StoryBeat {
  id: string; // unique; usable in URL-hash deep links / React key
  kind: ChangeKind;
  level: 0 | 1 | 2 | 3 | 4;
  title: string; // sanitized
  body: string; // sanitized
  target: StoryTarget;
  asides: Array<{ label: string; body: string }>;
}

/** Discriminated by `type`. 'demo' is OUT of v1 (validator drops such beats). */
export type StoryTarget =
  | { type: "relations" }
  | { type: "arch" }
  | { type: "symbol"; file: string; name: string }
  | { type: "file"; file: string };

// ---------------------------------------------------------------------------
// Validation report (produced by validate.ts, carried by the `done` SSE event)
// ---------------------------------------------------------------------------

export type CorrectablePath = ModelPatch["path"] | "stats";

export interface ValidationReport {
  dropped: string[]; // human-readable list of repaired/dropped references
  fatal: string[]; // unrecoverable problems (caller aborts generation)
  correctedPaths: CorrectablePath[]; // top-level slices whose value was mutated
}

// ---------------------------------------------------------------------------
// SSE wire protocol (§2.6 — authoritative). Each frame: `event: <name>` + `data:`.
// ---------------------------------------------------------------------------

export type StageName = "intent" | "files" | "symbols" | "relations" | "arch" | "story";

export const STAGE_NAMES: readonly StageName[] = [
  "intent",
  "files",
  "symbols",
  "relations",
  "arch",
  "story",
];

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
}

/** A patch sets one top-level MODEL slice produced by a stage. Path = MODEL key.
 *  `files` merges append-by-path/later-wins; all others are last-write-replace.
 *  `stats` is NEVER a patch — it ships once inside the `parsed` event. */
export type ModelPatch =
  | { path: "meta"; value: Model["meta"] }
  | { path: "themes"; value: Model["themes"] }
  | { path: "files"; value: Model["files"] }
  | { path: "relations"; value: Model["relations"] }
  | { path: "arch"; value: Model["arch"] }
  | { path: "story"; value: Model["story"] };

export type ModelPatchPath = ModelPatch["path"];

export type SseEvent =
  | { event: "estimate"; data: CostEstimate }
  | { event: "parsed"; data: { parsed: ParsedDiff; stats: ModelStats } }
  | { event: "stage-start"; data: { stage: StageName } }
  | { event: "stage-result"; data: { stage: StageName; usage?: TokenUsage } }
  | { event: "model-patch"; data: ModelPatch }
  | { event: "heartbeat"; data: { t: number; stage?: StageName; attempt?: number; delayMs?: number } }
  | { event: "done"; data: { durationMs: number; usage: TokenUsage; report: ValidationReport } }
  | {
      event: "error";
      data: {
        code: ErrorCode;
        message: string;
        stage?: StageName;
        recoverable?: boolean;
        retryAfter?: number;
      };
    };

export type SseEventName = SseEvent["event"];

// ---------------------------------------------------------------------------
// Pre-flight cost/time estimate (reconciled §2.5 + §4.6 + §5.6)
// ---------------------------------------------------------------------------

export interface CostEstimate {
  // identity / UI (§2.5)
  repo: string;
  prNumber: number;
  title: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  // computation core (§5.6)
  changedLines: number; // additions + deletions
  withinCap: boolean;
  est: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
  };
  usdLow: number;
  usdHigh: number;
  etaSecondsLow: number;
  etaSecondsHigh: number;
  model: "claude-opus-4-8";
}
