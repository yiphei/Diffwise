/**
 * Small HTTP helpers shared by the route handlers (integration glue).
 */
import { DiffwiseError, toDiffwiseError } from "@/lib/model/errors";
import { requireUser } from "@/server/auth/middleware";
import type { User } from "@/server/db/schema";

/** Build a JSON error Response from any thrown value, mapping to the canonical code. */
export function jsonError(e: unknown): Response {
  const err = toDiffwiseError(e);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (err.retryAfterSec != null) headers["Retry-After"] = String(err.retryAfterSec);
  return new Response(JSON.stringify(err.toPayload()), { status: err.httpStatus, headers });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Resolve the signed-in user or throw a canonical AUTH_REQUIRED DiffwiseError. */
export async function requireUserOrThrow(req: Request): Promise<User> {
  try {
    return await requireUser(req);
  } catch {
    throw new DiffwiseError("AUTH_REQUIRED");
  }
}

const NAME_RE = /^[A-Za-z0-9._-]+$/;

/** Validate + split "owner/name" and a PR number (§10.6.4). Throws INVALID_INPUT. */
export function parseRepoAndPr(repo: unknown, prNumber: unknown): {
  owner: string;
  name: string;
  repo: string;
  prNumber: number;
} {
  if (typeof repo !== "string") throw new DiffwiseError("INVALID_INPUT");
  const parts = repo.split("/");
  if (parts.length !== 2) throw new DiffwiseError("INVALID_INPUT");
  const [owner, name] = parts;
  if (!owner || !name || !NAME_RE.test(owner) || !NAME_RE.test(name)) {
    throw new DiffwiseError("INVALID_INPUT");
  }
  const n = typeof prNumber === "string" ? Number(prNumber) : prNumber;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
    throw new DiffwiseError("INVALID_INPUT");
  }
  return { owner, name, repo: `${owner}/${name}`, prNumber: n };
}
