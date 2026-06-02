/**
 * GitHub rate-limit inspection + mapping helpers (§4.9). Reads the standard
 * `x-ratelimit-*` and `retry-after` headers and maps a limit hit onto the
 * canonical DiffwiseError('GITHUB_RATE_LIMITED', { retryAfterSec }).
 */
import { DiffwiseError } from "@/lib/model/errors";

/** Loosely-typed response-header bag (Octokit/fetch headers). */
export type HeaderBag =
  | Record<string, string | number | undefined>
  | undefined
  | null;

function headerValue(headers: HeaderBag, name: string): string | undefined {
  if (!headers) return undefined;
  const direct = headers[name];
  if (direct !== undefined) return String(direct);
  const lower = headers[name.toLowerCase()];
  return lower === undefined ? undefined : String(lower);
}

/** Parse an integer header, returning undefined when absent/non-numeric. */
function intHeader(headers: HeaderBag, name: string): number | undefined {
  const raw = headerValue(headers, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Remaining requests in the current primary-limit window, if exposed. */
export function rateLimitRemaining(headers: HeaderBag): number | undefined {
  return intHeader(headers, "x-ratelimit-remaining");
}

/** Epoch-seconds reset time of the current primary-limit window, if exposed. */
export function rateLimitReset(headers: HeaderBag): number | undefined {
  return intHeader(headers, "x-ratelimit-reset");
}

/**
 * Compute the retry-after seconds to surface to the user. Prefers an explicit
 * `retry-after` header (secondary/abuse limit), falling back to
 * `x-ratelimit-reset - now`. Returns undefined when nothing is available.
 */
export function retryAfterSeconds(headers: HeaderBag, nowSec = Math.floor(Date.now() / 1000)): number | undefined {
  const retryAfter = intHeader(headers, "retry-after");
  if (retryAfter !== undefined) return Math.max(0, retryAfter);
  const reset = rateLimitReset(headers);
  if (reset !== undefined) return Math.max(0, reset - nowSec);
  return undefined;
}

/**
 * True when these response headers indicate a primary rate-limit hit
 * (`x-ratelimit-remaining: 0`).
 */
export function isPrimaryRateLimited(headers: HeaderBag): boolean {
  return rateLimitRemaining(headers) === 0;
}

/** Build the canonical rate-limit error, surfacing Retry-After when present. */
export function rateLimitError(
  headers: HeaderBag,
  cause?: unknown,
): DiffwiseError {
  const retryAfterSec = retryAfterSeconds(headers);
  return new DiffwiseError("GITHUB_RATE_LIMITED", {
    ...(retryAfterSec !== undefined ? { retryAfterSec } : {}),
    ...(cause !== undefined ? { cause } : {}),
  });
}
