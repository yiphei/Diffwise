/**
 * Pre-flight cost + time estimation (§5.6 / §2.5). Computed from diff size alone —
 * NO LLM call. Surfaced via the SSE `estimate` event before any stage runs and
 * also obtainable synchronously for the confirm screen.
 *
 * The 10k-line hard cap is enforced in `@/server/diff/guards`; this module only
 * reports `withinCap` for display. The route gates generation on the cap.
 */
import type { CostEstimate } from "@/lib/model/model";
import { changedLines, computeStats, type ParsedDiff } from "@/lib/model/parsed-diff";
import { env } from "@/server/config/env";
import { PIPELINE_MODEL, THINKING_BUDGET } from "./anthropic";
import { parsedToContext, perFileContext, summaryContext } from "./context";

/**
 * Pinned per-token prices for claude-opus-4-8 (USD per million tokens). Thinking
 * tokens are billed at the output rate. Tunable in one place (§5.6 step 4).
 */
export const ANTHROPIC_PRICE_OPUS_4_8 = {
  inputPerMTok: 15,
  outputPerMTok: 75,
} as const;

/** ≈ chars / 3.5 — conservative for code (§5.6 step 2). */
const CHARS_PER_TOKEN = 3.5;

/** Per-stage structured-output budgets (the max_tokens slice, excluding thinking). */
const OUTPUT_BUDGET = {
  intent: 1_500,
  files: 6_000,
  symbols: 12_000,
  relations: 4_000,
  arch: 6_000,
  story: 5_000,
} as const;

/** Latency model constants (§5.6 step 5). */
const PER_CALL_OVERHEAD_SEC = 2;
const SEC_PER_1K_OUTPUT_LOW = 1.5;
const SEC_PER_1K_OUTPUT_HIGH = 4.0;

function tokensFromChars(s: string): number {
  return Math.ceil(s.length / CHARS_PER_TOKEN);
}

/**
 * Estimate the per-stage input-token cost from the serialized contexts. Stages
 * intent/relations/arch/story use bounded summaries; files/symbols dominate and
 * scale with the full per-file body.
 */
function estimateInputTokens(parsed: ParsedDiff): number {
  const compact = tokensFromChars(parsedToContext(parsed));
  const full = tokensFromChars(perFileContext(parsed));
  const summary = tokensFromChars(summaryContext(parsed));

  // intent ← compact; files ← full; symbols ← full (+ file-card grounding ~ summary);
  // relations/arch/story ← summary (+ grounding ~ summary).
  return (
    compact + // intent
    full + // files
    full + summary + // symbols
    summary * 2 + // relations
    summary * 2 + // arch
    summary * 2 // story
  );
}

/**
 * Estimate per-stage output tokens, scaled by diff size (more files → more
 * entries) and clamped to each stage's max output budget.
 */
function estimateOutputTokens(parsed: ParsedDiff): number {
  const files = parsed.files.length;
  const lines = changedLines(parsed);
  // Heuristic scale: a few hundred tokens per file for cards/symbols, plus a
  // small per-changed-line factor, clamped per stage.
  const perFile = 220;
  const perLine = 1.2;

  const scaled = (base: number, cap: number): number =>
    Math.min(cap, Math.round(base + files * perFile + lines * perLine * 0.15));

  return (
    Math.min(OUTPUT_BUDGET.intent, 400 + files * 20) +
    scaled(400, OUTPUT_BUDGET.files) +
    scaled(800, OUTPUT_BUDGET.symbols) +
    Math.min(OUTPUT_BUDGET.relations, 200 + files * 80) +
    Math.min(OUTPUT_BUDGET.arch, 600 + files * 60) +
    Math.min(OUTPUT_BUDGET.story, 800 + files * 30)
  );
}

/** Sum of all per-stage thinking budgets (§5.9). Billed at the output rate. */
function totalThinkingTokens(): number {
  return Object.values(THINKING_BUDGET).reduce((s, n) => s + n, 0);
}

/**
 * Compute the pre-flight estimate. `meta` supplies the §2.5 UI identity fields
 * (repo/prNumber/title); the rest is derived from `parsed`.
 */
export function estimateCost(
  parsed: ParsedDiff,
  meta: { repo: string; prNumber: number; title: string },
): CostEstimate {
  const stats = computeStats(parsed);
  const changed = stats.additions + stats.deletions;
  const withinCap = changed <= env.MAX_CHANGED_LINES;

  const inputTokens = estimateInputTokens(parsed);
  const outputTokens = estimateOutputTokens(parsed);
  const thinkingTokens = totalThinkingTokens();

  const inPrice = ANTHROPIC_PRICE_OPUS_4_8.inputPerMTok / 1_000_000;
  const outPrice = ANTHROPIC_PRICE_OPUS_4_8.outputPerMTok / 1_000_000;

  // Output + thinking both bill at the output rate.
  const billedOutputTokens = outputTokens + thinkingTokens;

  // Low band: prompt-cache hits on the shared preamble, zero retries.
  const usdLow = inputTokens * inPrice + billedOutputTokens * outPrice;
  // High band: no caching + one retry per stage (≈ doubles input, +50% output).
  const usdHigh =
    inputTokens * inPrice * 2 + billedOutputTokens * outPrice * 1.5;

  // ETA: critical path = max(intent, files) ∥, then symbols→relations→arch→story
  // sequential. Approximate from the summed output of the critical-path stages
  // plus fixed per-call overhead across the 6 calls.
  const criticalOutput = billedOutputTokens; // upper bound on sequential output
  const calls = 6;
  const etaSecondsLow = Math.round(
    PER_CALL_OVERHEAD_SEC * calls + (criticalOutput / 1000) * SEC_PER_1K_OUTPUT_LOW,
  );
  const etaSecondsHigh = Math.round(
    PER_CALL_OVERHEAD_SEC * calls + (criticalOutput / 1000) * SEC_PER_1K_OUTPUT_HIGH,
  );

  return {
    repo: meta.repo,
    prNumber: meta.prNumber,
    title: meta.title,
    filesChanged: stats.filesChanged,
    additions: stats.additions,
    deletions: stats.deletions,
    changedLines: changed,
    withinCap,
    est: { inputTokens, outputTokens, thinkingTokens },
    usdLow: Number(usdLow.toFixed(4)),
    usdHigh: Number(usdHigh.toFixed(4)),
    etaSecondsLow,
    etaSecondsHigh,
    model: PIPELINE_MODEL,
  };
}
