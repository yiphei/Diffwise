/**
 * The pipeline orchestrator (§5.3). Drives the six stages in dependency order,
 * emits the §2.6 SSE events, runs the mandatory structural validation, and emits
 * the terminal `done` event. It is the only place credentials are resolved (once,
 * JIT-decrypted, in-memory only — never logged).
 *
 * Stage → patch mapping (§2.6):
 *   intent    → model-patch meta, then model-patch themes
 *   files     → model-patch files (cards, no symbols)
 *   symbols   → model-patch files (cards merged with symbols, append-by-path/later-wins)
 *   relations → model-patch relations
 *   arch      → model-patch arch
 *   story     → model-patch story
 */
import {
  MODEL_VERSION,
  type Arch,
  type ChangeKind,
  type CostEstimate,
  type Model,
  type ModelFile,
  type Relation,
  type StageName,
  type StoryBeat,
  type Symbol,
  type TokenUsage,
} from "@/lib/model/model";
import { computeStats, type ParsedDiff, type ParsedFile } from "@/lib/model/parsed-diff";
import { validateModel } from "@/lib/model/validate";
import { DiffwiseError } from "@/lib/model/errors";
import type { CorrectablePath, ModelPatch, SseEvent } from "@/lib/model/model";
import { logger } from "@/lib/log";
import type { LLMCredentialSource } from "@/server/credentials/source";
import type { PrMeta } from "@/server/github/provider";
import { callStage, THINKING_BUDGET } from "./anthropic";
import { perFileContext } from "./context";
import { STAGE_TOOLS } from "./tools";
import * as intentPrompt from "./prompts/intent";
import * as filesPrompt from "./prompts/files";
import * as symbolsPrompt from "./prompts/symbols";
import * as relationsPrompt from "./prompts/relations";
import * as archPrompt from "./prompts/arch";
import * as storyPrompt from "./prompts/story";

/** Per-stage structured-output budgets (excluding thinking; §5.4). */
const OUTPUT_BUDGET: Record<StageName, number> = {
  intent: 1_500,
  files: 6_000,
  symbols: 12_000,
  relations: 4_000,
  arch: 6_000,
  story: 5_000,
};

/**
 * Target input-token budget for a single `files`/`symbols` call (§5.4.1). If the
 * per-file serialized context exceeds this, files are split into per-file-atomic
 * batches run in parallel and concatenated in original order.
 */
const STAGE_CONTEXT_BUDGET_TOKENS = 120_000;
const CHARS_PER_TOKEN = 3.5;

// ---- stage output shapes (the tool input_schema slices) --------------------

interface IntentOut {
  meta: { title: string; summary: string };
  themes: Array<{ label: string; kind: ChangeKind }>;
}
interface FilesOut {
  files: Array<{ path: string; status: ModelFile["status"]; summary: string; kinds: ChangeKind[] }>;
}
interface SymbolsOut {
  byFile: Array<{ path: string; symbols: Symbol[] }>;
}
interface RelationsOut {
  relations: Relation[];
}
type ArchOut = Arch;
interface StoryOut {
  story: StoryBeat[];
}

export interface RunPipelineArgs {
  parsed: ParsedDiff;
  prMeta: PrMeta;
  repo: string;
  prNumber: number;
  estimate: CostEstimate;
  creds: LLMCredentialSource;
  userId: string;
  emit: (e: SseEvent) => void;
  signal: AbortSignal;
}

function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    thinkingTokens: (a.thinkingTokens ?? 0) + (b.thinkingTokens ?? 0),
  };
}

/** Split files into per-file-atomic batches whose serialized size fits the budget. */
function batchFiles(parsed: ParsedDiff): ParsedFile[][] {
  const budgetChars = STAGE_CONTEXT_BUDGET_TOKENS * CHARS_PER_TOKEN;
  const batches: ParsedFile[][] = [];
  let current: ParsedFile[] = [];
  let currentChars = 0;

  for (const f of parsed.files) {
    // Approximate this file's serialized size in isolation.
    const fileChars = perFileContext(parsed, [f]).length;
    if (current.length > 0 && currentChars + fileChars > budgetChars) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(f);
    currentChars += fileChars;
  }
  if (current.length > 0) batches.push(current);
  if (batches.length === 0) batches.push([]); // degenerate: empty diff
  return batches;
}

/** Build the per-stage onRetry → heartbeat bridge (§5.7). */
function retryBridge(emit: (e: SseEvent) => void, stage: StageName) {
  return (attempt: number, _status: number, delayMs: number): void => {
    emit({ event: "heartbeat", data: { t: Date.now(), stage, attempt, delayMs } });
  };
}

export async function runPipeline(args: RunPipelineArgs): Promise<void> {
  const { parsed, prMeta, repo, prNumber, estimate, creds, userId, emit, signal } = args;
  const started = Date.now();

  // Resolve the BYOK key ONCE (JIT-decrypt; in-memory only; never logged).
  const resolved = await creds.getAnthropicKey(userId);
  const apiKey = resolved.apiKey;

  // Pre-flight + deterministic slices (estimate already computed by the route).
  emit({ event: "estimate", data: estimate });
  const stats = computeStats(parsed);
  emit({ event: "parsed", data: { parsed, stats } });

  let usage = emptyUsage();
  const intentMeta = { repo, prNumber, title: prMeta.title };

  const checkAbort = (): void => {
    if (signal.aborted) throw new DiffwiseError("GENERATION_INTERRUPTED");
  };

  // ---- intent ∥ files ------------------------------------------------------
  emit({ event: "stage-start", data: { stage: "intent" } });
  emit({ event: "stage-start", data: { stage: "files" } });

  const intentP = callStage<IntentOut>({
    apiKey,
    system: intentPrompt.system(),
    user: intentPrompt.user(parsed, intentMeta),
    tool: STAGE_TOOLS.intent,
    maxOutputTokens: OUTPUT_BUDGET.intent,
    thinkingBudget: THINKING_BUDGET.intent,
    signal,
    onRetry: retryBridge(emit, "intent"),
  }).then((r) => {
    emit({ event: "stage-result", data: { stage: "intent", usage: r.usage } });
    emit({ event: "model-patch", data: { path: "meta", value: r.value.meta } });
    emit({ event: "model-patch", data: { path: "themes", value: r.value.themes } });
    return r;
  });

  const fileBatches = batchFiles(parsed);
  const filesP = runFiles(apiKey, parsed, fileBatches, signal, emit).then((r) => {
    emit({ event: "stage-result", data: { stage: "files", usage: r.usage } });
    emit({ event: "model-patch", data: { path: "files", value: r.cards } });
    return r;
  });

  const [intentRes, filesRes] = await Promise.all([intentP, filesP]);
  usage = addUsage(usage, intentRes.usage);
  usage = addUsage(usage, filesRes.usage);
  checkAbort();

  // ---- symbols (depends files) --------------------------------------------
  emit({ event: "stage-start", data: { stage: "symbols" } });
  const symbolsRes = await runSymbols(apiKey, parsed, filesRes.cards, fileBatches, signal, emit);
  emit({ event: "stage-result", data: { stage: "symbols", usage: symbolsRes.usage } });
  usage = addUsage(usage, symbolsRes.usage);

  const filesWithSymbols = mergeSymbols(filesRes.cards, symbolsRes.byFile);
  // Re-emit files now carrying symbols (append-by-path / later-wins on the client).
  emit({ event: "model-patch", data: { path: "files", value: filesWithSymbols } });
  checkAbort();

  // ---- relations (depends symbols) ----------------------------------------
  emit({ event: "stage-start", data: { stage: "relations" } });
  const relationsRes = await callStage<RelationsOut>({
    apiKey,
    system: relationsPrompt.system(),
    user: relationsPrompt.user(parsed, filesWithSymbols),
    tool: STAGE_TOOLS.relations,
    maxOutputTokens: OUTPUT_BUDGET.relations,
    thinkingBudget: THINKING_BUDGET.relations,
    signal,
    onRetry: retryBridge(emit, "relations"),
  });
  emit({ event: "stage-result", data: { stage: "relations", usage: relationsRes.usage } });
  emit({ event: "model-patch", data: { path: "relations", value: relationsRes.value.relations } });
  usage = addUsage(usage, relationsRes.usage);
  checkAbort();

  // ---- arch (depends symbols, relations) ----------------------------------
  emit({ event: "stage-start", data: { stage: "arch" } });
  const archRes = await callStage<ArchOut>({
    apiKey,
    system: archPrompt.system(),
    user: archPrompt.user(parsed, filesWithSymbols, relationsRes.value.relations),
    tool: STAGE_TOOLS.arch,
    maxOutputTokens: OUTPUT_BUDGET.arch,
    thinkingBudget: THINKING_BUDGET.arch,
    signal,
    onRetry: retryBridge(emit, "arch"),
  });
  emit({ event: "stage-result", data: { stage: "arch", usage: archRes.usage } });
  emit({ event: "model-patch", data: { path: "arch", value: archRes.value } });
  usage = addUsage(usage, archRes.usage);
  checkAbort();

  // ---- story (depends intent, symbols, relations, arch) -------------------
  emit({ event: "stage-start", data: { stage: "story" } });
  const storyRes = await callStage<StoryOut>({
    apiKey,
    system: storyPrompt.system(),
    user: storyPrompt.user(
      parsed,
      intentRes.value,
      filesWithSymbols,
      relationsRes.value.relations,
      archRes.value,
    ),
    tool: STAGE_TOOLS.story,
    maxOutputTokens: OUTPUT_BUDGET.story,
    thinkingBudget: THINKING_BUDGET.story,
    signal,
    onRetry: retryBridge(emit, "story"),
  });
  emit({ event: "stage-result", data: { stage: "story", usage: storyRes.usage } });
  emit({ event: "model-patch", data: { path: "story", value: storyRes.value.story } });
  usage = addUsage(usage, storyRes.usage);
  checkAbort();

  // ---- assemble + deterministic validation (§5.5 / §6.6) ------------------
  const assembled: Model = {
    modelVersion: MODEL_VERSION,
    meta: intentRes.value.meta,
    stats,
    themes: intentRes.value.themes,
    relations: relationsRes.value.relations,
    files: filesWithSymbols,
    arch: archRes.value,
    story: storyRes.value.story,
  };

  const { model: clean, report } = validateModel(assembled, parsed);

  if (report.fatal.length > 0) {
    logger.warn("pipeline.validation.fatal", { repo, prNumber, fatal: report.fatal });
    throw new DiffwiseError("VALIDATION_FAILED");
  }

  // Re-emit only the slices validation mutated (skip 'stats' — never an LLM patch).
  for (const path of report.correctedPaths) {
    const patch = correctedPatch(clean, path);
    if (patch) emit({ event: "model-patch", data: patch });
  }

  emit({
    event: "done",
    data: { durationMs: Date.now() - started, usage, report },
  });
}

// ---------------------------------------------------------------------------
// files stage (with per-file-atomic chunking)
// ---------------------------------------------------------------------------

async function runFiles(
  apiKey: string,
  parsed: ParsedDiff,
  batches: ParsedFile[][],
  signal: AbortSignal,
  emit: (e: SseEvent) => void,
): Promise<{ cards: ModelFile[]; usage: TokenUsage }> {
  const results = await Promise.all(
    batches.map((batch) =>
      callStage<FilesOut>({
        apiKey,
        system: filesPrompt.system(),
        user: filesPrompt.user(parsed, batch),
        tool: STAGE_TOOLS.files,
        maxOutputTokens: OUTPUT_BUDGET.files,
        thinkingBudget: THINKING_BUDGET.files,
        signal,
        onRetry: retryBridge(emit, "files"),
      }),
    ),
  );

  let usage = emptyUsage();
  const cards: ModelFile[] = [];
  for (const r of results) {
    usage = addUsage(usage, r.usage);
    for (const c of r.value.files) {
      cards.push({
        path: c.path,
        status: c.status,
        summary: c.summary,
        kinds: c.kinds ?? [],
        symbols: [], // symbols attached by the symbols stage
      });
    }
  }
  return { cards, usage };
}

// ---------------------------------------------------------------------------
// symbols stage (with per-file-atomic chunking)
// ---------------------------------------------------------------------------

async function runSymbols(
  apiKey: string,
  parsed: ParsedDiff,
  fileCards: ModelFile[],
  batches: ParsedFile[][],
  signal: AbortSignal,
  emit: (e: SseEvent) => void,
): Promise<{ byFile: Array<{ path: string; symbols: Symbol[] }>; usage: TokenUsage }> {
  const results = await Promise.all(
    batches.map((batch) =>
      callStage<SymbolsOut>({
        apiKey,
        system: symbolsPrompt.system(),
        user: symbolsPrompt.user(parsed, fileCards, batch),
        tool: STAGE_TOOLS.symbols,
        maxOutputTokens: OUTPUT_BUDGET.symbols,
        thinkingBudget: THINKING_BUDGET.symbols,
        signal,
        onRetry: retryBridge(emit, "symbols"),
      }),
    ),
  );

  let usage = emptyUsage();
  const byFile: Array<{ path: string; symbols: Symbol[] }> = [];
  for (const r of results) {
    usage = addUsage(usage, r.usage);
    for (const entry of r.value.byFile) byFile.push(entry);
  }
  return { byFile, usage };
}

/** Merge symbol arrays onto file cards by path (§5.3 mergeSymbols). */
function mergeSymbols(
  cards: ModelFile[],
  byFile: Array<{ path: string; symbols: Symbol[] }>,
): ModelFile[] {
  const symMap = new Map<string, Symbol[]>();
  for (const entry of byFile) {
    const existing = symMap.get(entry.path);
    if (existing) existing.push(...(entry.symbols ?? []));
    else symMap.set(entry.path, [...(entry.symbols ?? [])]);
  }
  return cards.map((c) => ({
    ...c,
    symbols: symMap.get(c.path) ?? c.symbols ?? [],
  }));
}

/**
 * Build a typed `ModelPatch` for a validation-corrected top-level slice. Returns
 * `null` for 'stats' (never an LLM patch). This narrows `clean[path]` to the
 * exact value type for each `ModelPatch` variant.
 */
function correctedPatch(model: Model, path: CorrectablePath): ModelPatch | null {
  switch (path) {
    case "meta":
      return { path: "meta", value: model.meta };
    case "themes":
      return { path: "themes", value: model.themes };
    case "files":
      return { path: "files", value: model.files };
    case "relations":
      return { path: "relations", value: model.relations };
    case "arch":
      return { path: "arch", value: model.arch };
    case "story":
      return { path: "story", value: model.story };
    case "stats":
      return null;
    default:
      return null;
  }
}
