/**
 * Pooled pg connection + Drizzle client singleton for the long-lived Node server.
 * The Pool constructor does NOT connect until the first query, so importing this
 * module is safe at build time even with a missing/placeholder DATABASE_URL.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  _dwPool?: Pool;
  _dwSweep?: ReturnType<typeof setInterval>;
};

export const pool: Pool =
  globalForDb._dwPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (!globalForDb._dwPool) globalForDb._dwPool = pool;

export const db = drizzle(pool, { schema });

/** Health-check ping (runtime only). */
export async function pingDb(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/** Lazy + periodic prune of expired sessions (§3.4). Call once at runtime. */
export function startSessionSweep(intervalMs = 60 * 60 * 1000): void {
  if (globalForDb._dwSweep) return;
  globalForDb._dwSweep = setInterval(() => {
    pool.query("DELETE FROM sessions WHERE expires_at < now()").catch(() => {});
  }, intervalMs);
  // Don't keep the event loop alive solely for the sweep.
  globalForDb._dwSweep.unref?.();
}
