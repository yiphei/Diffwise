/**
 * In-process rate limiting + concurrency control for generation (§10.7).
 *
 * Acceptable for the single-container v1 (LOCKED); MUST move to a shared store if
 * horizontally scaled (documented). All limits are keyed by `userId` plus one
 * global container semaphore.
 *
 * Limits (env-tunable):
 * - Concurrent generations per user = 1 → GENERATION_IN_PROGRESS
 * - Generations / minute  = RATE_LIMIT_GEN_PER_MIN  → retryAfter (seconds)
 * - Generations / hour    = RATE_LIMIT_GEN_PER_HOUR → retryAfter (seconds)
 * - Global in-flight       = MAX_CONCURRENT_GENERATIONS → SERVER_BUSY
 */
import type { ErrorCode } from "@/lib/model/errors";
import { env } from "@/server/config/env";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * 60_000;

/** Per-user state. Timestamps are kept as rolling windows (fixed-window-ish). */
interface UserState {
  inProgress: boolean;
  minuteHits: number[]; // epoch-ms timestamps within the last minute
  hourHits: number[]; // epoch-ms timestamps within the last hour
}

const users = new Map<string, UserState>();

/** Count of currently in-flight generations across all users (global semaphore). */
let globalInFlight = 0;

function getState(userId: string): UserState {
  let s = users.get(userId);
  if (!s) {
    s = { inProgress: false, minuteHits: [], hourHits: [] };
    users.set(userId, s);
  }
  return s;
}

/** Drop timestamps older than `windowMs` from `now`. Returns the pruned array. */
function prune(hits: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  return hits.filter((t) => t > cutoff);
}

/** Seconds until the oldest hit in `hits` ages out of `windowMs`. */
function retryAfterSec(hits: number[], now: number, windowMs: number): number {
  if (hits.length === 0) return Math.ceil(windowMs / 1000);
  const oldest = Math.min(...hits);
  const ms = oldest + windowMs - now;
  return Math.max(1, Math.ceil(ms / 1000));
}

export type AcquireResult =
  | { ok: true; release: () => void }
  | { ok: false; code: ErrorCode; retryAfter?: number };

/**
 * Try to acquire a generation slot for `userId`. On success returns a `release`
 * callback that frees the per-user concurrent flag AND the global slot — the
 * caller MUST invoke it exactly once when the generation finishes (or aborts).
 */
export async function acquireGenerationSlot(userId: string): Promise<AcquireResult> {
  const now = Date.now();
  const s = getState(userId);

  // Prune rolling windows first.
  s.minuteHits = prune(s.minuteHits, now, MINUTE_MS);
  s.hourHits = prune(s.hourHits, now, HOUR_MS);

  // 1) Per-user concurrent = 1.
  if (s.inProgress) {
    return { ok: false, code: "GENERATION_IN_PROGRESS" };
  }

  // 2) Per-minute window.
  if (s.minuteHits.length >= env.RATE_LIMIT_GEN_PER_MIN) {
    return {
      ok: false,
      code: "GENERATION_IN_PROGRESS",
      retryAfter: retryAfterSec(s.minuteHits, now, MINUTE_MS),
    };
  }

  // 3) Per-hour window.
  if (s.hourHits.length >= env.RATE_LIMIT_GEN_PER_HOUR) {
    return {
      ok: false,
      code: "GENERATION_IN_PROGRESS",
      retryAfter: retryAfterSec(s.hourHits, now, HOUR_MS),
    };
  }

  // 4) Global container semaphore.
  if (globalInFlight >= env.MAX_CONCURRENT_GENERATIONS) {
    return { ok: false, code: "SERVER_BUSY" };
  }

  // Reserve the slot.
  s.inProgress = true;
  s.minuteHits.push(now);
  s.hourHits.push(now);
  globalInFlight += 1;

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    const cur = users.get(userId);
    if (cur) cur.inProgress = false;
    if (globalInFlight > 0) globalInFlight -= 1;
  };

  return { ok: true, release };
}
