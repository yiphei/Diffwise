/**
 * Single auth guard for authenticated route handlers (§3.8). Resolves the
 * `dw_session` opaque-token cookie via resolveSession (authoritative, DB-backed)
 * and throws HttpError(401) when absent or invalid. API routes catch HttpError
 * and return 401 JSON (they do NOT redirect — only the root middleware redirects
 * page navigations).
 */
import { resolveSession, readCookie, SESSION_COOKIE } from "@/server/auth/session";
import type { User } from "@/server/db/schema";

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Resolve the current user or throw HttpError(401). */
export async function requireUser(req: Request): Promise<User> {
  const raw = readCookie(req, SESSION_COOKIE);
  if (!raw) throw new HttpError(401, "unauthenticated");

  const resolved = await resolveSession(raw);
  if (!resolved) throw new HttpError(401, "unauthenticated");

  return resolved.user;
}
