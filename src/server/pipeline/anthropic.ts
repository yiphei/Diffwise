/**
 * The ONLY module that touches the Anthropic SDK (§5.2 / §5.7 / §5.9).
 *
 * `callStage` issues one forced-tool-use `messages.create`, extracts the single
 * `tool_use` block input as the stage's structured slice, retries transient
 * failures with full-jitter backoff, and fails fast on bad-key / bad-request.
 * The plaintext key is supplied per call and never persisted or logged here.
 */
import Anthropic from "@anthropic-ai/sdk";
import { DiffwiseError } from "@/lib/model/errors";
import type { StageName, TokenUsage } from "@/lib/model/model";

/** The single pinned model for every stage (LOCKED). */
export const PIPELINE_MODEL = "claude-opus-4-8" as const;

/** Per-stage extended-thinking token budgets (§5.9). */
export const THINKING_BUDGET: Record<StageName, number> = {
  intent: 4_000,
  files: 6_000,
  symbols: 12_000,
  relations: 8_000,
  arch: 10_000,
  story: 6_000,
};

/** HTTP statuses that are safe to retry (§5.7). 529 = Anthropic overloaded. */
const RETRYABLE = new Set<number>([408, 409, 429, 500, 502, 503, 504, 529]);

const MAX_ATTEMPTS = 4;
const BACKOFF_CAP_MS = 16_000;

/**
 * Exponential backoff with full jitter (§5.7). Honors an explicit `retry-after`
 * (seconds) when present, otherwise picks a random delay in `[0, min(base,cap)]`
 * where `base = 1s * 2^(attempt-1)` (1s, 2s, 4s, 8s...).
 */
function backoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec !== undefined && retryAfterSec > 0) {
    return Math.min(retryAfterSec * 1000, BACKOFF_CAP_MS);
  }
  const base = 1000 * 2 ** (attempt - 1);
  return Math.floor(Math.random() * Math.min(base, BACKOFF_CAP_MS));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DiffwiseError("GENERATION_INTERRUPTED"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DiffwiseError("GENERATION_INTERRUPTED"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Pull the numeric HTTP status off an Anthropic SDK error, if any. */
function statusOf(err: unknown): number | undefined {
  if (err instanceof Anthropic.APIError) {
    const s = (err as { status?: number | undefined }).status;
    return typeof s === "number" ? s : undefined;
  }
  return undefined;
}

/** Parse a `retry-after` header (seconds) off an Anthropic SDK error. */
function retryAfterOf(err: unknown): number | undefined {
  if (err instanceof Anthropic.APIError) {
    const headers = (err as { headers?: unknown }).headers;
    let raw: string | null | undefined;
    if (headers instanceof Headers) {
      raw = headers.get("retry-after");
    } else if (headers && typeof headers === "object") {
      const h = headers as Record<string, unknown>;
      const v = h["retry-after"] ?? h["Retry-After"];
      raw = typeof v === "string" ? v : undefined;
    }
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return undefined;
}

/** True for user-abort / connection-timeout / generic network errors (retryable). */
function isNetworkOrTimeout(err: unknown): boolean {
  return (
    err instanceof Anthropic.APIConnectionError ||
    err instanceof Anthropic.APIConnectionTimeoutError
  );
}

/** Map an Anthropic error to the right terminal DiffwiseError (§5.7). */
function toStageError(err: unknown): DiffwiseError {
  const status = statusOf(err);
  if (status === 401 || status === 403) {
    return new DiffwiseError("INVALID_BYOK_KEY", { cause: err });
  }
  if (status === 429) {
    return new DiffwiseError("ANTHROPIC_RATE_LIMIT", {
      retryAfterSec: retryAfterOf(err),
      cause: err,
    });
  }
  return new DiffwiseError("ANTHROPIC_ERROR", { cause: err });
}

/**
 * Minimal liveness/credential probe (§ Secrets & BYOK). Returns `true` if the
 * key works, `false` on 401/403 (bad/expired key), and rethrows anything else
 * (network, overloaded) so the caller can decide.
 */
export async function anthropicTestCall(apiKey: string): Promise<boolean> {
  const client = new Anthropic({ apiKey });
  try {
    await client.messages.create({
      model: PIPELINE_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return true;
  } catch (err) {
    const status = statusOf(err);
    if (status === 401 || status === 403) return false;
    throw err;
  }
}

export interface CallStageArgs {
  apiKey: string;
  system: string;
  user: string;
  tool: Anthropic.Tool;
  maxOutputTokens: number;
  thinkingBudget: number;
  signal: AbortSignal;
  onRetry?: (attempt: number, status: number, delayMs: number) => void;
}

/**
 * One stage call: forces a single tool use whose `input` IS the stage's MODEL
 * slice, retries transient failures, and returns the parsed slice + usage.
 */
export async function callStage<T>(
  args: CallStageArgs,
): Promise<{ value: T; usage: TokenUsage }> {
  const {
    apiKey,
    system,
    user,
    tool,
    maxOutputTokens,
    thinkingBudget,
    signal,
    onRetry,
  } = args;

  const client = new Anthropic({ apiKey });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) throw new DiffwiseError("GENERATION_INTERRUPTED");
    try {
      const message = await client.messages.create(
        {
          model: PIPELINE_MODEL,
          // Thinking tokens count toward the output budget in the API.
          max_tokens: maxOutputTokens + thinkingBudget,
          thinking: { type: "enabled", budget_tokens: thinkingBudget },
          tools: [tool],
          tool_choice: { type: "tool", name: tool.name },
          system,
          messages: [{ role: "user", content: user }],
        },
        { signal },
      );

      const block = message.content.find(
        (b): b is Anthropic.ToolUseBlock =>
          b.type === "tool_use" && b.name === tool.name,
      );
      if (!block) {
        // Forced tool use should always yield a tool_use block; a missing one is
        // a malformed/unusable response, not retryable as a transient.
        throw new DiffwiseError("VALIDATION_FAILED", {
          message: "Model did not return the expected structured result.",
        });
      }

      const usage: TokenUsage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        // Thinking tokens are billed as output; the SDK folds them into
        // output_tokens. Surface 0 (no separate field) to keep the field present.
        thinkingTokens: 0,
      };

      return { value: block.input as T, usage };
    } catch (err) {
      if (err instanceof DiffwiseError) throw err;

      const status = statusOf(err);

      // Fail fast on bad request / bad key (§5.7).
      if (status === 400) {
        throw new DiffwiseError("ANTHROPIC_ERROR", { cause: err });
      }
      if (status === 401 || status === 403) {
        throw new DiffwiseError("INVALID_BYOK_KEY", { cause: err });
      }

      const retryable =
        (status !== undefined && RETRYABLE.has(status)) || isNetworkOrTimeout(err);

      if (!retryable || attempt >= MAX_ATTEMPTS) {
        throw toStageError(err);
      }

      const delay = backoffMs(attempt, retryAfterOf(err));
      onRetry?.(attempt, status ?? 0, delay);
      await sleep(delay, signal);
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new DiffwiseError("ANTHROPIC_ERROR");
}
