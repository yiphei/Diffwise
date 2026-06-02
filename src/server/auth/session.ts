/**
 * Server-side opaque-token sessions (§3.4) — NOT JWT, so sign-out revokes instantly.
 *
 * - Token: 32 random bytes, base64url, sent to the browser in the `dw_session`
 *   cookie. Only its SHA-256 hash is persisted (`sessions.token_hash`), so a DB
 *   leak yields no usable tokens.
 * - Cookie: HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age = 30d (rolling).
 * - `resolveSession` prunes expired rows lazily, updates `last_seen_at`, and slides
 *   `expires_at` forward when >1d has elapsed (rolling renewal).
 */
import { randomBytes, createHash } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import type { User } from "@/server/db/schema";

export const SESSION_COOKIE = "dw_session";

const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_SEC = SESSION_TTL_DAYS * 24 * 60 * 60;
/** Slide expiry / re-set the cookie only after this much idle has elapsed. */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

/** SHA-256 of the raw token -> BYTEA stored in `sessions.token_hash`. */
function sha256(input: string): Buffer {
  return createHash("sha256").update(input, "utf8").digest();
}

/** Best-effort client IP from x-forwarded-for (first hop), salted+hashed for triage. */
function hashIp(req: Request): Buffer | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const ip = xff.split(",")[0]?.trim();
  if (!ip) return null;
  return createHash("sha256").update(ip, "utf8").digest();
}

/**
 * Create a new session row and return the RAW (un-hashed) token for the cookie.
 * Stores only the hash, the user-agent, and a hashed IP (§3.4).
 */
export async function createSession(userId: string, req: Request): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const userAgent = req.headers.get("user-agent");
  const ipHash = hashIp(req);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
    userAgent: userAgent ?? null,
    ipHash: ipHash ?? null,
  });

  return raw;
}

/**
 * Resolve a raw cookie token to its user, or null if absent/expired/unknown.
 * Prunes the row on expiry; rolling-renews `expires_at` + bumps `last_seen_at`
 * when more than a day has elapsed (§3.4).
 */
export async function resolveSession(rawToken: string): Promise<{ user: User } | null> {
  if (!rawToken) return null;
  const tokenHash = sha256(rawToken);

  const row = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, tokenHash),
  });
  if (!row) return null;

  const now = Date.now();
  if (row.expiresAt.getTime() < now) {
    // Lazy prune of an expired session.
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, row.userId),
  });
  if (!user) return null;

  // Rolling renewal: only write when meaningfully stale, to avoid a write per request.
  if (now - row.lastSeenAt.getTime() > RENEW_AFTER_MS) {
    await db
      .update(sessions)
      .set({
        lastSeenAt: new Date(now),
        expiresAt: new Date(now + SESSION_TTL_MS),
      })
      .where(eq(sessions.tokenHash, tokenHash));
  }

  return { user };
}

/** Destroy a session by its raw token (sign-out). Idempotent. */
export async function destroySession(rawToken: string): Promise<void> {
  if (!rawToken) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(rawToken)));
}

/** Periodic-sweep helper (also runnable via db/client startSessionSweep). */
export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/** Set-Cookie for a fresh/renewed session (§3.4 cookie flags). */
export function buildSessionCookie(raw: string): string {
  return [
    `${SESSION_COOKIE}=${raw}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
  ].join("; ");
}

/** Set-Cookie that immediately clears the session cookie (sign-out). */
export function buildClearSessionCookie(): string {
  return [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ].join("; ");
}

/** Parse a single cookie value from the request's `Cookie` header (handlers don't
 *  use next/headers cookies() per project convention). */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const k = part.slice(0, eqIdx).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return null;
}
