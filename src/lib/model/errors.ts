/**
 * The SINGLE canonical error-code union for the whole codebase (tech-spec §10.9).
 * Every API/SSE error references exactly these members — no parallel enums.
 * Superseded aliases (do NOT reintroduce): NOT_SIGNED_IN, NO_ACCESS, OVER_CAP,
 * PR_TOO_LARGE, EMPTY_DIFF, BINARY_ONLY, GITHUB_ERROR, RATE_LIMITED, BAD_INPUT.
 */
export type ErrorCode =
  // auth / credentials
  | "AUTH_REQUIRED"
  | "NO_BYOK_KEY"
  | "INVALID_BYOK_KEY"
  // github fetch
  | "GITHUB_ACCESS_DENIED"
  | "PR_NOT_FOUND"
  | "PR_OVER_LINE_CAP"
  | "EMPTY_OR_BINARY_DIFF"
  | "GITHUB_UNAVAILABLE"
  | "GITHUB_RATE_LIMITED"
  // anthropic / generation
  | "ANTHROPIC_ERROR"
  | "ANTHROPIC_RATE_LIMIT"
  | "VALIDATION_FAILED"
  | "GENERATION_INTERRUPTED"
  // rate limiting / capacity
  | "GENERATION_IN_PROGRESS"
  | "SERVER_BUSY"
  // input
  | "INVALID_INPUT"
  | "INTERNAL";

/** Default HTTP status for request/response errors (§10.9). In-stream-only codes
 *  (ANTHROPIC_*, VALIDATION_FAILED, GENERATION_INTERRUPTED) map to 500 if ever
 *  surfaced over HTTP, but are normally delivered as an SSE `error` event. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  NO_BYOK_KEY: 400,
  INVALID_BYOK_KEY: 400,
  GITHUB_ACCESS_DENIED: 403,
  PR_NOT_FOUND: 404,
  PR_OVER_LINE_CAP: 422,
  EMPTY_OR_BINARY_DIFF: 422,
  GITHUB_UNAVAILABLE: 502,
  GITHUB_RATE_LIMITED: 429,
  ANTHROPIC_ERROR: 502,
  ANTHROPIC_RATE_LIMIT: 429,
  VALIDATION_FAILED: 500,
  GENERATION_INTERRUPTED: 499,
  GENERATION_IN_PROGRESS: 429,
  SERVER_BUSY: 503,
  INVALID_INPUT: 400,
  INTERNAL: 500,
};

/** Static fallback user-facing messages (§10.9). Parametrized variants are built
 *  at the call site (interpolating only non-content values: owner/repo/number/total). */
export const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  AUTH_REQUIRED: "You're not signed in. Sign in with GitHub to generate a review.",
  NO_BYOK_KEY:
    "Add your Anthropic API key to generate a review. Your key is encrypted and never leaves the server.",
  INVALID_BYOK_KEY: "That Anthropic API key was rejected. Check the key and try again.",
  GITHUB_ACCESS_DENIED:
    "Diffwise can't access this repository with your GitHub permissions. Check that you have access to it.",
  PR_NOT_FOUND: "Couldn't find that PR. Double-check the repo and PR number.",
  PR_OVER_LINE_CAP:
    "This PR is over Diffwise's 10,000-line limit. Diffwise reviews the whole PR at once and can't review a PR this large in v1.",
  EMPTY_OR_BINARY_DIFF:
    "This PR has no reviewable text changes (it's empty or only contains binary files).",
  GITHUB_UNAVAILABLE: "GitHub couldn't be reached right now. Try generating again in a moment.",
  GITHUB_RATE_LIMITED:
    "GitHub rate-limited this request on your account. Wait a moment and try again.",
  ANTHROPIC_ERROR:
    "The AI generation step failed. This is usually a temporary Anthropic issue — try generating again.",
  ANTHROPIC_RATE_LIMIT: "Anthropic rate-limited this request. Wait a moment and try again.",
  VALIDATION_FAILED: "The AI returned a result Diffwise couldn't use. Try generating again.",
  GENERATION_INTERRUPTED:
    "Generation was interrupted before it finished. Nothing was saved — generate again to retry.",
  GENERATION_IN_PROGRESS:
    "A review is already generating in this account. Wait for it to finish before starting another.",
  SERVER_BUSY: "Diffwise is busy right now. Try again in a few seconds.",
  INVALID_INPUT: "That doesn't look like a valid repository or PR number.",
  INTERNAL: "Something went wrong on Diffwise's side. Try again — if it keeps happening, the issue is on us.",
};

export interface DiffwiseErrorOptions {
  /** Overrides the default user-facing message (must contain only non-content values). */
  message?: string;
  retryAfterSec?: number;
  changedLines?: number;
  limit?: number;
  /** Original error for server-side logging (never sent to the client). */
  cause?: unknown;
}

/**
 * The single error type thrown across fetch/parse/pipeline. Carries a stable
 * `code`, a user-facing `message` (rendered verbatim, as TEXT), and optional
 * structured fields. Never include raw diff/model content in `message`.
 */
export class DiffwiseError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;
  readonly retryAfterSec?: number;
  readonly changedLines?: number;
  readonly limit?: number;

  constructor(code: ErrorCode, opts: DiffwiseErrorOptions = {}) {
    const userMessage = opts.message ?? DEFAULT_MESSAGES[code];
    super(userMessage, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "DiffwiseError";
    this.code = code;
    this.httpStatus = ERROR_HTTP_STATUS[code];
    this.userMessage = userMessage;
    if (opts.retryAfterSec !== undefined) this.retryAfterSec = opts.retryAfterSec;
    if (opts.changedLines !== undefined) this.changedLines = opts.changedLines;
    if (opts.limit !== undefined) this.limit = opts.limit;
  }

  /** The JSON body / SSE `error` payload shape. */
  toPayload(): {
    code: ErrorCode;
    message: string;
    retryAfter?: number;
    changedLines?: number;
    limit?: number;
  } {
    return {
      code: this.code,
      message: this.userMessage,
      ...(this.retryAfterSec !== undefined ? { retryAfter: this.retryAfterSec } : {}),
      ...(this.changedLines !== undefined ? { changedLines: this.changedLines } : {}),
      ...(this.limit !== undefined ? { limit: this.limit } : {}),
    };
  }
}

export function isDiffwiseError(e: unknown): e is DiffwiseError {
  return e instanceof DiffwiseError;
}

/** Coerce any thrown value into a DiffwiseError (default INTERNAL). */
export function toDiffwiseError(e: unknown): DiffwiseError {
  if (isDiffwiseError(e)) return e;
  return new DiffwiseError("INTERNAL", { cause: e });
}
